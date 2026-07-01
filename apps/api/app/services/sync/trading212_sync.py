from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import Broker, Position, Order
from app.services.brokers.trading212 import Trading212Client
from app.schemas import BrokerConfig


def _get_or_create_broker(db: Session, user_id: str, config: BrokerConfig) -> Broker:
    broker = db.query(Broker).filter(
        Broker.user_id == user_id,
        Broker.broker_name == config.broker_name,
        Broker.is_demo == config.is_demo,
    ).first()

    if not broker:
        broker = Broker(
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


async def sync_account_summary(db: Session, broker: Broker) -> Dict[str, Any]:
    client = Trading212Client(
        api_key=broker.api_key_encrypted,
        api_secret=broker.api_secret_encrypted,
        base_url="https://demo.trading212.com" if broker.is_demo else "https://live.trading212.com",
    )
    summary = await client.get_account_summary()
    broker.last_synced_at = datetime.utcnow()
    db.commit()
    return summary


async def sync_positions(db: Session, broker: Broker) -> Dict[str, Any]:
    client = Trading212Client(
        api_key=broker.api_key_encrypted,
        api_secret=broker.api_secret_encrypted,
        base_url="https://demo.trading212.com" if broker.is_demo else "https://live.trading212.com",
    )
    raw_positions = await client.get_positions()

    # Build lookup for existing positions by symbol
    existing = {
        p.symbol: p for p in db.query(Position).filter(
            Position.user_id == broker.user_id,
            Position.broker_id == broker.id,
        ).all()
    }

    synced = []
    for raw in raw_positions:
        symbol = raw.get("ticker")
        if not symbol:
            continue

        position = existing.get(symbol)
        quantity = float(raw.get("quantity", 0))
        avg_price = float(raw.get("averagePrice", 0))
        market_value = float(raw.get("currentPrice", 0)) * abs(quantity) if quantity else None
        unrealized_pnl = float(raw.get("ppl", 0)) if "ppl" in raw else None

        if position:
            position.quantity = quantity
            position.avg_price = avg_price
            position.market_value = market_value
            position.unrealized_pnl = unrealized_pnl
            position.last_synced_at = datetime.utcnow()
        else:
            position = Position(
                user_id=broker.user_id,
                broker_id=broker.id,
                symbol=symbol,
                quantity=quantity,
                avg_price=avg_price,
                market_value=market_value,
                unrealized_pnl=unrealized_pnl,
                last_synced_at=datetime.utcnow(),
            )
            db.add(position)

        synced.append(position)

    # Remove positions no longer present
    current_symbols = {p.symbol for p in synced}
    for symbol, position in existing.items():
        if symbol not in current_symbols:
            db.delete(position)

    db.commit()
    return {"synced": len(synced), "positions": raw_positions}


async def sync_orders(db: Session, broker: Broker) -> Dict[str, Any]:
    client = Trading212Client(
        api_key=broker.api_key_encrypted,
        api_secret=broker.api_secret_encrypted,
        base_url="https://demo.trading212.com" if broker.is_demo else "https://live.trading212.com",
    )
    raw_orders = await client.get_open_orders()

    existing = {
        str(o.broker_order_id): o for o in db.query(Order).filter(
            Order.user_id == broker.user_id,
            Order.broker_id == broker.id,
        ).all()
    }

    synced = []
    for raw in raw_orders:
        broker_order_id = str(raw.get("id"))
        if not broker_order_id:
            continue

        symbol = raw.get("ticker")
        quantity = float(raw.get("quantity", 0))
        direction = "SELL" if quantity < 0 else "BUY"
        order_type = (raw.get("type") or "market").lower()
        status = raw.get("status", "OPEN")
        filled_price = float(raw.get("filledPrice", 0)) or None
        limit_price = float(raw.get("limitPrice", 0)) or None
        stop_price = float(raw.get("stopPrice", 0)) or None
        time_validity = raw.get("timeValidity")

        order = existing.get(broker_order_id)
        if order:
            order.quantity = abs(quantity)
            order.direction = direction
            order.order_type = order_type
            order.status = status
            order.filled_price = filled_price
            order.limit_price = limit_price
            order.stop_price = stop_price
            order.time_validity = time_validity
            order.updated_at = datetime.utcnow()
        else:
            order = Order(
                user_id=broker.user_id,
                broker_id=broker.id,
                broker_order_id=broker_order_id,
                symbol=symbol,
                direction=direction,
                order_type=order_type,
                quantity=abs(quantity),
                status=status,
                filled_price=filled_price,
                limit_price=limit_price,
                stop_price=stop_price,
                time_validity=time_validity,
            )
            db.add(order)

        synced.append(order)

    # Remove closed/cancelled orders no longer in open orders list
    current_ids = {o.broker_order_id for o in synced if o.broker_order_id}
    for broker_order_id, order in existing.items():
        if broker_order_id not in current_ids:
            order.status = "CLOSED"
            order.updated_at = datetime.utcnow()

    db.commit()
    return {"synced": len(synced), "orders": raw_orders}


async def sync_all(db: Session, user_id: str, config: Optional[BrokerConfig] = None) -> Dict[str, Any]:
    if config:
        broker = _get_or_create_broker(db, user_id, config)
    else:
        broker = db.query(Broker).filter(
            Broker.user_id == user_id,
            Broker.is_active == True,
        ).first()

    if not broker:
        return {"error": "No active broker found"}

    summary = await sync_account_summary(db, broker)
    positions = await sync_positions(db, broker)
    orders = await sync_orders(db, broker)

    return {
        "account_summary": summary,
        "positions": positions,
        "orders": orders,
    }
