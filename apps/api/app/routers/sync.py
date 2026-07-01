from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.schemas import BrokerConfig
from app.services.sync.trading212_sync import sync_all, sync_positions, sync_orders, _get_or_create_broker
from app.services.sync.alpaca_sync import sync_alpaca_all
from app.models import Broker, Position, Order
from app.config import get_settings

router = APIRouter(prefix="/sync", tags=["sync"])


def _response(data: dict):
    if "error" in data:
        return {"success": False, "error": data["error"]}
    return {"success": True, "data": data}


def _ensure_broker(db: Session, user: SupabaseUser):
    broker = db.query(Broker).filter(
        Broker.user_id == user.id,
        Broker.is_active == True,
    ).first()

    if not broker:
        settings = get_settings()
        if settings.t212_api_key and settings.t212_api_secret:
            broker = _get_or_create_broker(db, user.id, BrokerConfig(
                broker_name="trading212",
                is_demo=settings.t212_base_url == "https://demo.trading212.com",
                api_key=settings.t212_api_key,
                api_secret=settings.t212_api_secret,
            ))

    return broker


@router.post("/all")
async def sync_all_endpoint(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    broker = _ensure_broker(db, user)
    if not broker:
        return {"success": False, "error": "No active broker found and no T212 env vars configured"}

    result = await sync_all(db, user.id)
    return _response(result)


@router.post("/positions")
async def sync_positions_endpoint(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    from app.services.sync.trading212_sync import _get_or_create_broker
    from app.models import Broker

    broker = _ensure_broker(db, user)
    if not broker:
        return {"success": False, "error": "No active broker found and no T212 env vars configured"}

    result = await sync_positions(db, broker)
    return _response(result)


@router.post("/orders")
async def sync_orders_endpoint(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    from app.models import Broker

    broker = _ensure_broker(db, user)
    if not broker:
        return {"success": False, "error": "No active broker found and no T212 env vars configured"}

    result = await sync_orders(db, broker)
    return _response(result)


@router.get("/portfolio")
async def get_portfolio(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    positions = db.query(Position).filter(Position.user_id == user.id).all()
    orders = db.query(Order).filter(Order.user_id == user.id).all()

    total_value = sum(p.market_value or 0 for p in positions)
    total_pnl = sum(p.unrealized_pnl or 0 for p in positions)

    return {
        "success": True,
        "data": {
            "positions": [
                {
                    "id": str(p.id),
                    "symbol": p.symbol,
                    "quantity": p.quantity,
                    "avg_price": p.avg_price,
                    "market_value": p.market_value,
                    "unrealized_pnl": p.unrealized_pnl,
                    "last_synced_at": p.last_synced_at.isoformat() if p.last_synced_at else None,
                }
                for p in positions
            ],
            "orders": [
                {
                    "id": str(o.id),
                    "symbol": o.symbol,
                    "direction": o.direction,
                    "order_type": o.order_type,
                    "quantity": o.quantity,
                    "status": o.status,
                    "filled_price": o.filled_price,
                    "limit_price": o.limit_price,
                    "stop_price": o.stop_price,
                }
                for o in orders
            ],
            "summary": {
                "total_value": total_value,
                "total_unrealized_pnl": total_pnl,
                "position_count": len(positions),
                "open_order_count": len([o for o in orders if o.status in ("OPEN", "PENDING")]),
            },
        },
    }


@router.post("/alpaca/all")
async def sync_alpaca_endpoint(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    result = await sync_alpaca_all(db, user.id)
    return _response(result)
