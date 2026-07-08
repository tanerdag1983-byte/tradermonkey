from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.models import Broker, Order, Position, PositionAdvice, MarketBar
from app.services.llm.openrouter import OpenRouterClient

router = APIRouter(prefix="/manual", tags=["manual"])


def _response(data: dict):
    if isinstance(data, dict) and "error" in data:
        return {"success": False, "error": data["error"]}
    return {"success": True, "data": data}


def _get_or_create_manual_broker(db: Session, user: SupabaseUser) -> Broker:
    broker = (
        db.query(Broker)
        .filter(Broker.user_id == user.id, Broker.broker_name == "manual", Broker.is_active == True)
        .first()
    )
    if broker:
        return broker
    broker = Broker(
        user_id=user.id,
        broker_name="manual",
        is_demo=True,
        is_active=True,
    )
    db.add(broker)
    db.commit()
    db.refresh(broker)
    return broker


def _latest_close(db: Session, symbol: str) -> Optional[float]:
    bar = (
        db.query(MarketBar)
        .filter(MarketBar.symbol == symbol, MarketBar.timeframe == "1d")
        .order_by(desc(MarketBar.timestamp))
        .first()
    )
    return bar.close if bar else None


def _recalc_position(position: Position, db: Session):
    close = _latest_close(db, position.symbol.upper())
    avg_cost = position.avg_price * position.quantity
    if close is not None:
        position.market_value = close * position.quantity
        position.unrealized_pnl = position.market_value - avg_cost
    else:
        position.market_value = avg_cost
        position.unrealized_pnl = 0.0


# ---- Positions ----


class PositionCreate(BaseModel):
    symbol: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    avg_price: float = Field(gt=0)
    currency: Optional[str] = "USD"


class PositionUpdate(BaseModel):
    quantity: Optional[float] = Field(None, gt=0)
    avg_price: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = None


@router.post("/positions")
async def create_position(
    payload: PositionCreate,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    broker = _get_or_create_manual_broker(db, user)
    symbol = payload.symbol.upper()

    existing = (
        db.query(Position)
        .filter(Position.user_id == user.id, Position.broker_id == broker.id, Position.symbol == symbol)
        .first()
    )
    if existing:
        return {"success": False, "error": f"Position for {symbol} already exists; use PUT /manual/positions/{existing.id}"}

    position = Position(
        user_id=user.id,
        broker_id=broker.id,
        symbol=symbol,
        quantity=payload.quantity,
        avg_price=payload.avg_price,
        currency=payload.currency or "USD",
        last_synced_at=datetime.now(timezone.utc),
    )
    _recalc_position(position, db)
    db.add(position)
    db.commit()
    db.refresh(position)
    return {"success": True, "data": _position_to_dict(position)}


@router.get("/positions")
async def list_positions(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    positions = db.query(Position).filter(Position.user_id == user.id).all()
    return {"success": True, "data": [_position_to_dict(p) for p in positions]}


@router.put("/positions/{position_id}")
async def update_position(
    position_id: UUID,
    payload: PositionUpdate,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    position = (
        db.query(Position)
        .filter(Position.id == position_id, Position.user_id == user.id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    if payload.quantity is not None:
        position.quantity = payload.quantity
    if payload.avg_price is not None:
        position.avg_price = payload.avg_price
    if payload.currency is not None:
        position.currency = payload.currency
    position.last_synced_at = datetime.now(timezone.utc)
    _recalc_position(position, db)
    db.commit()
    db.refresh(position)
    return {"success": True, "data": _position_to_dict(position)}


@router.delete("/positions/{position_id}")
async def delete_position(
    position_id: UUID,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    position = (
        db.query(Position)
        .filter(Position.id == position_id, Position.user_id == user.id)
        .first()
    )
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    db.delete(position)
    db.commit()
    return {"success": True, "data": {"deleted": str(position_id)}}


def _position_to_dict(p: Position) -> dict:
    return {
        "id": str(p.id),
        "broker_id": str(p.broker_id),
        "symbol": p.symbol,
        "quantity": p.quantity,
        "avg_price": p.avg_price,
        "market_value": p.market_value,
        "unrealized_pnl": p.unrealized_pnl,
        "currency": p.currency,
        "last_synced_at": p.last_synced_at.isoformat() if p.last_synced_at else None,
    }


# ---- Orders ----


class OrderCreate(BaseModel):
    symbol: str = Field(min_length=1)
    direction: str = Field(pattern=r"^(BUY|SELL)$")
    order_type: str = Field(pattern=r"^(market|limit|stop|stop_limit)$")
    quantity: float = Field(gt=0)
    filled_price: Optional[float] = None
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    status: str = "filled"


@router.post("/orders")
async def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    symbol = payload.symbol.upper()
    price = payload.filled_price
    if price is None and payload.order_type == "market":
        price = _latest_close(db, symbol)
    if price is None:
        return {"success": False, "error": "Provide filled_price or a market bar for the symbol"}

    broker = _get_or_create_manual_broker(db, user)
    order = Order(
        user_id=user.id,
        broker_id=broker.id,
        symbol=symbol,
        direction=payload.direction.upper(),
        order_type=payload.order_type,
        quantity=payload.quantity,
        status=payload.status,
        filled_price=price,
        limit_price=payload.limit_price,
        stop_price=payload.stop_price,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return {"success": True, "data": _order_to_dict(order)}


@router.get("/orders")
async def list_orders(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    query = db.query(Order).filter(Order.user_id == user.id)
    if status:
        query = query.filter(Order.status == status)
    orders = query.order_by(Order.created_at.desc()).all()
    return {"success": True, "data": [_order_to_dict(o) for o in orders]}


@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()
    return {"success": True, "data": {"deleted": str(order_id)}}


def _order_to_dict(o: Order) -> dict:
    return {
        "id": str(o.id),
        "broker_id": str(o.broker_id) if o.broker_id else None,
        "symbol": o.symbol,
        "direction": o.direction,
        "order_type": o.order_type,
        "quantity": o.quantity,
        "status": o.status,
        "filled_price": o.filled_price,
        "limit_price": o.limit_price,
        "stop_price": o.stop_price,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


# ---- Position watcher / advice ----


class AdviceRunRequest(BaseModel):
    symbols: Optional[List[str]] = None  # subset; if empty, all positions


@router.post("/advice/run")
async def run_position_advice(
    request: Optional[AdviceRunRequest] = None,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    positions = db.query(Position).filter(Position.user_id == user.id)
    if request and request.symbols:
        symbols = [s.upper() for s in request.symbols]
        positions = positions.filter(Position.symbol.in_(symbols))
    positions = positions.all()

    if not positions:
        return {"success": True, "data": {"advice": [], "note": "No positions to watch"}}

    client = OpenRouterClient()
    advices = []
    for position in positions:
        symbol = position.symbol.upper()
        close = _latest_close(db, symbol)
        recent_news = (
            db.query(PositionAdvice)
            # placeholder; we actually need NewsItem, import it locally below
        )
        # Keep query minimal: fetch latest 5 news items mentioning the symbol
        from app.models import NewsItem
        news_items = (
            db.query(NewsItem)
            .filter(NewsItem.title.ilike(f"%{symbol}%") | NewsItem.body.ilike(f"%{symbol}%"))
            .order_by(NewsItem.published_at.desc())
            .limit(5)
            .all()
        )
        news_summary = []
        sentiment_avg = 0.0
        if news_items:
            sentiments = [n.sentiment_score for n in news_items if n.sentiment_score is not None]
            sentiment_avg = sum(sentiments) / len(sentiments) if sentiments else 0.0
            news_summary = [
                {"title": n.title, "sentiment_score": n.sentiment_score, "published_at": n.published_at.isoformat() if n.published_at else None}
                for n in news_items
            ]

        prompt = _build_advice_prompt(position, close, sentiment_avg, news_summary)
        try:
            completion = await client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="anthropic/claude-sonnet-5",
                temperature=0.1,
                max_tokens=1200,
                response_format={"type": "json_object"},
            )
            content = completion["choices"][0]["message"]["content"]
            import json
            parsed = json.loads(content)
        except Exception as exc:
            parsed = {
                "recommendation": "NO_ADVICE",
                "confidence": 0.0,
                "reasoning": f"AI call failed: {exc}",
            }

        recommendation = parsed.get("recommendation", "NO_ADVICE")
        confidence = parsed.get("confidence", 0.0)
        reasoning = parsed.get("reasoning", "")

        advice = PositionAdvice(
            id=uuid4(),
            user_id=user.id,
            symbol=symbol,
            quantity=position.quantity,
            avg_price=position.avg_price,
            latest_price=close,
            recommendation=recommendation,
            confidence=confidence,
            reasoning=reasoning,
            news_sentiment_avg=sentiment_avg,
            generated_at=datetime.now(timezone.utc),
        )
        db.add(advice)
        advices.append(advice)

    db.commit()
    for a in advices:
        db.refresh(a)

    return {
        "success": True,
        "data": {
            "advice": [_advice_to_dict(a) for a in advices],
        },
    }


@router.get("/advice")
async def list_advice(
    limit: int = 20,
    symbol: Optional[str] = None,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    query = db.query(PositionAdvice).filter(PositionAdvice.user_id == user.id)
    if symbol:
        query = query.filter(PositionAdvice.symbol == symbol.upper())
    advice_list = query.order_by(PositionAdvice.generated_at.desc()).limit(limit).all()
    return {"success": True, "data": [_advice_to_dict(a) for a in advice_list]}


def _advice_to_dict(a: PositionAdvice) -> dict:
    return {
        "id": str(a.id),
        "symbol": a.symbol,
        "quantity": a.quantity,
        "avg_price": a.avg_price,
        "latest_price": a.latest_price,
        "recommendation": a.recommendation,
        "confidence": a.confidence,
        "reasoning": a.reasoning,
        "news_sentiment_avg": a.news_sentiment_avg,
        "generated_at": a.generated_at.isoformat() if a.generated_at else None,
    }


def _build_advice_prompt(position: Position, latest_price: Optional[float], sentiment_avg: float, news_summary: list) -> str:
    unrealized_pct = 0.0
    if latest_price and position.avg_price:
        unrealized_pct = (latest_price - position.avg_price) / position.avg_price * 100

    return (
        f"You are an experienced risk analyst for a retail trader. "
        f"Analyze this position and respond ONLY with a single JSON object (no markdown).\n\n"
        f"Symbol: {position.symbol}\n"
        f"Quantity: {position.quantity}\n"
        f"Average entry price: {position.avg_price}\n"
        f"Latest price: {latest_price or 'unknown'}\n"
        f"Unrealized P&L %: {unrealized_pct:.2f}%\n"
        f"Average news sentiment (-1 very bearish, 0 neutral, +1 very bullish): {sentiment_avg:.2f}\n"
        f"Recent news:\n" + "\n".join(f"- {n['title']} (sentiment {n['sentiment_score']})" for n in news_summary) + "\n\n"
        f"Return JSON with exactly these keys:\n"
        f"- recommendation: one of HOLD, ADD, REDUCE, EXIT, NO_ADVICE\n"
        f"- confidence: number 0-1\n"
        f"- reasoning: concise string in Dutch."
    )
