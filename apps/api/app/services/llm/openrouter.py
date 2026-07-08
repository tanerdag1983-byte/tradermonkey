import httpx
from typing import Dict, Any, Optional
from urllib.parse import urljoin
from app.config import get_settings


class OpenRouterClient:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openrouter_api_key
        self.base_url = self._normalize_base_url(base_url or settings.openrouter_base_url)

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        """Ensure the base URL points to the API root, not the completions endpoint."""
        if not base_url:
            return "https://openrouter.ai/api/v1"
        base = base_url.rstrip("/")
        # Guard against env vars that contain the full endpoint path.
        if base.endswith("/chat/completions"):
            base = base[: -len("/chat/completions")]
        return base

    async def chat_completion(
        self,
        messages: list,
        model: str = "anthropic/claude-sonnet-5",
        temperature: float = 0.1,
        max_tokens: int = 2000,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("OpenRouter API key is required")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://tradermonkeys.app",
            "X-Title": "TraderMonkeys",
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        url = urljoin(self.base_url + "/", "chat/completions")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 401:
                raise ValueError("OpenRouter authentication failed: check OPENROUTER_API_KEY")
            if response.status_code == 404:
                raise ValueError(f"OpenRouter endpoint not found: {url} (check OPENROUTER_BASE_URL)")
            response.raise_for_status()
            return response.json()
