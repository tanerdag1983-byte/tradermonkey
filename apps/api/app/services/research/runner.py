from datetime import datetime
from typing import Dict, Any, List, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import ResearchProposal
from app.services.research.engine import generate_research_proposals
from app.services.signal.runner import (
    build_portfolio_summary,
    build_market_state,
    collect_sources_for_symbol,
)


from app.services.market.sectors import SECTOR_SYMBOLS


MAX_POSITION_PCT = 0.25
MAX_ALLOCATED_POSITIONS = 5


def _round_amount(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def _round_quantity(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 4)


def allocate_budget_to_proposals(
    proposals: List[Dict[str, Any]], budget: float
) -> Dict[str, Any]:
    """Allocate budget across BUY proposals and return also-interesting alternatives."""
    valid = [
        p for p in proposals
        if not p.get("error")
        and p.get("entry_price")
        and p.get("suggested_amount")
        and p.get("direction") in {"BUY", "HOLD"}
    ]

    buy_candidates = sorted(
        [p for p in valid if p.get("direction") == "BUY"],
        key=lambda x: x.get("confidence") or 0,
        reverse=True,
    )[:MAX_ALLOCATED_POSITIONS]

    remaining = budget
    allocated: List[Dict[str, Any]] = []

    for p in buy_candidates:
        entry = float(p["entry_price"])
        if not entry or entry <= 0 or remaining <= 0 or entry > remaining:
            continue

        # How many whole shares fit in 25% of the budget?
        max_by_position_pct = int((budget * MAX_POSITION_PCT) // entry)
        # How many whole shares fit in remaining budget?
        max_by_remaining = int(remaining // entry)

        # Always allow at least one share if it still fits in the total budget,
        # even when one share costs more than 25% of the budget.
        quantity = min(max_by_remaining, max(max_by_position_pct, 1))
        if quantity < 1:
            continue

        allocated_amount = round(quantity * entry, 2)
        remaining = round(remaining - allocated_amount, 2)

        allocated.append({
            "id": p.get("id"),
            "symbol": p.get("symbol"),
            "direction": p.get("direction"),
            "entry_price": p.get("entry_price"),
            "stop_loss": p.get("stop_loss"),
            "take_profit_1": p.get("take_profit", [None, None])[0],
            "take_profit_2": p.get("take_profit", [None, None])[1],
            "allocated_amount": allocated_amount,
            "quantity": quantity,
            "confidence": p.get("confidence"),
            "thesis": p.get("thesis"),
            "currency": p.get("currency"),
        })

        if remaining <= 0:
            break

    # Also interesting = other proposals not allocated, sorted by confidence.
    # We include all directions (BUY/HOLD/SELL) because a sell idea can be just as relevant.
    allocated_ids = {a.get("id") for a in allocated}
    also_interesting_candidates = [
        p for p in proposals
        if not p.get("error")
        and p.get("id") not in allocated_ids
        and p.get("direction") in {"BUY", "HOLD", "SELL"}
        and p.get("entry_price")
        and (p.get("confidence") or 0) > 0
    ]
    also_interesting = [
        {
            "id": p.get("id"),
            "symbol": p.get("symbol"),
            "direction": p.get("direction"),
            "entry_price": p.get("entry_price"),
            "stop_loss": p.get("stop_loss"),
            "take_profit_1": p.get("take_profit", [None, None])[0],
            "take_profit_2": p.get("take_profit", [None, None])[1],
            "confidence": p.get("confidence"),
            "thesis": p.get("thesis"),
            "currency": p.get("currency"),
        }
        for p in sorted(also_interesting_candidates, key=lambda x: x.get("confidence") or 0, reverse=True)
    ]

    return {
        "allocated": allocated,
        "also_interesting": also_interesting,
        "total_allocated": round(budget - remaining, 2),
        "remaining_budget": remaining,
    }


def normalize_take_profit(take_profit: Any) -> List[Optional[float]]:
    if isinstance(take_profit, list):
        values = [float(v) if v is not None else None for v in take_profit]
        return [values[0] if values else None, values[1] if len(values) > 1 else None]
    if take_profit is not None:
        return [float(take_profit), None]
    return [None, None]


async def generate_research_for_symbol(
    db: Session,
    user_id: str,
    symbol: str,
    budget: float,
    currency: str,
    risk_profile: str,
    frequency: str = "daily",
) -> Optional[Dict[str, Any]]:
    """Generate a single research proposal for a symbol and persist it."""
    symbol = str(symbol).upper()

    portfolio = build_portfolio_summary(db, user_id)
    portfolio["budget"] = budget
    portfolio["currency"] = currency
    portfolio["risk_profile"] = risk_profile

    # Add sector exposure based on current positions
    sector_exposure: Dict[str, float] = {}
    symbol_to_sector = {sym: sector for sector, syms in SECTOR_SYMBOLS.items() for sym in syms}
    for pos in portfolio.get("positions", []):
        sector = symbol_to_sector.get(pos["symbol"], "unknown")
        sector_exposure[sector] = sector_exposure.get(sector, 0) + (pos.get("market_value") or 0)
    portfolio["sector_exposure"] = sector_exposure

    market_state = build_market_state(db, symbol)
    sources = collect_sources_for_symbol(db, symbol)

    proposals = await generate_research_proposals(
        watchlist=[symbol],
        portfolio=portfolio,
        market_states={symbol: market_state},
        sources=sources,
        budget=budget,
        currency=currency,
        risk_profile=risk_profile,
    )

    if not proposals or not isinstance(proposals, list):
        return None

    proposal = proposals[0]
    if proposal.get("error"):
        return proposal

    direction = str(proposal.get("direction", "HOLD")).upper()
    if direction not in {"BUY", "HOLD", "SELL"}:
        direction = "HOLD"

    suggested_amount = _to_float(proposal.get("suggested_amount"))
    if suggested_amount is not None:
        suggested_amount = min(suggested_amount, budget * MAX_POSITION_PCT)
    entry_price = _to_float(proposal.get("entry_price"))
    quantity = _to_float(proposal.get("quantity"))
    if entry_price and suggested_amount:
        quantity = round(suggested_amount / entry_price, 4)
    elif quantity is None and suggested_amount and entry_price:
        quantity = round(suggested_amount / entry_price, 4)

    stop_loss = _to_float(proposal.get("stop_loss"))
    take_profit_1, take_profit_2 = normalize_take_profit(proposal.get("take_profit"))

    # Normalize proposal values (cap amount at 25% of budget, ensure direction valid)
    proposal["direction"] = direction
    proposal["entry_price"] = entry_price
    proposal["stop_loss"] = stop_loss
    proposal["take_profit"] = [take_profit_1, take_profit_2]
    proposal["suggested_amount"] = suggested_amount
    proposal["quantity"] = quantity
    proposal["confidence"] = _to_float(proposal.get("confidence"))
    proposal["budget"] = budget
    proposal["currency"] = currency
    proposal["risk_profile"] = risk_profile

    db_proposal = ResearchProposal(
        id=uuid4(),
        user_id=user_id,
        symbol=symbol,
        frequency=frequency.lower(),
        direction=direction,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit_1=take_profit_1,
        take_profit_2=take_profit_2,
        quantity=quantity,
        suggested_amount=suggested_amount,
        confidence=proposal["confidence"],
        thesis=proposal.get("thesis", ""),
        budget=budget,
        currency=currency,
        risk_profile=risk_profile,
        analysis_json=proposal,
        generated_at=datetime.utcnow(),
    )
    db.add(db_proposal)
    db.commit()

    proposal["id"] = str(db_proposal.id)
    proposal["stored"] = True
    return proposal


async def generate_research_for_watchlist(
    db: Session,
    user_id: str,
    watchlist: List[str],
    budget: float,
    currency: str,
    risk_profile: str,
    frequency: str = "daily",
) -> Dict[str, Any]:
    """Generate proposals for every symbol in the watchlist and return summary."""
    results = []
    stored = 0
    for symbol in watchlist:
        symbol = str(symbol).upper().strip()
        if not symbol:
            continue
        try:
            result = await generate_research_for_symbol(
                db, user_id, symbol, budget, currency, risk_profile, frequency=frequency
            )
        except Exception as e:
            result = {"symbol": symbol, "error": str(e)}
        results.append(result)
        if result and result.get("stored"):
            stored += 1

    return {
        "success": True,
        "generated": len(results),
        "stored": stored,
        "results": results,
        **allocate_budget_to_proposals(results, budget),
    }


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
