from fastapi import APIRouter, Depends, HTTPException
from app.config import get_settings
from app.dependencies.auth import get_current_user, SupabaseUser
from app.services.scheduler import (
    trigger_news_ingest_now,
    trigger_signal_generation_now,
    trigger_research_generation_now,
    trigger_research_digest_now,
)

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


def _assert_enabled():
    if not get_settings().enable_scheduler:
        raise HTTPException(status_code=400, detail="Scheduler is not enabled. Set ENABLE_SCHEDULER=true to use this endpoint.")


@router.post("/trigger/news")
async def trigger_news_ingestion(
    user: SupabaseUser = Depends(get_current_user),
):
    """Manually trigger the scheduled news ingestion job."""
    _assert_enabled()
    return await trigger_news_ingest_now()


@router.post("/trigger/signals")
async def trigger_signal_generation(
    user: SupabaseUser = Depends(get_current_user),
):
    """Manually trigger the scheduled signal generation job."""
    _assert_enabled()
    return await trigger_signal_generation_now()


@router.post("/trigger/research")
async def trigger_research_generation(
    user: SupabaseUser = Depends(get_current_user),
):
    """Manually trigger the scheduled research proposal generation job."""
    _assert_enabled()
    return await trigger_research_generation_now()


@router.post("/trigger/research-digest")
async def trigger_research_digest(
    user: SupabaseUser = Depends(get_current_user),
):
    """Manually trigger the research digest email job."""
    _assert_enabled()
    return await trigger_research_digest_now()


@router.get("/config")
async def get_scheduler_config(
    user: SupabaseUser = Depends(get_current_user),
):
    """Show current scheduler configuration (without secrets)."""
    settings = get_settings()
    return {
        "enabled": settings.enable_scheduler,
        "news_interval_minutes": settings.scheduler_news_interval_minutes,
        "signals_time": settings.scheduler_signals_time,
        "signals_timezone": settings.scheduler_signals_timezone,
        "default_watchlist": [s.strip() for s in settings.scheduler_default_watchlist.split(",") if s.strip()],
        "user_id": settings.scheduler_user_id,
        "research": {
            "default_budget": float(getattr(settings, "research_default_budget", 1000.0)),
            "default_currency": getattr(settings, "research_default_currency", "EUR").upper(),
            "default_risk_profile": getattr(settings, "research_default_risk_profile", "moderate").lower(),
        },
    }
