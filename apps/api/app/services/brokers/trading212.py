import base64
from typing import Optional, Dict, Any
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import get_settings


class Trading212Client:
    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None, base_url: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.t212_api_key
        self.api_secret = api_secret or settings.t212_api_secret
        self.base_url = base_url or settings.t212_base_url

        if not self.api_key or not self.api_secret:
            raise ValueError("Trading 212 API key and secret are required")

        credentials = base64.b64encode(f"{self.api_key}:{self.api_secret}".encode()).decode()
        self.headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=self._url(path),
                headers=self.headers,
                **kwargs,
            )
            response.raise_for_status()
            return response.json()

    async def get_account_summary(self) -> Dict[str, Any]:
        return await self.request("GET", "/api/v0/equity/account/summary")

    async def get_positions(self, ticker: Optional[str] = None) -> list:
        params = {"ticker": ticker} if ticker else {}
        return await self.request("GET", "/api/v0/equity/positions", params=params)

    async def get_open_orders(self) -> list:
        return await self.request("GET", "/api/v0/equity/orders")

    async def place_market_order(self, ticker: str, quantity: float, extended_hours: bool = False) -> Dict[str, Any]:
        payload = {"ticker": ticker, "quantity": quantity, "extendedHours": extended_hours}
        return await self.request("POST", "/api/v0/equity/orders/market", json=payload)

    async def health_check(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    self._url("/api/v0/equity/account/summary"),
                    headers=self.headers,
                )
                response.raise_for_status()
                summary = response.json()
            return {
                "reachable": True,
                "account_id": summary.get("id"),
                "currency": summary.get("currency"),
                "total_balance": summary.get("totalBalance"),
            }
        except httpx.HTTPStatusError as e:
            return {
                "reachable": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text[:500]}",
            }
        except Exception as e:
            return {"reachable": False, "error": str(e)}
