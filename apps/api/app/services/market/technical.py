from typing import List, Dict, Any, Optional
import pandas as pd


def _ensure_df(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure required columns exist and are sorted by timestamp ascending."""
    if df.empty:
        return df
    df = df.copy()
    for col in ["open", "high", "low", "close", "volume"]:
        if col not in df.columns:
            df[col] = 0.0
    if "timestamp" in df.columns:
        df = df.sort_values("timestamp").reset_index(drop=True)
    else:
        df = df.reset_index(drop=True)
    return df


def calculate_sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=1).mean()


def calculate_ema(series: pd.Series, window: int) -> pd.Series:
    return series.ewm(span=window, adjust=False, min_periods=1).mean()


def calculate_atr(df: pd.DataFrame, window: int = 14) -> pd.Series:
    df = _ensure_df(df)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.rolling(window=window, min_periods=1).mean()


def calculate_rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=window, min_periods=1).mean()
    avg_loss = loss.rolling(window=window, min_periods=1).mean()
    # Avoid division by zero
    avg_loss_safe = avg_loss.replace(0, pd.NA)
    rs = avg_gain / avg_loss_safe
    rs = rs.fillna(0)
    return 100 - (100 / (1 + rs))


def detect_candlestick_patterns(df: pd.DataFrame) -> List[str]:
    """Simple pattern detection for the most recent candles."""
    df = _ensure_df(df)
    if len(df) < 3:
        return []

    patterns = []
    last = df.iloc[-1]
    prev = df.iloc[-2]
    body = abs(last["close"] - last["open"])
    range_ = last["high"] - last["low"]

    # Doji: very small body relative to range
    if range_ > 0 and body / range_ < 0.1:
        patterns.append("doji")

    # Hammer: small body at top, long lower wick
    if range_ > 0 and body / range_ < 0.3 and (last["close"] - last["low"]) / range_ > 0.6:
        patterns.append("hammer")

    # Shooting star: small body at bottom, long upper wick
    if range_ > 0 and body / range_ < 0.3 and (last["high"] - last["close"]) / range_ > 0.6:
        patterns.append("shooting_star")

    # Bullish engulfing
    if prev["close"] < prev["open"] and last["close"] > last["open"] and last["open"] <= prev["close"] and last["close"] >= prev["open"]:
        patterns.append("bullish_engulfing")

    # Bearish engulfing
    if prev["close"] > prev["open"] and last["close"] < last["open"] and last["open"] >= prev["close"] and last["close"] <= prev["open"]:
        patterns.append("bearish_engulfing")

    return patterns


def find_support_resistance(df: pd.DataFrame, lookback: int = 20, zone_width_pct: float = 0.01) -> Dict[str, List[float]]:
    """Find recent swing lows/highs as support/resistance zones."""
    df = _ensure_df(df)
    if len(df) < lookback + 2:
        return {"support": [], "resistance": []}

    recent = df.tail(lookback).copy()
    # Simple local minima/maxima
    recent["is_low"] = (recent["low"] < recent["low"].shift(1)) & (recent["low"] < recent["low"].shift(-1))
    recent["is_high"] = (recent["high"] > recent["high"].shift(1)) & (recent["high"] > recent["high"].shift(-1))

    supports = recent.loc[recent["is_low"], "low"].round(2).unique().tolist()
    resistances = recent.loc[recent["is_high"], "high"].round(2).unique().tolist()

    return {
        "support": sorted(supports[-3:]),
        "resistance": sorted(resistances[-3:]),
    }


def calculate_volume_surge(df: pd.DataFrame, window: int = 20) -> bool:
    df = _ensure_df(df)
    if len(df) < window + 1 or df["volume"].isna().all():
        return False
    avg_volume = df["volume"].tail(window + 1).head(window).mean()
    last_volume = df["volume"].iloc[-1]
    return bool(avg_volume > 0 and last_volume > avg_volume * 1.5)


def classify_trend(df: pd.DataFrame, fast: int = 10, slow: int = 30) -> str:
    df = _ensure_df(df)
    if len(df) < slow:
        return "unknown"
    sma_fast = calculate_sma(df["close"], fast)
    sma_slow = calculate_sma(df["close"], slow)
    if sma_fast.iloc[-1] > sma_slow.iloc[-1]:
        return "uptrend"
    if sma_fast.iloc[-1] < sma_slow.iloc[-1]:
        return "downtrend"
    return "sideways"


def build_market_context(df: pd.DataFrame) -> Dict[str, Any]:
    """Build a rich market context dict from OHLCV bars."""
    df = _ensure_df(df)
    if df.empty:
        return {"error": "no data"}

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    atr = calculate_atr(df, 14)
    rsi = calculate_rsi(df["close"], 14)
    trend = classify_trend(df)
    patterns = detect_candlestick_patterns(df)
    levels = find_support_resistance(df)
    volume_surge = calculate_volume_surge(df)

    return {
        "last_price": round(float(last["close"]), 2),
        "prev_close": round(float(prev["close"]), 2),
        "daily_change_pct": round(float((last["close"] - prev["close"]) / prev["close"] * 100), 2) if prev["close"] != 0 else 0.0,
        "atr_14": round(float(atr.iloc[-1]), 2),
        "rsi_14": round(float(rsi.iloc[-1]), 2),
        "trend": trend,
        "candlestick_patterns": patterns,
        "support_levels": levels["support"],
        "resistance_levels": levels["resistance"],
        "volume_surge": volume_surge,
        "recent_high": round(float(df["high"].tail(20).max()), 2),
        "recent_low": round(float(df["low"].tail(20).min()), 2),
        "period": f"{len(df)} bars",
    }
