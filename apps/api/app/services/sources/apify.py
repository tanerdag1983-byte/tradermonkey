import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 180


class ApifyClient:
    """Async HTTP client for running Apify actors and fetching their dataset."""

    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.base_url = "https://api.apify.com/v2"

    def _url_actor_id(self, actor_id: str) -> str:
        """Apify API paths expect username~actorName, not username/actorName."""
        return actor_id.replace("/", "~")

    async def run_actor(
        self,
        actor_id: str,
        run_input: Dict[str, Any],
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> List[Dict[str, Any]]:
        """Run an Apify actor synchronously and return the produced dataset items.

        Uses the run-sync-get-dataset-items endpoint so we don't have to poll.
        """
        if not actor_id:
            logger.warning("Apify actor id is empty")
            return []

        if not self.token:
            logger.warning("Apify token not configured; skipping Apify-based sources.")
            return []

        url = f"{self.base_url}/acts/{self._url_actor_id(actor_id)}/run-sync-get-dataset-items"
        params = {"token": self.token, "timeout": timeout_seconds}

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds + 15)) as client:
                response = await client.post(url, params=params, json=run_input)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list):
                    logger.info("Apify actor %s returned %d items", actor_id, len(data))
                    return data
                if isinstance(data, dict) and data.get("error"):
                    logger.warning("Apify actor %s returned error: %s", actor_id, data)
                    return []
                if isinstance(data, dict):
                    # Some actors wrap items under a 'data' key; fall back to that.
                    nested = data.get("data")
                    if isinstance(nested, list):
                        return nested
                logger.warning("Apify actor %s returned unexpected response shape: %s", actor_id, data)
                return []
        except Exception as exc:
            logger.warning("Apify run failed for %s: %s", actor_id, exc)
            return []
