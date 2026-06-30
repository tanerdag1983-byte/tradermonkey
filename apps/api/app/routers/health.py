from fastapi import APIRouter, Depends
from datetime import datetime
from app.config import get_settings, Settings
from app.schemas import HealthStatus, Trading212Health
from app.services.brokers.trading212 import Trading212Client

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthStatus)
async def health(settings: Settings = Depends(get_settings)):
    return HealthStatus(
        status="ok",
        environment=settings.app_env,
        timestamp=datetime.utcnow(),
    )


@router.get("/trading212", response_model=Trading212Health)
async def health_trading212():
    try:
        client = Trading212Client()
        result = await client.health_check()
        return Trading212Health(**result)
    except ValueError as e:
        return Trading212Health(reachable=False, error=str(e))
