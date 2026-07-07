import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.services.llm.openrouter import OpenRouterClient
from app.config import get_settings


DEFAULT_RESEARCH_PROMPT = """You are an independent equity research assistant helping a retail investor make buy/hold/sell decisions.

TASK
Analyze the provided watchlist and current market/news context. For each symbol decide whether it is a BUY, HOLD or SELL idea and provide a concrete, actionable proposal.

INPUT
- risk_profile: {risk_profile}
- budget: {budget} {currency}
- portfolio: {portfolio}
- watchlist: {watchlist}
- market_context_per_symbol: {market_states}
- recent_news: {sources}

OUTPUT RULES
Respond ONLY as a single JSON object. No markdown, no extra text.
Top-level key must be "proposals" containing a list of objects with exactly these fields:
- symbol: string
- direction: one of "BUY", "HOLD", "SELL"
- confidence: float between 0 and 1
- thesis: concise explanation (1-3 sentences)
- entry_price: float (current or preferred buy price)
- stop_loss: float
- take_profit: list of 1 or 2 target prices, e.g. [target1, target2]
- suggested_amount: float in {currency}
- quantity: number of shares/units (suggested_amount / entry_price, rounded)

GUIDELINES
- Conservative profiles: require strong technical confirmation and official news; keep individual positions small.
- Moderate profiles: balanced mix of chart and news, normal stops.
- Aggressive profiles: momentum and rumors allowed, wider stops.
- Never recommend using the entire budget on a single name; diversify across proposals.
- For HOLD: explain why current holders should keep the position and what price would flip it to SELL or BUY.
- For SELL: explain why existing holders should reduce/exit, and include the current price as entry_price.
- Suggested amount should cover at least one whole share and never exceed roughly 30% of the available budget.
- If data is missing, conflicting, or stale: use direction HOLD with low confidence and explain why.
- Portfolio awareness:
  - Before suggesting BUY, check the portfolio positions.
  - If the user already holds the symbol and it represents a large portion of the portfolio (above ~15%), lean toward HOLD or SELL-add rather than a new BUY.
  - If the user has no exposure to a promising sector, prefer adding a new idea over increasing an existing oversized position.
  - Avoid recommending the same sector repeatedly unless the user explicitly asked to focus there.
"""


def get_research_prompt_template() -> str:
    settings = get_settings()
    path = getattr(settings, "research_prompt_override_path", None)
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            pass
    return DEFAULT_RESEARCH_PROMPT


async def generate_research_proposals(
    watchlist: List[str],
    portfolio: Dict[str, Any],
    market_states: Dict[str, Dict[str, Any]],
    sources: List[Dict[str, Any]],
    budget: float,
    currency: str,
    risk_profile: str,
) -> List[Dict[str, Any]]:
    """Generate research proposals for a watchlist."""
    request_id = f"res-{datetime.utcnow().timestamp()}"
    client = OpenRouterClient()
    prompt = get_research_prompt_template().format(
        risk_profile=risk_profile,
        budget=budget,
        currency=currency,
        portfolio=json.dumps(portfolio, default=str),
        watchlist=json.dumps(watchlist),
        market_states=json.dumps(market_states, default=str),
        sources=json.dumps(sources, default=str),
    )

    messages = [
        {"role": "system", "content": "You are a financial research assistant. Output only JSON."},
        {"role": "user", "content": prompt},
    ]

    try:
        response = await client.chat_completion(
            messages=messages,
            model="openai/gpt-4o-mini",
            temperature=0.2,
            max_tokens=2000,
        )
        content = response["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
        data = json.loads(content)
        proposals = data.get("proposals", [])
        for p in proposals:
            p["request_id"] = request_id
        return proposals
    except Exception as e:
        return [{"request_id": request_id, "error": str(e)}]
