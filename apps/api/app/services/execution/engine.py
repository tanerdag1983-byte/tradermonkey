from typing import Dict, Any
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Signal, Order
from app.services.brokers.alpaca import AlpacaClient


def get_active_broker() -> Dict[str, Any]:
    """Determine active broker based on environment/config."""
    settings = get_settings()
    if settings.alpaca_api_key and settings.alpaca_secret_key:
        return {"name": "alpaca", "mode": "paper" if "paper" in settings.alpaca_base_url else "live"}
    return {"name": "unknown", "mode": "none"}


async def execute_signal(
    db: Session,
    signal: Signal,
    user_id: str,
) -> Dict[str, Any]:
    """Execute an approved signal against the configured broker."""
    settings = get_settings()
    broker_info = get_active_broker()

    if broker_info["name"] != "alpaca":
        return {"success": False, "error": "No executable broker configured"}

    if signal.status != "approved":
        return {"success": False, "error": "Signal must be approved before execution"}

    if not signal.entry_price or not signal.quantity:
        return {"success": False, "error": "Signal missing price or quantity"}

    client = AlpacaClient()

    try:
        order_response = await client.submit_order(
            symbol=signal.symbol,
            side=signal.direction.lower(),
            qty=signal.quantity,
            order_type=signal.entry_type or "market",
            limit_price=signal.entry_price if signal.entry_type in ("limit", "stop_limit") else None,
            stop_price=signal.stop_loss if signal.entry_type in ("stop", "stop_limit") else None,
        )

        # Persist order locally
        order = Order(
            user_id=user_id,
            broker_id=None,  # Alpaca is env-based for now
            broker_order_id=str(order_response.get("id")),
            symbol=signal.symbol,
            direction=signal.direction.upper(),
            order_type=signal.entry_type or "market",
            quantity=signal.quantity,
            status=order_response.get("status", "submitted"),
            filled_price=order_response.get("filled_avg_price"),
        )
        db.add(order)
        signal.status = "executed"
        db.commit()

        return {"success": True, "data": order_response, "broker": broker_info}
    except Exception as e:
        return {"success": False, "error": str(e), "broker": broker_info}
