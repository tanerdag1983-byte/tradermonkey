import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.services.llm.openrouter import OpenRouterClient
from app.config import get_settings


DEFAULT_SIGNAL_PLANNER_PROMPT = """You are the Signal & Execution Planner for a regulated/risk-limited trading platform.

GOAL
- Analyze price action (candles, trend, support/resistance), news sentiment, and account state.
- Return ONLY a structured trade intent or NO_TRADE.
- Never place live orders; execution requires explicit user approval.
- If data is incomplete, conflicting, or stale: return NO_TRADE or REVIEW_REQUIRED.

DECISION PRINCIPLES
- Prefer official filings, regulated company news, exchange notices, and regulator sources.
- Use blogs and forums only as context/crowd-sentiment, never as the sole trigger.
- A trade requires:
  1. Confirmed instrument mapping
  2. Available risk budget
  3. Broker supports the order type
  4. No duplicate intent/order in cooldown window
  5. Chart setup + sentiment + market regime all point in the same direction
- Conservative style: when in doubt, NO_TRADE.
- Align entry with support/resistance: BUY near support in uptrend, SELL near resistance in downtrend.
- Use identified candlestick patterns to time or invalidate the setup.
- If RSI is extreme (>70 long, <30 short) and conflicts with the setup, lower confidence or pass.

INPUT
- request_id: {request_id}
- execution_mode: paper
- portfolio: {portfolio}
- broker: {broker}
- market_state: {market_state}
- sources: {sources}

OUTPUT RULES
- Respond ONLY as valid JSON.
- No markdown, no extra text.
- status must be one of: NO_TRADE, REVIEW_REQUIRED, TRADE_INTENT.
- ALWAYS include a brief "thesis" field explaining your conclusion, even for NO_TRADE.
- If TRADE_INTENT, include: direction, confidence, thesis, entry_type, entry_price, stop_loss, take_profit (list), quantity, time_horizon, invalidation_conditions (list).
- If NO_TRADE or REVIEW_REQUIRED, include: thesis and invalidation_conditions (list).

BASIC HEURISTICS
- entry_value = min(max_new_trade_risk_pct * net_liquidation, max_single_position_pct * net_liquidation - existing exposure)
- quantity = entry_value / entry_price (only if safe)
- initial stop = max(structural support/resistance level, entry_price - 1.5 * ATR) for BUY; reverse for SELL
- take_profit[0] ~ 1R, take_profit[1] ~ 2R
- lower confidence for low source class, conflicting sources, high spread, mixed/risk_off regime, or chart that does not confirm the news
"""


def get_signal_prompt_template() -> str:
    """Return the active signal prompt template. Uses env var file override if set, otherwise default."""
    settings = get_settings()
    path = getattr(settings, "signal_prompt_override_path", None)
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            pass
    return DEFAULT_SIGNAL_PLANNER_PROMPT


def _build_prompt(
    request_id: str,
    portfolio: Dict[str, Any],
    broker: Dict[str, Any],
    market_state: Dict[str, Any],
    sources: List[Dict[str, Any]],
) -> str:
    template = get_signal_prompt_template()
    return template.format(
        request_id=request_id,
        portfolio=json.dumps(portfolio, default=str),
        broker=json.dumps(broker, default=str),
        market_state=json.dumps(market_state, default=str),
        sources=json.dumps(sources, default=str),
    )


async def generate_signal(
    symbol: str,
    portfolio: Dict[str, Any],
    broker: Dict[str, Any],
    market_state: Dict[str, Any],
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a trade signal using OpenRouter."""
    request_id = f"sig-{datetime.utcnow().timestamp()}"

    client = OpenRouterClient()
    prompt = _build_prompt(request_id, portfolio, broker, market_state, sources)

    messages = [
        {"role": "system", "content": "You are a financial signal planner. Output only JSON."},
        {"role": "user", "content": prompt},
    ]

    try:
        response = await client.chat_completion(
            messages=messages,
            model="openai/gpt-4o-mini",
            temperature=0.1,
            max_tokens=1500,
        )

        content = response["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()

        signal = json.loads(content)
        signal["request_id"] = request_id
        signal["instrument"] = signal.get("instrument") or symbol
        return signal
    except Exception as e:
        return {
            "request_id": request_id,
            "status": "NO_TRADE",
            "instrument": symbol,
            "error": str(e),
        }


async def generate_portfolio_summary(
    portfolio_summary: Dict[str, Any],
    sources: List[Dict[str, Any]],
) -> str:
    """Generate an AI summary of portfolio + market context."""
    client = OpenRouterClient()

    prompt = f"""Summarize this portfolio and recent market context for the user in 3-5 short sentences in Dutch.

Portfolio:
{json.dumps(portfolio_summary, default=str)}

Recent news:
{json.dumps(sources[:5], default=str)}
"""

    try:
        response = await client.chat_completion(
            messages=[
                {"role": "system", "content": "You are a helpful AI trading assistant."},
                {"role": "user", "content": prompt},
            ],
            model="anthropic/claude-sonnet-5",
            temperature=0.5,
            max_tokens=300,
        )
        return response["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Kon geen samenvatting genereren: {str(e)}"
