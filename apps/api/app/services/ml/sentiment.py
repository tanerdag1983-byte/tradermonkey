import re
from typing import Optional


POSITIVE_WORDS = {
    "up", "rise", "rising", "gains", "gain", "rally", "surge", "surges", "soar",
    "soars", "jump", "jumps", "bullish", "beat", "beats", "strong", "stronger",
    "growth", "profit", "profits", "record", "outperform", "outperforms", "buy",
    "upgrade", "upgrades", "opportunity", "opportunities", "recovery", "recover",
    "recovers", "expansion", "positive", "optimistic", "momentum", "breakout",
    "milestone", "exceeds", "exceed", "partnership", "deal", "deals", "approves",
    "approval", "launches", " launched", "dividend", "dividends", "efficiency",
    "growth", "higher", "highs", "outlook", "promising", "confident", "strength",
    "increase", "increases", "raised", "raise", "raises", "upside", "excellent",
}

NEGATIVE_WORDS = {
    "down", "fall", "falls", "falling", "decline", "declines", "drop", "drops",
    "dropping", "plunge", "plunges", "plummet", "plummets", "crash", "crashes",
    "bearish", "miss", "misses", "weak", "weaker", "loss", "losses", "negative",
    "sell", "sells", "downgrade", "downgrades", "cut", "cuts", "warning", "warns",
    "warn", " concern", "concerns", "risk", "risks", "uncertainty", "recession",
    "inflation", "layoff", "layoffs", "bankruptcy", "bankrupt", "defaults",
    "default", "fraud", "investigation", "lawsuit", "litigation", "penalty",
    "penalties", "fined", "fine", "layoff", "job cuts", "reduce", "reduces",
    "decrease", "decreases", "lower", "lowers", "shortfall", "disappoint",
    "disappoints", "volatile", "panic", "fears", "fear", "tension", "tensions",
    "turmoil", "stagnant", "underperform", "underperforms", "delay", "delays",
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[a-z]+\b", text.lower())


def analyze_sentiment(text: str, language: Optional[str] = None) -> dict:
    """Fast rule-based sentiment for financial headlines/text.

    Returns a label and a score in the same shape as the old FinBERT
    pipeline so callers don't need to change.
    """
    if not text or not text.strip():
        return {"label": "neutral", "score": 0.5}

    # Truncate to a sane length for scoring
    truncated = text.strip()[:4000]
    tokens = _tokenize(truncated)

    if not tokens:
        return {"label": "neutral", "score": 0.5}

    pos = sum(1 for t in tokens if t in POSITIVE_WORDS)
    neg = sum(1 for t in tokens if t in NEGATIVE_WORDS)
    total = pos + neg

    if total == 0:
        return {"label": "neutral", "score": 0.5}

    # Score in [-1, 1]
    polarity = (pos - neg) / total

    if polarity > 0:
        return {"label": "positive", "score": polarity}
    elif polarity < 0:
        return {"label": "negative", "score": abs(polarity)}
    return {"label": "neutral", "score": 0.5}


def sentiment_to_score(label: str, score: float) -> float:
    """Convert sentiment label to a -1 to 1 score."""
    if label == "positive":
        return score
    elif label == "negative":
        return -score
    return 0.0
