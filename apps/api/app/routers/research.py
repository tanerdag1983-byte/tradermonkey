from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.schemas import ResearchProposalSchema, UserSettingSchema
from app.services.market.sectors import (
    list_sectors as list_sector_names,
    get_symbols_for_sectors,
    resolve_research_universe,
)
from app.services.notifications import (
    build_research_digest_html,
    build_research_digest_text,
    send_email,
)
from app.services.research.runner import (
    generate_research_for_symbol,
    generate_research_for_watchlist,
)
from app.services.user_settings import (
    get_research_settings,
    update_research_settings,
)

router = APIRouter(prefix="/research", tags=["research"])


class GenerateResearchRequest(BaseModel):
    symbol: Optional[str] = None
    watchlist: Optional[List[str]] = None
    sectors: Optional[List[str]] = None
    budget: Optional[float] = Field(default=None, ge=1)
    currency: Optional[str] = "EUR"
    risk_profile: Optional[str] = "moderate"
    frequency: Optional[str] = "daily"  # daily / weekly / monthly


class ResearchSettingsPayload(BaseModel):
    budget: Optional[float] = Field(default=None, ge=1)
    currency: Optional[str] = None
    risk_profile: Optional[str] = None
    watchlist: Optional[List[str]] = None
    sectors: Optional[List[str]] = None


def _normalize_frequency(value: str) -> str:
    value = (value or "daily").lower()
    if value not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=422, detail="frequency must be daily, weekly or monthly")
    return value


@router.post("/generate", response_model=Dict[str, Any])
async def generate_research(
    request: GenerateResearchRequest,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Generate one or multiple research proposals for the current user."""
    settings = get_research_settings(db, user.id)

    budget = request.budget if request.budget is not None else float(settings["budget"])
    currency = (request.currency or settings["currency"]).upper()
    risk_profile = (request.risk_profile or settings["risk_profile"]).lower()
    frequency = _normalize_frequency(request.frequency)

    if request.symbol:
        result = await generate_research_for_symbol(
            db, user.id, request.symbol, budget, currency, risk_profile, frequency
        )
        if not result:
            raise HTTPException(status_code=500, detail="Research generation returned no result")
        return {"success": True, "results": [result]}

    watchlist = request.watchlist
    selected_sectors = request.sectors

    if not watchlist and not selected_sectors:
        selected_sectors = settings.get("sectors", [])
        if not selected_sectors and not settings.get("watchlist"):
            selected_sectors = list_sector_names()

    watchlist = resolve_research_universe(
        watchlist or [],
        selected_sectors or [],
    )
    if not watchlist:
        raise HTTPException(status_code=400, detail="No watchlist or sectors provided and default universe is empty")

    result = await generate_research_for_watchlist(
        db, user.id, watchlist, budget, currency, risk_profile, frequency
    )
    return result


@router.get("/proposals", response_model=List[ResearchProposalSchema])
async def list_proposals(
    frequency: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """List stored research proposals for the current user."""
    from app.models import ResearchProposal

    query = db.query(ResearchProposal).filter(ResearchProposal.user_id == user.id)
    if frequency:
        query = query.filter(ResearchProposal.frequency == frequency.lower())
    if direction:
        query = query.filter(ResearchProposal.direction == direction.upper())
    if status:
        query = query.filter(ResearchProposal.status == status.lower())
    proposals = (
        query.order_by(ResearchProposal.generated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return proposals


@router.get("/settings", response_model=Dict[str, Any])
async def get_settings(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Get the user's research default settings."""
    return get_research_settings(db, user.id)


@router.put("/settings", response_model=Dict[str, Any])
@router.post("/settings", response_model=Dict[str, Any])
async def save_settings(
    payload: ResearchSettingsPayload,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Save the user's research default settings."""
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    return update_research_settings(db, user.id, update)


@router.post("/proposals/{proposal_id}/status", response_model=ResearchProposalSchema)
async def update_proposal_status(
    proposal_id: str,
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Update the status of a research proposal (approved / rejected / reviewed).

    Body: {"status": "approved"}
    """
    from uuid import UUID
    from app.models import ResearchProposal

    try:
        proposal_uuid = UUID(proposal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid proposal ID")

    new_status = (request.get("status") or "").lower()
    if new_status not in {"approved", "rejected", "reviewed", "generated"}:
        raise HTTPException(status_code=400, detail="status must be approved, rejected, reviewed or generated")

    proposal = (
        db.query(ResearchProposal)
        .filter(ResearchProposal.id == proposal_uuid, ResearchProposal.user_id == user.id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    proposal.status = new_status
    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("/sectors", response_model=Dict[str, Any])
async def get_sectors(
    user: SupabaseUser = Depends(get_current_user),
):
    """Return the available sectors and their symbol mapping."""
    from app.services.market.sectors import SECTOR_SYMBOLS
    return {
        "sectors": list_sector_names(),
        "symbols_by_sector": {k: v for k, v in SECTOR_SYMBOLS.items()},
        "default_universe": resolve_research_universe([], []),
    }


@router.post("/digest", response_model=Dict[str, Any])
async def send_research_digest(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Send the latest research proposals to the user's email.

    Body: {"frequency": "daily", "limit": 10}
    """
    from app.models import ResearchProposal

    frequency = (request.get("frequency") or "daily").lower()
    limit = max(1, min(50, int(request.get("limit", 10))))

    proposals = (
        db.query(ResearchProposal)
        .filter(ResearchProposal.user_id == user.id, ResearchProposal.frequency == frequency)
        .order_by(ResearchProposal.generated_at.desc())
        .limit(limit)
        .all()
    )

    if not proposals:
        return {"sent": False, "detail": "No proposals found for this frequency"}

    if not user.email:
        return {"sent": False, "detail": "User has no email address"}

    currency = proposals[0].currency or "EUR"
    proposal_dicts = [
        {
            "symbol": p.symbol,
            "direction": p.direction,
            "entry_price": p.entry_price,
            "suggested_amount": p.suggested_amount,
            "thesis": p.thesis,
        }
        for p in proposals
    ]

    result = await send_email(
        to_email=user.email,
        subject=f"TraderMonkeys {frequency.capitalize()} Research Digest",
        html_body=build_research_digest_html(proposal_dicts, frequency, currency),
        text_body=build_research_digest_text(proposal_dicts, frequency, currency),
    )
    return result
