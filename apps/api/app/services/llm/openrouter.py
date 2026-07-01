import httpx
from typing import Dict, Any, Optional
from app.config import get_settings


class OpenRouterClient:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openrouter_api_key
        self.base_url = base_url or settings.openrouter_base_url

    async def chat_completion(
        self,
        messages: list,
        model: str = "anthropic/claude-3.5-sonnet",
        temperature: float = 0.1,
        max_tokens: int = 2000,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("OpenRouter API key is required")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
