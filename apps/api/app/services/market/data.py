import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session

from app.models import MarketBar

logger = logging.getLogger(__name__)


def _normalize_symbol(symbol: str) -> str:
    """Yahoo Finance uses a dot for some exchanges (e.g. ASML.AS), but most US stocks are fine."""
    return symbol.strip().upper()


def fetch_bars_from_yahoo(
    symbol: str,
    timeframe: str = "1d",
    lookback_days: int = 90,
) -> pd.DataFrame:
    """Fetch historical OHLCV bars from Yahoo Finance.

    timeframe: Yahoo Finance interval string, e.g. 1d, 1h, 15m, 5m.
    lookback_days: how many days of history to fetch.
    """
    ticker = _normalize_symbol(symbol)
    # Yahoo uses '-' instead of '.' for suffixes sometimes; keep simple for US/EU.
    ticker_obj = yf.Ticker(ticker)

    # Map rough lookback to period string acceptable by yfinance.
    period = f"{max(lookback_days, 7)}d"
    df = ticker_obj.history(period=period, interval=timeframe)

    if df is None or df.empty:
        logger.warning("No bars returned by Yahoo Finance for %s", ticker)
        return pd.DataFrame()

    df = df.reset_index()
    # Column names may be multi-index; flatten
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

    # Rename Yahoo columns to our schema
    rename_map = {
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "volume",
    }
    df = df.rename(columns=rename_map)
    df["symbol"] = symbol.upper()
    df["timeframe"] = timeframe

    # Timestamp handling: Datetime may be tz-aware already; strip tz to store as UTC-ish
    if "Date" in df.columns:
        df["timestamp"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
    elif "Datetime" in df.columns:
        df["timestamp"] = pd.to_datetime(df["Datetime"]).dt.tz_localize(None)
    else:
        df["timestamp"] = datetime.utcnow()

    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.tz_localize(None)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Deduplicate by timestamp to avoid lightweight-charts errors
    df = df.drop_duplicates(subset=["symbol", "timeframe", "timestamp"], keep="last")

    return df[["symbol", "timeframe", "timestamp", "open", "high", "low", "close", "volume"]]


def save_bars_to_db(db: Session, df: pd.DataFrame) -> int:
    """Upsert bars into the database. Returns number of bars saved."""
    if df.empty:
        return 0

    # Fetch existing keys to avoid duplicates
    symbols = df["symbol"].unique().tolist()
    timeframes = df["timeframe"].unique().tolist()
    existing = {
        (row.symbol, row.timeframe, row.timestamp)
        for row in db.query(MarketBar).filter(
            MarketBar.symbol.in_(symbols),
            MarketBar.timeframe.in_(timeframes),
        ).all()
    }

    saved = 0
    for _, row in df.iterrows():
        key = (row["symbol"], row["timeframe"], row["timestamp"])
        if key in existing:
            continue
        bar = MarketBar(
            symbol=row["symbol"],
            timeframe=row["timeframe"],
            timestamp=row["timestamp"],
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"]) if pd.notna(row["volume"]) else None,
        )
        db.add(bar)
        saved += 1

    db.commit()
    return saved


def get_bars_as_records(
    db: Session,
    symbol: str,
    timeframe: str = "1d",
    limit: int = 90,
) -> List[Dict[str, Any]]:
    """Return recent bars as plain dicts for API responses."""
    bars = (
        db.query(MarketBar)
        .filter(MarketBar.symbol == symbol.upper(), MarketBar.timeframe == timeframe)
        .order_by(MarketBar.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "timestamp": b.timestamp.isoformat() if b.timestamp else None,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
        }
        for b in reversed(bars)
    ]


def get_bars_as_df(
    db: Session,
    symbol: str,
    timeframe: str = "1d",
    limit: int = 90,
) -> pd.DataFrame:
    """Return recent bars as a DataFrame for technical analysis."""
    bars = (
        db.query(MarketBar)
        .filter(MarketBar.symbol == symbol.upper(), MarketBar.timeframe == timeframe)
        .order_by(MarketBar.timestamp.desc())
        .limit(limit)
        .all()
    )
    if not bars:
        return pd.DataFrame()
    rows = [
        {
            "timestamp": b.timestamp,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
            "symbol": b.symbol,
            "timeframe": b.timeframe,
        }
        for b in reversed(bars)
    ]
    return pd.DataFrame(rows)


def sync_symbol_bars(
    db: Session,
    symbol: str,
    timeframe: str = "1d",
    lookback_days: int = 120,
) -> int:
    """Fetch and store bars for a symbol. Returns number of new bars."""
    df = fetch_bars_from_yahoo(symbol, timeframe=timeframe, lookback_days=lookback_days)
    if df.empty:
        return 0
    return save_bars_to_db(db, df)
