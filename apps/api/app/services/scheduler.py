import asyncio
import logging
from datetime import datetime, timezone
from typing import List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import TradeRecord, UserSetting, ResearchProposal
from app.services.sources.ingestor import ingest_news
from app.services.signal.runner import generate_and_store_signal
from app.services.notifications import (
    build_research_digest_html,
    build_research_digest_text,
    send_email,
)
from app.services.research.runner import generate_research_for_watchlist
from app.services.trade_journal import calculate_trade_stats
from app.services.llm.openrouter import OpenRouterClient

logger = logging.getLogger(__name__)


async def learning_loop_job():
    """Scheduled job to evaluate trade performance and update AI prompts with learned insights."""
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        logger.info("[scheduler] Starting learning loop evaluation")
        
        # Get all users who have closed trades
        user_ids = db.query(TradeRecord.user_id).filter(
            TradeRecord.status == "closed"
        ).distinct().all()
        user_ids = [uid[0] for uid in user_ids]
        
        for user_id in user_ids:
            stats = calculate_trade_stats(db, user_id)
            if stats["total_trades"] < 5:
                continue  # Need minimum trades for meaningful feedback
            
            # Generate learning summary
            learning_summary = _generate_learning_summary(stats)
            
            # Store/update user setting with learning insights
            existing = db.query(UserSetting).filter(
                UserSetting.user_id == user_id,
                UserSetting.key == "learning_insights"
            ).first()
            
            if existing:
                existing.value = learning_summary
                existing.updated_at = datetime.now(timezone.utc)
            else:
                new_setting = UserSetting(
                    user_id=user_id,
                    key="learning_insights",
                    value=learning_summary
                )
                db.add(new_setting)
            
            db.commit()
            logger.info("[scheduler] Updated learning insights for user %s", user_id)
        
        logger.info("[scheduler] Learning loop completed for %d users", len(user_ids))
    except Exception as e:
        logger.exception("[scheduler] Learning loop failed: %s", e)
    finally:
        db.close()


def _generate_learning_summary(stats: dict) -> dict:
    """Generate a concise learning summary from trade statistics."""
    return {
        "win_rate": round(stats["win_rate"], 1),
        "profit_factor": round(stats["profit_factor"], 2) if stats["profit_factor"] != float("inf") else "high",
        "avg_win": round(stats["avg_win"], 2),
        "avg_loss": round(stats["avg_loss"], 2),
        "avg_mfe": round(stats["avg_mfe"], 1),
        "avg_mae": round(stats["avg_mae"], 1),
        "total_trades": stats["total_trades"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "key_insight": _derive_key_insight(stats),
    }


def _derive_key_insight(stats: dict) -> str:
    """Derive a single actionable insight from trade statistics."""
    insights = []
    if stats["win_rate"] < 40:
        insights.append("Win rate below 40% - consider tightening entry criteria or reducing position size")
    elif stats["win_rate"] > 60:
        insights.append("Win rate above 60% - current strategy working well")
    
    if stats["profit_factor"] != float("inf") and stats["profit_factor"] < 1.5:
        insights.append("Profit factor below 1.5 - review risk/reward ratios")
    
    if stats["avg_mae"] < -3:
        insights.append("Average adverse excursion exceeds 3% - tighten stop losses")
    
    if stats["avg_mfe"] > 5 and stats["avg_mae"] > -2:
        insights.append("Good MFE/MAE ratio - consider scaling winners")
    
    return "; ".join(insights) if insights else "No significant patterns detected"


async def learning_loop_now() -> dict:
    await learning_loop_job()
    return {"success": True, "message": "Learning loop evaluation triggered"}


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


async def send_research_digest_job(force: bool = False):
    """Scheduled job to email the latest research digest to the admin address.

    Args:
        force: When True, send even if ENABLE_EMAIL_DIGEST is false. Used by the manual trigger endpoint.
    """
    settings = get_settings()
    if not force and not getattr(settings, "enable_email_digest", False):
        logger.info("[scheduler] Digest job skipped: ENABLE_EMAIL_DIGEST is not true")
        return

    admin_email = getattr(settings, "admin_email", "")
    if not admin_email or not getattr(settings, "resend_api_key", ""):
        logger.info("[scheduler] Digest job skipped: ADMIN_EMAIL or RESEND_API_KEY not set")
        return

    user_id = settings.scheduler_user_id
    db: Session = SessionLocal()
    try:
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
    await send_research_digest_job(force=True)
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

    # Learning loop daily at 18:00 (after market close), weekdays only
    scheduler.add_job(
        learning_loop_job,
        trigger=CronTrigger(hour=18, minute=0, day_of_week="mon-fri"),
        id="learning_loop",
        name="Daily trade performance learning loop",
        replace_existing=True,
    )

    return scheduler