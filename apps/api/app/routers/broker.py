from fastapi import APIRouter, Depends
from app.dependencies.auth import get_current_user, SupabaseUser
from app.services.execution.engine import get_active_broker
from app.services.brokers.alpaca import AlpacaClient

router = APIRouter(prefix="/broker", tags=["broker"])


@router.get("/status")
async def broker_status(user: SupabaseUser = Depends(get_current_user)):
    """Return active broker and basic connectivity status."""
    info = get_active_broker()
    if info["name"] == "alpaca":
        try:
            client = AlpacaClient()
            account = await client.get_account()
            return {
                "success": True,
                "data": {
                    "broker": info,
                    "account_status": account.get("status"),
                    "buying_power": account.get("buying_power"),
                    "currency": account.get("currency"),
                },
            }
        except Exception as e:
            return {"success": False, "error": str(e), "broker": info}
    return {"success": False, "error": "No broker configured", "broker": info}
