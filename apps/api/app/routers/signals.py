from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.models import Signal, Position, NewsItem
from app.services.signal.portfolio_builder import generate_portfolio_allocation
from app.services.signal.runner import generate_and_store_signal
from app.services.risk.engine import (
    calculate_atr_stop,
    calculate_take_profits,
    calculate_position_size,
)
from app.services.market.data import sync_symbol_bars, get_bars_as_df
from app.services.market.technical import build_market_context

from app.services.execution.engine import execute_signal

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

    signal = await generate_and_store_signal(db, user.id, symbol, skip_no_trade=False)
    return {"success": True, "data": signal}


@router.post("/allocate")
async def allocate_portfolio(
    request: dict,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """
    Given a budget and watchlist, ask the AI how to distribute the budget across stocks.
    Request body example:
    {
      "budget": 1000,
      "currency": "EUR",
      "risk_profile": "moderate",
      "watchlist": ["AAPL", "MSFT", "TSLA", "ASML"]
    }
    """
    budget = float(request.get("budget", 0))
    currency = request.get("currency", "EUR")
    risk_profile = request.get("risk_profile", "moderate")
    watchlist = request.get("watchlist", [])

    if budget <= 0 or not watchlist:
        return {"success": False, "error": "budget and watchlist are required"}

    # Sync market data and build context for each symbol
    watchlist_context = []
    for symbol in watchlist:
        symbol = str(symbol).upper()
        sync_symbol_bars(db, symbol, timeframe="1d", lookback_days=90)
        df = get_bars_as_df(db, symbol, timeframe="1d", limit=60)
        market_context = build_market_context(df) if not df.empty else {"error": "no data"}

        # Fetch latest news mentioning this symbol
        news_items = db.query(NewsItem).filter(
            NewsItem.title.ilike(f"%{symbol}%") | NewsItem.body.ilike(f"%{symbol}%")
        ).order_by(NewsItem.published_at.desc()).limit(5).all()
        news_summary = [
            {"title": n.title, "published_at": n.published_at.isoformat() if n.published_at else None, "sentiment": n.sentiment_score}
            for n in news_items
        ]

        watchlist_context.append({
            "symbol": symbol,
            "recent_close": market_context.get("last_price"),
            "atr_14": market_context.get("atr_14"),
            "rsi_14": market_context.get("rsi_14"),
            "trend": market_context.get("trend"),
            "support_levels": market_context.get("support_levels"),
            "resistance_levels": market_context.get("resistance_levels"),
            "candlestick_patterns": market_context.get("candlestick_patterns"),
            "news_summary": news_summary,
        })

    # Determine a simple market regime from SPY/QQQ or AAPL as proxy
    market_regime = "unknown"
    spy_df = get_bars_as_df(db, "SPY", timeframe="1d", limit=20)
    if not spy_df.empty:
        from app.services.market.technical import build_market_context as build_ctx
        spy_ctx = build_ctx(spy_df)
        market_regime = spy_ctx.get("trend", "unknown")

    result = await generate_portfolio_allocation(
        budget=budget,
        currency=currency,
        risk_profile=risk_profile,
        market_regime=market_regime,
        watchlist=watchlist_context,
    )

    return {
        "success": True,
        "data": {
            "allocations": result.get("allocations") or [],
            "summary": {
                "total_allocated": result.get("total_allocated"),
                "cash_remaining": result.get("cash_remaining"),
            },
        },
    }


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


@router.post("/{signal_id}/execute")
async def execute_approved_signal(
    signal_id: str,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Execute an approved signal against the configured broker (Alpaca paper by default)."""
    signal = db.query(Signal).filter(Signal.id == signal_id, Signal.user_id == user.id).first()
    if not signal:
        return {"success": False, "error": "Signal not found"}

    result = await execute_signal(db, signal, user.id)
    return result
