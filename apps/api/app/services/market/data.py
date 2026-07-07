import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

import httpx
import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from yfinance.exceptions import YFRateLimitError

from app.models import MarketBar
from app.config import get_settings

logger = logging.getLogger(__name__)


ALPACA_TIMEFRAME_MAP = {
    "1d": "1Day",
    "1h": "1Hour",
    "15m": "15Min",
    "5m": "5Min",
    "1m": "1Min",
}


def _normalize_symbol(symbol: str) -> str:
    """Yahoo Finance uses a dot for some exchanges (e.g. ASML.AS), but most US stocks are fine."""
    return symbol.strip().upper()


def fetch_bars_from_alpaca(
    symbol: str,
    timeframe: str = "1d",
    lookback_days: int = 120,
) -> pd.DataFrame:
    """Fetch historical OHLCV bars from Alpaca Data API (paper).

    Falls back to empty DataFrame if Alpaca keys are missing, symbol is not
    supported, or rate-limited.
    """
    settings = get_settings()
    if not settings.alpaca_api_key or not settings.alpaca_secret_key:
        logger.debug("Alpaca keys not configured, skipping Alpaca data source.")
        return pd.DataFrame()

    alpaca_tf = ALPACA_TIMEFRAME_MAP.get(timeframe, "1Day")
    ticker = _normalize_symbol(symbol)

    # Strip exchange suffixes like ASML.AS, BMW.DE etc. Alpaca only supports US tickers.
    if "." in ticker:
        logger.debug("Alpaca does not support suffixed ticker %s, skipping.", ticker)
        return pd.DataFrame()

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=max(lookback_days, 7))

    params = {
        "timeframe": alpaca_tf,
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "limit": 1000,
        "feed": "iex",
        "adjustment": "raw",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                f"https://data.alpaca.markets/v2/stocks/{ticker}/bars",
                params=params,
                headers={
                    "APCA-API-KEY-ID": settings.alpaca_api_key,
                    "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
                    "Accept": "application/json",
                },
            )
            if response.status_code != 200:
                logger.warning(
                    "Alpaca data API returned %s for %s: %s",
                    response.status_code,
                    ticker,
                    response.text[:200],
                )
                return pd.DataFrame()

            data = response.json()
            bars = data.get("bars") or []
            if not bars:
                logger.warning("Alpaca returned no bars for %s", ticker)
                return pd.DataFrame()

            df = pd.DataFrame(bars)
            df = df.rename(
                columns={
                    "t": "timestamp",
                    "o": "open",
                    "h": "high",
                    "l": "low",
                    "c": "close",
                    "v": "volume",
                    "n": "trades",
                    "vw": "vwap",
                }
            )
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
            df["symbol"] = ticker
            df["timeframe"] = timeframe
            df["open"] = pd.to_numeric(df["open"], errors="coerce")
            df["high"] = pd.to_numeric(df["high"], errors="coerce")
            df["low"] = pd.to_numeric(df["low"], errors="coerce")
            df["close"] = pd.to_numeric(df["close"], errors="coerce")
            df["volume"] = pd.to_numeric(df["volume"], errors="coerce")
            df = df.dropna(subset=["open", "high", "low", "close"])

            df = df.sort_values("timestamp").reset_index(drop=True)
            df = df.drop_duplicates(subset=["symbol", "timeframe", "timestamp"], keep="last")
            return df[["symbol", "timeframe", "timestamp", "open", "high", "low", "close", "volume"]]

    except Exception as exc:
        logger.warning("Alpaca data fetch failed for %s: %s", ticker, exc)
        return pd.DataFrame()


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
    try:
        df = ticker_obj.history(period=period, interval=timeframe)
    except YFRateLimitError:
        logger.warning("Yahoo Finance rate limit reached for %s; skipping.", ticker)
        return pd.DataFrame()
    except Exception as exc:
        logger.warning("Yahoo Finance fetch failed for %s: %s", ticker, exc)
        return pd.DataFrame()

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

    # Timestamp handling: yfinance returns tz-aware (usually America/New_York) or naive datetimes.
    # Normalize everything to UTC-aware datetime for consistent storage and queries.
    if "Date" in df.columns:
        ts = pd.to_datetime(df["Date"])
    elif "Datetime" in df.columns:
        ts = pd.to_datetime(df["Datetime"])
    else:
        ts = pd.to_datetime(datetime.utcnow())

    if ts.dt.tz is None:
        ts = ts.dt.tz_localize("UTC")
    else:
        ts = ts.dt.tz_convert("UTC")
    df["timestamp"] = ts

    df = df.sort_values("timestamp").reset_index(drop=True)

    # Deduplicate by timestamp to avoid lightweight-charts errors
    df = df.drop_duplicates(subset=["symbol", "timeframe", "timestamp"], keep="last")

    return df[["symbol", "timeframe", "timestamp", "open", "high", "low", "close", "volume"]]


from sqlalchemy.exc import IntegrityError

def save_bars_to_db(db: Session, df: pd.DataFrame) -> int:
    """Upsert bars into the database. Returns number of new bars saved."""
    if df.empty:
        return 0

    rows = []
    for _, row in df.iterrows():
        ts = row["timestamp"]
        if isinstance(ts, pd.Timestamp):
            ts = ts.to_pydatetime()
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        rows.append({
            "symbol": row["symbol"],
            "timeframe": row["timeframe"],
            "timestamp": ts,
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]) if pd.notna(row["volume"]) else None,
            "created_at": datetime.now(timezone.utc),
        })

    stmt = insert(MarketBar).values(rows)
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["symbol", "timeframe", "timestamp"]
    )
    try:
        result = db.execute(stmt)
        db.commit()
        # rowcount may be -1 with ON CONFLICT DO NOTHING in psycopg
        return result.rowcount if result.rowcount >= 0 else len(rows)
    except IntegrityError:
        db.rollback()
        return 0


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
    # Prefer Alpaca for US equities; fall back to Yahoo Finance for non-US or on error.
    df = fetch_bars_from_alpaca(symbol, timeframe=timeframe, lookback_days=lookback_days)
    if df.empty:
        df = fetch_bars_from_yahoo(symbol, timeframe=timeframe, lookback_days=lookback_days)
    if df.empty:
        return 0
    return save_bars_to_db(db, df)
