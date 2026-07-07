import asyncio
import logging
from datetime import datetime
from typing import List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.services.sources.ingestor import ingest_news
from app.services.signal.runner import generate_and_store_signal
from app.services.notifications import (
    build_research_digest_html,
    build_research_digest_text,
    send_email,
)
from app.services.research.runner import generate_research_for_watchlist

logger = logging.getLogger(__name__)


async def ingest_news_job():
    """Scheduled job to fetch news from all sources."""
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        logger.info("[scheduler] Starting scheduled news ingestion")
        result = await ingest_news(
            db,
            max_items_per_source=40,
            recency_hours=48,
        )
        logger.info("[scheduler] News ingestion completed: %s", result)
    except Exception as e:
        logger.exception("[scheduler] News ingestion failed: %s", e)
    finally:
        db.close()


async def generate_signals_job():
    """Scheduled job to generate signals for the default watchlist."""
    settings = get_settings()
    watchlist = [s.strip().upper() for s in settings.scheduler_default_watchlist.split(",") if s.strip()]
    user_id = settings.scheduler_user_id

    db: Session = SessionLocal()
    try:
        logger.info("[scheduler] Starting scheduled signal generation for %d symbols", len(watchlist))
        results = []
        for symbol in watchlist:
            try:
                signal = await generate_and_store_signal(
                    db,
                    user_id=user_id,
                    symbol=symbol,
                    skip_no_trade=True,
                )
                signal_id = signal.get("signal_id") or signal.get("request_id")
                results.append({
                    "symbol": symbol,
                    "status": signal.get("status"),
                    "stored": signal.get("stored", False),
                    "id": signal_id,
                })
            except Exception as e:
                logger.exception("[scheduler] Signal generation failed for %s: %s", symbol, e)
                results.append({"symbol": symbol, "status": "error", "error": str(e)})

        stored = [r for r in results if r.get("stored")]
        logger.info("[scheduler] Signal generation completed. Stored %d/%d signals", len(stored), len(results))
    except Exception as e:
        logger.exception("[scheduler] Signal generation job failed: %s", e)
    finally:
        db.close()


async def trigger_news_ingest_now() -> dict:
    await ingest_news_job()
    return {"success": True, "message": "News ingestion triggered"}


async def trigger_signal_generation_now() -> dict:
    await generate_signals_job()
    return {"success": True, "message": "Signal generation triggered"}


async def generate_research_job():
    """Scheduled job to generate research proposals for the default watchlist."""
    settings = get_settings()
    watchlist = [s.strip().upper() for s in settings.scheduler_default_watchlist.split(",") if s.strip()]
    user_id = settings.scheduler_user_id
    budget = float(getattr(settings, "research_default_budget", 1000.0))
    currency = getattr(settings, "research_default_currency", "EUR").upper()
    risk_profile = getattr(settings, "research_default_risk_profile", "moderate").lower()

    db: Session = SessionLocal()
    try:
        logger.info("[scheduler] Starting scheduled research generation for %d symbols", len(watchlist))
        result = await generate_research_for_watchlist(
            db, user_id, watchlist, budget, currency, risk_profile, frequency="daily"
        )
        logger.info(
            "[scheduler] Research generation completed. Stored %d/%d proposals",
            result.get("stored", 0),
            result.get("generated", 0),
        )
    except Exception as e:
        logger.exception("[scheduler] Research generation job failed: %s", e)
    finally:
        db.close()


async def trigger_research_generation_now() -> dict:
    await generate_research_job()
    return {"success": True, "message": "Research generation triggered"}


async def send_research_digest_job():
    """Scheduled job to email the latest research digest to the admin address."""
    settings = get_settings()
    admin_email = getattr(settings, "admin_email", "")
    if not admin_email or not getattr(settings, "resend_api_key", ""):
        logger.info("[scheduler] Digest job skipped: ADMIN_EMAIL or RESEND_API_KEY not set")
        return

    user_id = settings.scheduler_user_id
    db: Session = SessionLocal()
    try:
        from app.models import ResearchProposal
        proposals = (
            db.query(ResearchProposal)
            .filter(ResearchProposal.user_id == user_id, ResearchProposal.frequency == "daily")
            .order_by(ResearchProposal.generated_at.desc())
            .limit(10)
            .all()
        )
        if not proposals:
            logger.info("[scheduler] No research proposals to digest for user %s", user_id)
            return

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
            to_email=admin_email,
            subject="TraderMonkeys Daily Research Digest",
            html_body=build_research_digest_html(proposal_dicts, "daily", currency),
            text_body=build_research_digest_text(proposal_dicts, "daily", currency),
        )
        if result.get("sent"):
            logger.info("[scheduler] Research digest sent to %s", admin_email)
        else:
            logger.warning("[scheduler] Research digest failed: %s", result.get("detail"))
    except Exception as e:
        logger.exception("[scheduler] Research digest job failed: %s", e)
    finally:
        db.close()


async def trigger_research_digest_now() -> dict:
    await send_research_digest_job()
    return {"success": True, "message": "Research digest triggered"}


def build_scheduler() -> AsyncIOScheduler:
    """Build an APScheduler instance with configured jobs. Does not start it."""
    settings = get_settings()
    scheduler = AsyncIOScheduler(timezone=settings.scheduler_signals_timezone)

    # News ingestion every N minutes
    interval_minutes = max(5, settings.scheduler_news_interval_minutes)
    scheduler.add_job(
        ingest_news_job,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="ingest_news",
        name="Hourly news ingestion",
        replace_existing=True,
    )

    # Signal generation daily at configured market open time (US/Eastern default)
    # Format HH:MM
    time_parts = settings.scheduler_signals_time.split(":")
    hour = int(time_parts[0]) if time_parts else 9
    minute = int(time_parts[1]) if len(time_parts) > 1 else 30
    scheduler.add_job(
        generate_signals_job,
        trigger=CronTrigger(hour=hour, minute=minute, day_of_week="mon-fri"),
        id="generate_signals",
        name="Daily pre-market signal generation",
        replace_existing=True,
    )

    # Research proposal generation 30 minutes after signals, weekdays only
    research_minutes = hour * 60 + minute + 30
    research_hour = (research_minutes // 60) % 24
    research_minute = research_minutes % 60
    scheduler.add_job(
        generate_research_job,
        trigger=CronTrigger(hour=research_hour, minute=research_minute, day_of_week="mon-fri"),
        id="generate_research",
        name="Daily post-open research proposal generation",
        replace_existing=True,
    )

    # Email digest 60 minutes after research generation, weekdays only
    digest_minutes = research_minutes + 60
    digest_hour = (digest_minutes // 60) % 24
    digest_minute = digest_minutes % 60
    scheduler.add_job(
        send_research_digest_job,
        trigger=CronTrigger(hour=digest_hour, minute=digest_minute, day_of_week="mon-fri"),
        id="send_research_digest",
        name="Daily research digest email to admin",
        replace_existing=True,
    )

    return scheduler
