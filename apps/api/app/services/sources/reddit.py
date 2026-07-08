import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.services.sources.apify import ApifyClient

logger = logging.getLogger(__name__)


async def fetch(
    queries: List[str],
    subreddits: Optional[List[str]] = None,
    max_items: int = 20,
    client: Optional[ApifyClient] = None,
) -> List[Dict[str, Any]]:
    """Fetch Reddit posts matching the given search queries via Apify."""
    settings = get_settings()
    actor_id = settings.apify_reddit_actor_id
    if not actor_id:
        logger.warning("Apify Reddit actor not configured; skipping.")
        return []

    if client is None:
        client = ApifyClient(token=settings.apify_api_token)

    # trudax/reddit-scraper-lite expects 'searches' as a list of plain strings.
    searches = [q.strip() for q in queries if q and q.strip()]
    if not searches:
        return []

    run_input: Dict[str, Any] = {"searches": searches, "maxItems": max_items * 2, "sort": "new"}

    items = await client.run_actor(actor_id, run_input)
    logger.info("Apify Reddit run returned %d items", len(items))

    return [_normalize(item) for item in items]


def _normalize(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("title") or ""
    body = item.get("selftext") or item.get("body") or ""
    text = f"{title} {body}".strip()
    url = item.get("url") or item.get("permalink") or ""
    published = item.get("created_utc") or item.get("created")
    published_at = _to_datetime(published)

    return {
        "source": "reddit",
        "source_class": "social",
        "publisher": item.get("subreddit") or "reddit",
        "title": title or text[:120],
        "body": body,
        "language": "en",
        "published_at": published_at,
        "url": url,
        "entities": {},
    }


def _to_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)
