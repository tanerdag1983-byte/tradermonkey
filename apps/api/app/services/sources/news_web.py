import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.services.sources.apify import ApifyClient

logger = logging.getLogger(__name__)


async def fetch(
    queries: List[str],
    max_items: int = 20,
    client: Optional[ApifyClient] = None,
) -> List[Dict[str, Any]]:
    """Fetch recent web news articles for the given search queries via Apify."""
    settings = get_settings()
    actor_id = settings.apify_news_actor_id
    if not actor_id:
        logger.warning("Apify news actor not configured; skipping.")
        return []

    if client is None:
        client = ApifyClient(token=settings.apify_api_token)

    results: List[Dict[str, Any]] = []
    for query in queries:
        if not query.strip():
            continue
        # easyapi/google-news-scraper expects a single string query and maxItems >= 100.
        run_input = {
            "query": query,
            "maxItems": max(max_items, 100),
            "sort": "new",
        }
        items = await client.run_actor(actor_id, run_input)
        results.extend(items)
        logger.info("Apify news query '%s' returned %d items", query, len(items))

    return [_normalize(item) for item in results]


def _normalize(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("title") or ""
    snippet = item.get("snippet") or ""
    body = item.get("text") or item.get("content") or snippet
    url = item.get("link") or item.get("url") or ""
    publisher = item.get("source") or item.get("domain") or "news"
    published = item.get("date_utc") or item.get("date") or item.get("publishedAt") or item.get("published_at")
    published_at = _to_datetime(published)
    language = item.get("language") or "en"

    return {
        "source": "apify-news",
        "source_class": "news",
        "publisher": publisher,
        "title": title,
        "body": body,
        "language": language,
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
