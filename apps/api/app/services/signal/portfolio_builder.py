import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.services.llm.openrouter import OpenRouterClient
from app.services.signal.engine import get_signal_prompt_template


DEFAULT_PORTFOLIO_BUILDER_PROMPT = """You are a Portfolio Allocation Advisor for a regulated/risk-limited paper trading platform.

GOAL
- Given a cash budget, recent market data, news, sentiment and rumors, propose a diversified portfolio allocation across the provided watchlist.
- Return ONLY valid JSON.
- Never allocate more than the budget.
- Prefer liquid ETFs and large-cap stocks. Avoid over-concentration.

INPUT
- request_id: {request_id}
- budget: {budget}
- currency: {currency}
- risk_profile: {risk_profile}
- market_regime: {market_regime}
- watchlist: {watchlist}

WATCHLIST ITEM STRUCTURE
Each item contains:
- symbol
- market_context: RSI, trend, support/resistance, candles, volume
- news_summary: latest titles and sentiment scores
- recent_close: last closing price
- atr_14: volatility estimate

OUTPUT RULES
- status: "ALLOCATION" or "NO_ALLOCATION"
- For each selected symbol, include:
  - symbol
  - direction (always "BUY" for now)
  - allocated_budget: amount in {currency}
  - quantity: integer or fractional share count
  - entry_price: suggested limit or market reference price
  - stop_loss: based on support or 1.5 * ATR below entry
  - take_profit: [1R, 2R] or structural level
  - confidence: 0.0-1.0
  - thesis: why this allocation
- Include a summary total_allocated and cash_remaining.
- The total allocated must never exceed the budget.
"""


def _build_portfolio_prompt(
    request_id: str,
    budget: float,
    currency: str,
    risk_profile: str,
    market_regime: str,
    watchlist: List[Dict[str, Any]],
) -> str:
    template = DEFAULT_PORTFOLIO_BUILDER_PROMPT
    return template.format(
        request_id=request_id,
        budget=budget,
        currency=currency,
        risk_profile=risk_profile,
        market_regime=market_regime,
        watchlist=json.dumps(watchlist, default=str),
    )


async def generate_portfolio_allocation(
    budget: float,
    currency: str,
    risk_profile: str,
    market_regime: str,
    watchlist: List[Dict[str, Any]],
    model: str = "openai/gpt-4o-mini",
) -> Dict[str, Any]:
    """Generate a portfolio allocation proposal from a budget and watchlist context."""
    request_id = f"alloc-{datetime.utcnow().timestamp()}"

    prompt = _build_portfolio_prompt(
        request_id=request_id,
        budget=budget,
        currency=currency,
        risk_profile=risk_profile,
        market_regime=market_regime,
        watchlist=watchlist,
    )

    client = OpenRouterClient()
    try:
        response = await client.chat_completion(
            messages=[
                {"role": "system", "content": "You are a portfolio allocation advisor. Output only JSON."},
                {"role": "user", "content": prompt},
            ],
            model=model,
            temperature=0.2,
            max_tokens=2500,
        )

        content = response["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()

        allocation = json.loads(content)
        allocation["request_id"] = request_id
        return allocation
    except Exception as e:
        return {
            "request_id": request_id,
            "status": "NO_ALLOCATION",
            "error": str(e),
        }
