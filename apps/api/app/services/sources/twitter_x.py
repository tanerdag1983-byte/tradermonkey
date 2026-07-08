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
    """X/Twitter source using an Apify actor.

Recommended production actor (pay-per-result):
  kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest

Configure the actor id via APIFY_TWITTER_ACTOR_ID.
"""
    settings = get_settings()
    actor_id = settings.apify_twitter_actor_id
    if not actor_id:
        logger.warning("Apify X/Twitter actor not configured; skipping.")
        return []

    if client is None:
        client = ApifyClient(token=settings.apify_api_token)

    results: List[Dict[str, Any]] = []
    for query in queries:
        if not query.strip():
            continue
        run_input = {"searchTerms": [query], "maxItems": max_items}
        items = await client.run_actor(actor_id, run_input)
        results.extend(items)
        logger.info("Apify X/Twitter query '%s' returned %d items", query, len(items))

    return [_normalize(item) for item in results]


def _normalize(item: Dict[str, Any]) -> Dict[str, Any]:
    text = item.get("text") or item.get("full_text") or ""
    url = item.get("url") or ""
    author = item.get("author") or {}
    if isinstance(author, dict):
        author_name = author.get("userName") or author.get("username") or author.get("name") or "x"
    else:
        author_name = "x"
    created = item.get("createdAt") or item.get("created_at") or item.get("date")
    published_at = _to_datetime(created)

    return {
        "source": "x",
        "source_class": "social",
        "publisher": author_name,
        "title": text[:120],
        "body": text,
        "language": item.get("lang") or "en",
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
        # Try ISO format first, then common formats.
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(str(value), "%a %b %d %H:%M:%S %z %Y").astimezone(timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)
