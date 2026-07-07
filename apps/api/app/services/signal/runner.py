from datetime import datetime
from typing import Dict, Any, List
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import Signal, Position, NewsItem
from app.services.signal.engine import generate_signal
from app.services.risk.engine import (
    calculate_atr_stop,
    calculate_take_profits,
    validate_signal_against_risk,
)
from app.services.market.data import sync_symbol_bars, get_bars_as_df
from app.services.market.technical import build_market_context


DEFAULT_RISK_LIMITS = {
    "max_single_position_pct": 0.05,
    "max_sector_pct": 0.20,
    "max_daily_loss_pct": 0.01,
    "max_new_trade_risk_pct": 0.0025,
    "max_gross_exposure_pct": 0.90,
}


def create_default_broker() -> Dict[str, Any]:
    return {
        "name": "trading212",
        "supports": {"market": True, "limit": True, "stop": True, "stop_limit": True},
        "constraints": {
            "primary_currency_only": True,
            "sell_requires_negative_quantity": True,
            "non_idempotent_order_placement": True,
        },
    }


def build_portfolio_summary(db: Session, user_id: str) -> Dict[str, Any]:
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    portfolio_value = sum(p.market_value or 0 for p in positions)
    return {
        "base_currency": "EUR",
        "net_liquidation": portfolio_value or 50000,
        "positions": [
            {
                "symbol": p.symbol,
                "quantity": p.quantity,
                "market_value": p.market_value,
            }
            for p in positions
        ],
        "risk_limits": DEFAULT_RISK_LIMITS,
    }


def collect_sources_for_symbol(db: Session, symbol: str) -> List[Dict[str, Any]]:
    news_items = (
        db.query(NewsItem)
        .filter(
            NewsItem.title.ilike(f"%{symbol}%") | NewsItem.body.ilike(f"%{symbol}%")
        )
        .order_by(NewsItem.published_at.desc())
        .limit(10)
        .all()
    )

    sources = [
        {
            "source_id": str(n.id),
            "source_class": n.source_class,
            "publisher": n.publisher,
            "title": n.title,
            "body": n.body[:500] if n.body else "",
            "published_at": n.published_at.isoformat() if n.published_at else None,
            "sentiment_score": n.sentiment_score,
        }
        for n in news_items
    ]

    if not sources:
        latest_news = db.query(NewsItem).order_by(NewsItem.published_at.desc()).limit(5).all()
        sources = [
            {
                "source_id": str(n.id),
                "source_class": n.source_class,
                "publisher": n.publisher,
                "title": n.title,
                "body": n.body[:500] if n.body else "",
                "published_at": n.published_at.isoformat() if n.published_at else None,
                "sentiment_score": n.sentiment_score,
            }
            for n in latest_news
        ]

    return sources


def build_market_state(db: Session, symbol: str) -> Dict[str, Any]:
    sync_symbol_bars(db, symbol, timeframe="1d", lookback_days=120)
    df_bars = get_bars_as_df(db, symbol, timeframe="1d", limit=90)
    market_context = build_market_context(df_bars) if not df_bars.empty else {"error": "no market data"}
    chart_summary = (
        df_bars.tail(30)[["timestamp", "open", "high", "low", "close", "volume"]].to_dict(orient="records")
        if not df_bars.empty
        else []
    )
    return {
        "symbol": symbol,
        "context": market_context,
        "recent_bars": chart_summary,
    }


def normalize_take_profit(take_profit: Any) -> List[Any]:
    if isinstance(take_profit, list):
        return take_profit
    if take_profit is not None:
        return [take_profit, None]
    return [None, None]


async def generate_and_store_signal(
    db: Session,
    user_id: str,
    symbol: str,
    *,
    portfolio_value: float = None,
    skip_no_trade: bool = True,
) -> Dict[str, Any]:
    """Generate a signal for a symbol and persist it.

    Args:
        db: SQLAlchemy session.
        user_id: Owner of the generated signal.
        symbol: Ticker to analyze.
        portfolio_value: Optional override for net liquidation.
        skip_no_trade: If True, do not persist NO_TRADE signals.

    Returns:
        The generated signal dict (including ``stored`` boolean).
    """
    symbol = str(symbol).upper()

    portfolio = build_portfolio_summary(db, user_id)
    if portfolio_value is not None:
        portfolio["net_liquidation"] = portfolio_value

    broker = create_default_broker()
    market_state = build_market_state(db, symbol)
    sources = collect_sources_for_symbol(db, symbol)

    signal = await generate_signal(symbol, portfolio, broker, market_state, sources)

    is_trade_intent = signal.get("status") == "TRADE_INTENT"
    if is_trade_intent and not signal.get("direction"):
        signal["status"] = "REVIEW_REQUIRED"
        signal.setdefault("compliance", {}).setdefault("reasons", []).append(
            "AI output missing direction; requires manual review"
        )
        is_trade_intent = False

    if is_trade_intent and signal.get("direction"):
        direction = signal["direction"]
        ctx = market_state.get("context", {})
        last_price = ctx.get("last_price")
        atr_14 = ctx.get("atr_14")

        entry_price = (
            signal.get("entry_price")
            or signal.get("risk", {}).get("entry_price")
            or last_price
        )
        stop_loss = (
            signal.get("stop_loss")
            or signal.get("risk", {}).get("stop_loss")
            or (calculate_atr_stop(entry_price, atr_14, direction, multiplier=1.5) if entry_price and atr_14 else None)
        )
        take_profit = (
            signal.get("take_profit")
            or signal.get("risk", {}).get("take_profit")
            or (calculate_take_profits(entry_price, stop_loss, direction) if entry_price and stop_loss else None)
        )

        if entry_price and stop_loss:
            signal["entry_price"] = entry_price
            signal["stop_loss"] = stop_loss
            signal["take_profit"] = take_profit
            signal.setdefault("risk", {})
            signal["risk"]["entry_type"] = signal.get("risk", {}).get("entry_type") or "market"
            signal["risk"]["entry_price"] = entry_price
            signal["risk"]["stop_loss"] = stop_loss
            signal["risk"]["take_profit"] = take_profit

            signal = validate_signal_against_risk(
                signal,
                portfolio_value=portfolio["net_liquidation"],
                risk_limits=DEFAULT_RISK_LIMITS,
                existing_exposure=sum(p.market_value or 0 for p in db.query(Position).filter(Position.user_id == user_id)),
            )
        else:
            signal["status"] = "REVIEW_REQUIRED"
            signal.setdefault("compliance", {}).setdefault("reasons", []).append("Missing market price or ATR")

    status = signal.get("status")
    if status == "NO_TRADE" and skip_no_trade:
        signal["stored"] = False
        return signal

    is_trade = status == "TRADE_INTENT"
    tp_values = normalize_take_profit(signal.get("risk", {}).get("take_profit"))

    db_signal = Signal(
        id=uuid4(),
        user_id=user_id,
        symbol=symbol,
        direction=signal.get("direction") if is_trade else None,
        entry_type=signal.get("risk", {}).get("entry_type") if is_trade else None,
        entry_price=signal.get("risk", {}).get("entry_price") if is_trade else None,
        stop_loss=signal.get("risk", {}).get("stop_loss") if is_trade else None,
        take_profit_1=tp_values[0] if is_trade else None,
        take_profit_2=tp_values[1] if is_trade else None,
        quantity=signal.get("risk", {}).get("quantity") if is_trade else None,
        confidence=signal.get("confidence"),
        status="generated",
        analysis_json=signal,
        generated_at=datetime.utcnow(),
    )
    db.add(db_signal)
    db.commit()
    signal["stored"] = True
    signal["signal_id"] = str(db_signal.id)
    return signal
