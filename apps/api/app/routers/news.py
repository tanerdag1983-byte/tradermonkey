from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.services.sources.ingestor import ingest_news, get_news_feed

router = APIRouter(prefix="/news", tags=["news"])


@router.post("/ingest")
async def ingest_news_endpoint(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    result = await ingest_news(db)
    return {"success": True, "data": result}


@router.get("/feed")
async def news_feed_endpoint(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    items = get_news_feed(db, limit=limit)
    return {"success": True, "data": items}
