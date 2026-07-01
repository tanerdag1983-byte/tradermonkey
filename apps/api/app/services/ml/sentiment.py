from transformers import pipeline
from typing import Optional
import warnings

warnings.filterwarnings("ignore", message=".*deprecated.*")


_sentiment_pipeline = None


def get_sentiment_pipeline():
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        _sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            tokenizer="ProsusAI/finbert",
            device=-1,  # CPU
        )
    return _sentiment_pipeline


def analyze_sentiment(text: str, language: Optional[str] = None) -> dict:
    """Analyze sentiment of a financial text. Returns label and score."""
    if not text or not text.strip():
        return {"label": "neutral", "score": 0.5}

    # Truncate to model max length
    max_chars = 512 * 4  # rough estimate
    truncated = text[:max_chars]

    try:
        pipe = get_sentiment_pipeline()
        result = pipe(truncated)[0]
        label = result["label"].lower()
        score = result["score"]
        return {"label": label, "score": score}
    except Exception as e:
        return {"label": "neutral", "score": 0.5, "error": str(e)}


def sentiment_to_score(label: str, score: float) -> float:
    """Convert FinBERT label to a -1 to 1 score."""
    if label == "positive":
        return score
    elif label == "negative":
        return -score
    return 0.0
