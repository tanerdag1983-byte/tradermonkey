import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 90
POLL_INTERVAL_SECONDS = 2


class ApifyClient:
    """Async HTTP client for running Apify actors and fetching their dataset."""

    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.base_url = "https://api.apify.com/v2"

    def _require_token(self) -> bool:
        if not self.token:
            logger.warning("Apify token not configured; skipping Apify-based sources.")
            return False
        return True

    async def run_actor(
        self,
        actor_id: str,
        run_input: Dict[str, Any],
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        max_items: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Start an Apify actor run, wait for it, and return dataset items."""
        if not self._require_token():
            return []

        if "/" not in actor_id:
            logger.warning("Apify actor id should be in 'owner/actor' format: %s", actor_id)
            return []

        try:
            run_id, dataset_id = await self._start_run(actor_id, run_input, timeout_seconds)
            if not dataset_id:
                return []
            return await self._fetch_dataset(dataset_id, max_items=max_items)
        except Exception as exc:
            logger.warning("Apify run failed for %s: %s", actor_id, exc)
            return []

    async def _start_run(
        self,
        actor_id: str,
        run_input: Dict[str, Any],
        timeout_seconds: int,
    ) -> tuple[Optional[str], Optional[str]]:
        url = f"{self.base_url}/acts/{actor_id}/runs"
        params = {"token": self.token, "timeout": timeout_seconds}
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds + 15)) as client:
            response = await client.post(url, params=params, json=run_input)
            response.raise_for_status()
            data = response.json().get("data", {})
            return data.get("id"), data.get("defaultDatasetId")

    async def _fetch_dataset(
        self,
        dataset_id: str,
        max_items: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/datasets/{dataset_id}/items"
        params: Dict[str, Any] = {"token": self.token, "format": "json", "clean": "true"}
        if max_items:
            params["limit"] = max_items

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json() or []
