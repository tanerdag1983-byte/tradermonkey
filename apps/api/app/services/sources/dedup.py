from datetime import datetime
from typing import Optional
from app.services.sources.normalizer import normalize_symbol, dedupe_key
from app.models import NewsItem
from sqlalchemy.orm import Session


def is_duplicate(db: Session, title: str, published_at: Optional[str] = None) -> bool:
    key = dedupe_key(title, published_at)
    # Use title + publisher fallback
    existing = db.query(NewsItem).filter(
        NewsItem.title.ilike(title.strip())
    ).first()
    return existing is not None
