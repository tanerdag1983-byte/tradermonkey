import logging
from typing import Dict, Any, Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class AlpacaClient:
    """Alpaca Markets API client (paper or live)."""

    def __init__(self, api_key: Optional[str] = None, secret_key: Optional[str] = None, base_url: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.alpaca_api_key
        self.secret_key = secret_key or settings.alpaca_secret_key
        self.base_url = base_url or settings.alpaca_base_url

    def _headers(self) -> Dict[str, str]:
        if not self.api_key or not self.secret_key:
            raise ValueError("Alpaca API key and secret key are required")
        return {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
            "Content-Type": "application/json",
        }

    async def get_account(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{self.base_url}/v2/account", headers=self._headers())
            response.raise_for_status()
            return response.json()

    async def get_positions(self) -> list:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{self.base_url}/v2/positions", headers=self._headers())
            response.raise_for_status()
            return response.json()

    async def submit_order(
        self,
        symbol: str,
        side: str,  # buy or sell
        qty: float,
        order_type: str = "market",  # market, limit, stop, stop_limit
        time_in_force: str = "day",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Submit an order to Alpaca."""
        payload: Dict[str, Any] = {
            "symbol": symbol,
            "side": side.lower(),
            "qty": str(qty),
            "type": order_type,
            "time_in_force": time_in_force,
        }
        if limit_price:
            payload["limit_price"] = str(limit_price)
        if stop_price:
            payload["stop_price"] = str(stop_price)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/orders",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            return response.json()
