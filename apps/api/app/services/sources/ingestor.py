import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import NewsItem
from app.services.sources.sec_edgar import SECConnector
from app.services.sources.rss import RSSConnector
from app.services.sources.dedup import is_duplicate
from app.services.ml.sentiment import analyze_sentiment, sentiment_to_score
from app.services.sources.normalizer import normalize_symbol

logger = logging.getLogger(__name__)


async def ingest_news(
    db: Session,
    queries: Optional[List[str]] = None,
    max_items_per_source: int = 40,
    recency_hours: int = 48,
) -> Dict[str, Any]:
    """Fetch news from all sources, deduplicate, analyze sentiment and store."""
    settings = get_settings()
    sec = SECConnector()
    rss = RSSConnector()

    raw_items = []
    try:
        raw_items.extend(await sec.fetch())
    except Exception as e:
        print(f"SEC EDGAR fetch failed: {e}")

    try:
        raw_items.extend(await rss.fetch_all())
    except Exception as e:
        print(f"RSS fetch failed: {e}")

    # Apify-backed sources (optional; skipped when token/actor ids not configured)
    apify_max = min(max_items_per_source, settings.apify_max_results_per_source or 20)
    search_queries = queries or _default_search_queries()

    logger.info(
        "Apify sources config: token=%s reddit=%s twitter=%s news=%s",
        "set" if settings.apify_api_token else "missing",
        settings.apify_reddit_actor_id or "none",
        settings.apify_twitter_actor_id or "none",
        settings.apify_news_actor_id or "none",
    )

    try:
        from app.services.sources.reddit import fetch as fetch_reddit
        from app.services.sources.twitter_x import fetch as fetch_twitter
        from app.services.sources.news_web import fetch as fetch_news_web

        reddit_items, twitter_items, news_items = await asyncio.gather(
            fetch_reddit(queries=search_queries, max_items=apify_max),
            fetch_twitter(queries=search_queries, max_items=apify_max),
            fetch_news_web(queries=search_queries, max_items=apify_max),
            return_exceptions=True,
        )
        for result, name in [(reddit_items, "reddit"), (twitter_items, "twitter"), (news_items, "news_web")]:
            if isinstance(result, Exception):
                logger.warning("%s fetch failed: %s", name, result)
            else:
                logger.info("%s fetch returned %d raw items", name, len(result))
                raw_items.extend(result)
    except Exception as e:
        logger.warning("Apify-backed source import failed: %s", e)

    # Normalize dates and drop very old items
    cutoff = datetime.utcnow() - timedelta(hours=recency_hours)
    filtered = []
    for item in raw_items:
        published = item.get("published_at")
        if not isinstance(published, datetime):
            continue
        # Ensure we compare naive datetimes
        if published.tzinfo:
            published = published.replace(tzinfo=None)
        if published < cutoff:
            continue
        item["published_at"] = published
        filtered.append(item)

    # Sort descending by date and cap per source
    filtered.sort(key=lambda x: x.get("published_at") or datetime.min, reverse=True)
    per_source = {}
    capped = []
    for item in filtered:
        source = item.get("source", "unknown")
        if per_source.get(source, 0) >= max_items_per_source:
            continue
        per_source[source] = per_source.get(source, 0) + 1
        capped.append(item)

    stored = 0
    skipped = 0
    seen_titles = set()

    for item in capped:
        title = item.get("title", "")
        normalized_title = title.strip().lower()
        if not title or normalized_title in seen_titles or is_duplicate(db, title, item.get("published_at")):
            skipped += 1
            continue
        seen_titles.add(normalized_title)

        text = f"{title}. {item.get('body', '')}".strip()
        sentiment = analyze_sentiment(text, item.get("language"))
        sentiment_score = sentiment_to_score(sentiment["label"], sentiment["score"])

        entities = item.get("entities", {}) or {}
        ticker_candidates = _extract_tickers(title, item.get("body", ""))
        if ticker_candidates:
            entities["tickers"] = ticker_candidates

        news = NewsItem(
            source=item.get("source", "unknown"),
            source_class=item.get("source_class", "editorial"),
            publisher=item.get("publisher"),
            title=title,
            body=item.get("body"),
            language=item.get("language", "en"),
            published_at=item.get("published_at"),
            sentiment_score=sentiment_score,
            entities=entities,
            url=item.get("url"),
        )
        db.add(news)
        stored += 1

    db.commit()
    return {
        "stored": stored,
        "skipped": skipped,
        "total_raw": len(raw_items),
        "considered": len(capped),
    }


def _default_search_queries() -> List[str]:
    """Default search queries when none are supplied."""
    settings = get_settings()
    watchlist = [s.strip().upper() for s in settings.scheduler_default_watchlist.split(",") if s.strip()]
    # Search both as cashtags and general keywords
    queries = []
    for symbol in watchlist[:10]:
        queries.append(f"${symbol}")
        queries.append(symbol)
    return queries


def _extract_tickers(title: str, body: str) -> List[str]:
    """Very simple ticker extraction. Returns normalized candidates."""
    import re
    combined = f"{title} {body}".upper()
    matches = set()
    for m in re.finditer(r"\$([A-Z]{1,5})", combined):
        matches.add(normalize_symbol(m.group(1)))
    for m in re.finditer(r"\(([A-Z]{1,5})\)", combined):
        matches.add(normalize_symbol(m.group(1)))
    return [m for m in matches if m]


def get_news_feed(db: Session, limit: int = 50) -> List[Dict[str, Any]]:
    items = db.query(NewsItem).order_by(NewsItem.published_at.desc()).limit(limit).all()
    return [
        {
            "id": str(n.id),
            "source": n.source,
            "source_class": n.source_class,
            "publisher": n.publisher,
            "title": n.title,
            "body": n.body[:500] if n.body else None,
            "language": n.language,
            "published_at": n.published_at.isoformat() if n.published_at else None,
            "sentiment_score": n.sentiment_score,
            "entities": n.entities,
            "url": n.url,
        }
        for n in items
    ]
