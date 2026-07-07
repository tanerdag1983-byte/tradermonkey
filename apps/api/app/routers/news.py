from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.services.sources.ingestor import ingest_news, get_news_feed

router = APIRouter(prefix="/news", tags=["news"])


class IngestRequest(BaseModel):
    queries: Optional[List[str]] = None
    max_items_per_source: int = 40
    recency_hours: int = 48


@router.post("/ingest")
async def ingest_news_endpoint(
    request: Optional[IngestRequest] = None,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    result = await ingest_news(
        db,
        queries=request.queries if request else None,
        max_items_per_source=request.max_items_per_source if request else 40,
        recency_hours=request.recency_hours if request else 48,
    )
    return {"success": True, "data": result}


@router.get("/feed")
async def news_feed_endpoint(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    items = get_news_feed(db, limit=limit)
    return {"success": True, "data": items}
