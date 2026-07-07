from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Any, Dict

from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.models import MarketBar
from app.services.market.data import sync_symbol_bars, get_bars_as_df, get_bars_as_records
from app.services.market.technical import build_market_context

router = APIRouter(prefix="/market", tags=["market"])


@router.post("/sync/{symbol}")
async def sync_market_data(
    symbol: str,
    timeframe: str = "1d",
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Fetch and store market bars for a symbol."""
    new_bars = sync_symbol_bars(db, symbol, timeframe=timeframe)
    return {"success": True, "data": {"symbol": symbol, "timeframe": timeframe, "new_bars": new_bars}}


@router.get("/bars/{symbol}")
async def get_market_bars(
    symbol: str,
    timeframe: str = "1d",
    limit: int = 90,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Return stored OHLCV bars, syncing with the data source if needed."""
    # Sync fresh bars if the stored set is incomplete or empty.
    existing_count = db.query(MarketBar).filter(
        MarketBar.symbol == symbol.upper(),
        MarketBar.timeframe == timeframe,
    ).count()
    if existing_count < limit:
        sync_symbol_bars(db, symbol, timeframe=timeframe, lookback_days=max(limit, 120))

    bars = get_bars_as_records(db, symbol, timeframe=timeframe, limit=limit)
    return {"success": True, "data": bars}


@router.get("/context/{symbol}")
async def get_market_context(
    symbol: str,
    timeframe: str = "1d",
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    """Return technical analysis context for a symbol."""
    sync_symbol_bars(db, symbol, timeframe=timeframe)
    df = get_bars_as_df(db, symbol, timeframe=timeframe, limit=90)
    context = build_market_context(df) if not df.empty else {"error": "no market data"}
    return {"success": True, "data": context}
