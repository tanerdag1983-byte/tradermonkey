from sqlalchemy.orm import Session
from app.models import Position, Order
from app.schemas import BrokerConfig
from app.services.brokers.alpaca import AlpacaClient


def _get_or_create_broker(db: Session, user_id: str, config: BrokerConfig):
    from app.models import Broker
    from uuid import uuid4

    broker = db.query(Broker).filter(
        Broker.user_id == user_id,
        Broker.broker_name == config.broker_name,
    ).first()

    if not broker:
        broker = Broker(
            id=uuid4(),
            user_id=user_id,
            broker_name=config.broker_name,
            is_demo=config.is_demo,
            api_key_encrypted=config.api_key,
            api_secret_encrypted=config.api_secret,
            is_active=True,
        )
        db.add(broker)
        db.commit()
        db.refresh(broker)

    return broker


async def sync_alpaca_all(db: Session, user_id: str) -> dict:
    client = AlpacaClient()

    try:
        account = await client.get_account()
        positions = await client.get_positions()
    except Exception as e:
        return {"error": f"Alpaca sync failed: {str(e)}"}

    # Upsert broker
    broker = _get_or_create_broker(
        db,
        user_id,
        BrokerConfig(
            broker_name="alpaca",
            is_demo=True,
            api_key="env",
            api_secret="env",
        ),
    )

    # Sync positions
    for pos in positions:
        symbol = pos.get("symbol")
        if not symbol:
            continue

        existing = db.query(Position).filter(
            Position.user_id == user_id,
            Position.broker_id == broker.id,
            Position.symbol == symbol,
        ).first()

        qty = float(pos.get("qty", 0) or 0)
        avg_price = float(pos.get("avg_entry_price", 0) or 0)
        market_value = float(pos.get("market_value", 0) or 0)
        unrealized_pnl = float(pos.get("unrealized_pl", 0) or 0)

        if existing:
            existing.quantity = qty
            existing.avg_price = avg_price
            existing.market_value = market_value
            existing.unrealized_pnl = unrealized_pnl
        else:
            from uuid import uuid4
            existing = Position(
                id=uuid4(),
                user_id=user_id,
                broker_id=broker.id,
                symbol=symbol,
                quantity=qty,
                avg_price=avg_price,
                market_value=market_value,
                unrealized_pnl=unrealized_pnl,
                currency="USD",
            )
            db.add(existing)

    db.commit()

    return {
        "account": {
            "status": account.get("status"),
            "buying_power": account.get("buying_power"),
            "cash": account.get("cash"),
            "currency": account.get("currency"),
            "portfolio_value": account.get("portfolio_value"),
        },
        "positions_count": len(positions),
    }
