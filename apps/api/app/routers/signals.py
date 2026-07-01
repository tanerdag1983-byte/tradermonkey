from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.models import Signal, Position, NewsItem
from app.services.signal.engine import generate_signal, generate_portfolio_summary
from app.services.risk.engine import (
    calculate_atr_stop,
    calculate_take_profits,
    calculate_position_size,
    validate_signal_against_risk,
)
from app.services.market.data import sync_symbol_bars, get_bars_as_df
from app.services.market.technical import build_market_context

router = APIRouter(prefix="/signals", tags=["signals"])


RISK_LIMITS = {
    "max_single_position_pct": 0.05,
    "max_sector_pct": 0.20,
    "max_daily_loss_pct": 0.01,
    "max_new_trade_risk_pct": 0.0025,
    "max_gross_exposure_pct": 0.90,
}


@router.post("/generate/{symbol}")
async def generate_signal_endpoint(
    symbol: str,
    demo: bool = False,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Generate a signal for a symbol based on news and market data. Pass ?demo=1 for a deterministic test signal."""
    if demo:
        from app.services.risk.engine import calculate_atr_stop, calculate_take_profits, calculate_position_size
        entry_price = 100.0
        atr = 2.0
        direction = "BUY"
        stop_loss = calculate_atr_stop(entry_price, atr, direction, multiplier=1.5)
        take_profits = calculate_take_profits(entry_price, stop_loss, direction)
        sizing = calculate_position_size(
            portfolio_value=50000,
            entry_price=entry_price,
            stop_price=stop_loss,
            risk_limits=RISK_LIMITS,
            existing_exposure=0,
        )
        signal = {
            "request_id": f"sig-demo-{symbol}",
            "status": "TRADE_INTENT",
            "instrument": symbol,
            "direction": direction,
            "confidence": 0.72,
            "thesis": f"Demo bullish signal for {symbol}: momentum + sentiment positive in dev environment.",
            "time_horizon": "1-3 days",
            "invalidation_conditions": ["Close below stop loss", "Bearish reversal on volume"],
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profits,
            "risk": {
                "entry_type": "market",
                "entry_price": entry_price,
                "stop_loss": stop_loss,
                "take_profit": take_profits,
                **(sizing or {}),
            },
        }
        db_signal = Signal(
            user_id=user.id,
            symbol=symbol,
            direction=signal.get("direction"),
            entry_type=signal.get("risk", {}).get("entry_type"),
            entry_price=signal.get("risk", {}).get("entry_price"),
            stop_loss=signal.get("risk", {}).get("stop_loss"),
            take_profit_1=signal.get("risk", {}).get("take_profit", [None, None])[0] if isinstance(signal.get("risk", {}).get("take_profit"), list) else None,
            take_profit_2=signal.get("risk", {}).get("take_profit", [None, None])[1] if isinstance(signal.get("risk", {}).get("take_profit"), list) else None,
            quantity=signal.get("risk", {}).get("quantity"),
            confidence=signal.get("confidence"),
            status="generated",
            analysis_json=signal,
        )
        db.add(db_signal)
        db.commit()
        return {"success": True, "data": signal}

    # Fetch recent news items mentioning this symbol
    news_items = db.query(NewsItem).filter(
        NewsItem.title.ilike(f"%{symbol}%") | NewsItem.body.ilike(f"%{symbol}%")
    ).order_by(NewsItem.published_at.desc()).limit(10).all()

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

    # Fallback: use latest news if no symbol-specific news
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

    # Portfolio summary (simplified)
    positions = db.query(Position).filter(Position.user_id == user.id).all()
    portfolio_value = sum(p.market_value or 0 for p in positions)
    portfolio = {
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
        "risk_limits": RISK_LIMITS,
    }

    broker = {
        "name": "trading212",
        "supports": {
            "market": True,
            "limit": True,
            "stop": True,
            "stop_limit": True,
        },
        "constraints": {
            "primary_currency_only": True,
            "sell_requires_negative_quantity": True,
            "non_idempotent_order_placement": True,
        },
    }

    # Fetch or sync real market bars + build technical context
    sync_symbol_bars(db, symbol, timeframe="1d", lookback_days=120)
    df_bars = get_bars_as_df(db, symbol, timeframe="1d", limit=90)
    market_context = build_market_context(df_bars) if not df_bars.empty else {"error": "no market data"}

    # Convert chart bars to lightweight records for the prompt
    chart_summary = df_bars.tail(30)[["timestamp", "open", "high", "low", "close", "volume"]].to_dict(orient="records") if not df_bars.empty else []

    market_state = {
        "symbol": symbol,
        "context": market_context,
        "recent_bars": chart_summary,
    }

    signal = await generate_signal(symbol, portfolio, broker, market_state, sources)

    # Normalize and fill risk details for actionable intents
    if signal.get("status") == "TRADE_INTENT" and signal.get("direction"):
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
                portfolio_value=portfolio_value or 50000,
                risk_limits=RISK_LIMITS,
                existing_exposure=sum(p.market_value or 0 for p in positions),
            )
        else:
            signal["status"] = "REVIEW_REQUIRED"
            signal.setdefault("compliance", {}).setdefault("reasons", []).append("Missing market price or ATR")

    # Save signal to DB for any AI decision (TRADE_INTENT, REVIEW_REQUIRED, NO_TRADE)
    db_signal = Signal(
        user_id=user.id,
        symbol=symbol,
        direction=signal.get("direction") if signal.get("status") == "TRADE_INTENT" else None,
        entry_type=signal.get("risk", {}).get("entry_type") if signal.get("status") == "TRADE_INTENT" else None,
        entry_price=signal.get("risk", {}).get("entry_price") if signal.get("status") == "TRADE_INTENT" else None,
        stop_loss=signal.get("risk", {}).get("stop_loss") if signal.get("status") == "TRADE_INTENT" else None,
        take_profit_1=(signal.get("risk", {}).get("take_profit", [None, None])[0] if isinstance(signal.get("risk", {}).get("take_profit"), list) else None) if signal.get("status") == "TRADE_INTENT" else None,
        take_profit_2=(signal.get("risk", {}).get("take_profit", [None, None])[1] if isinstance(signal.get("risk", {}).get("take_profit"), list) else None) if signal.get("status") == "TRADE_INTENT" else None,
        quantity=signal.get("risk", {}).get("quantity") if signal.get("status") == "TRADE_INTENT" else None,
        confidence=signal.get("confidence"),
        status="generated",
        analysis_json=signal,
    )
    db.add(db_signal)
    db.commit()

    return {"success": True, "data": signal}


@router.get("/feed")
async def get_signals(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    signals = db.query(Signal).filter(Signal.user_id == user.id).order_by(Signal.generated_at.desc()).limit(limit).all()
    return {
        "success": True,
        "data": [
            {
                "id": str(s.id),
                "symbol": s.symbol,
                "direction": s.direction,
                "entry_price": s.entry_price,
                "stop_loss": s.stop_loss,
                "confidence": s.confidence,
                "status": s.status,
                "generated_at": s.generated_at.isoformat() if s.generated_at else None,
                "analysis": s.analysis_json,
            }
            for s in signals
        ],
    }


@router.post("/{signal_id}/approve")
async def approve_signal(
    signal_id: str,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    signal = db.query(Signal).filter(Signal.id == signal_id, Signal.user_id == user.id).first()
    if not signal:
        return {"success": False, "error": "Signal not found"}

    signal.status = "approved"
    db.commit()
    return {"success": True, "data": {"id": signal_id, "status": "approved"}}


@router.post("/{signal_id}/reject")
async def reject_signal(
    signal_id: str,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    signal = db.query(Signal).filter(Signal.id == signal_id, Signal.user_id == user.id).first()
    if not signal:
        return {"success": False, "error": "Signal not found"}

    signal.status = "rejected"
    db.commit()
    return {"success": True, "data": {"id": signal_id, "status": "rejected"}}
