from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user, SupabaseUser
from app.models import TradeRecord
from app.services.trade_journal import (
    create_trade_record,
    close_trade_record,
    update_trade_mfe_mae,
    get_open_trades,
    get_closed_trades,
    calculate_trade_stats,
)

router = APIRouter(prefix="/trade-journal", tags=["trade-journal"])


class TradeRecordCreate(BaseModel):
    symbol: str
    direction: str  # BUY / SELL
    quantity: float
    entry_price: float
    order_id: Optional[str] = None
    signal_id: Optional[str] = None
    position_id: Optional[str] = None
    strategy: str = "manual"


class TradeRecordClose(BaseModel):
    exit_price: float


class TradeRecordResponse(BaseModel):
    id: str
    user_id: str
    symbol: str
    direction: str
    quantity: float
    entry_price: float
    entry_time: datetime
    exit_price: Optional[float]
    exit_time: Optional[datetime]
    realized_pnl: Optional[float]
    max_favorable_excursion: Optional[float]
    max_adverse_excursion: Optional[float]
    status: str
    strategy: str
    order_id: Optional[str]
    signal_id: Optional[str]
    position_id: Optional[str]

    class Config:
        from_attributes = True


def _trade_to_dict(t: TradeRecord) -> dict:
    return {
        "id": str(t.id),
        "user_id": t.user_id,
        "symbol": t.symbol,
        "direction": t.direction,
        "quantity": t.quantity,
        "entry_price": t.entry_price,
        "entry_time": t.entry_time.isoformat() if t.entry_time else None,
        "exit_price": t.exit_price,
        "exit_time": t.exit_time.isoformat() if t.exit_time else None,
        "realized_pnl": t.realized_pnl,
        "max_favorable_excursion": t.max_favorable_excursion,
        "max_adverse_excursion": t.max_adverse_excursion,
        "status": t.status,
        "strategy": t.strategy,
        "order_id": t.order_id,
        "signal_id": t.signal_id,
        "position_id": t.position_id,
    }


# Specific routes FIRST (before parameterized routes)
@router.get("/open")
async def list_open_trades(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    trades = get_open_trades(db, user.id)
    return {"success": True, "data": [_trade_to_dict(t) for t in trades]}


@router.get("/closed")
async def list_closed_trades(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    trades = get_closed_trades(db, user.id, limit=limit, offset=offset)
    return {"success": True, "data": [_trade_to_dict(t) for t in trades]}


@router.get("/stats")
async def get_trade_stats(
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    stats = calculate_trade_stats(db, user.id)
    return {"success": True, "data": stats}


@router.post("")
async def create_trade(
    payload: TradeRecordCreate,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    try:
        trade = create_trade_record(
            db=db,
            user_id=user.id,
            symbol=payload.symbol,
            direction=payload.direction,
            quantity=payload.quantity,
            entry_price=payload.entry_price,
            order_id=payload.order_id,
            signal_id=payload.signal_id,
            position_id=payload.position_id,
            strategy=payload.strategy,
        )
        return {"success": True, "data": _trade_to_dict(trade)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("")
async def list_trades(
    status: Optional[str] = Query(None, pattern="^(open|closed)$"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    if status == "open":
        trades = get_open_trades(db, user.id)
    elif status == "closed":
        trades = get_closed_trades(db, user.id, limit=limit, offset=offset)
    else:
        trades = get_open_trades(db, user.id) + get_closed_trades(db, user.id, limit=limit, offset=offset)

    return {"success": True, "data": [_trade_to_dict(t) for t in trades]}


# Parameterized routes LAST
@router.get("/{trade_id}")
async def get_trade(
    trade_id: UUID,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    trade = db.query(TradeRecord).filter(
        TradeRecord.id == trade_id,
        TradeRecord.user_id == user.id,
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"success": True, "data": _trade_to_dict(trade)}


@router.post("/{trade_id}/close")
async def close_trade(
    trade_id: UUID,
    payload: TradeRecordClose,
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    trade = db.query(TradeRecord).filter(
        TradeRecord.id == trade_id,
        TradeRecord.user_id == user.id,
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.status != "open":
        raise HTTPException(status_code=400, detail="Trade is not open")

    # Calculate realized P&L
    if trade.direction == "BUY":
        realized_pnl = (payload.exit_price - trade.entry_price) * trade.quantity
    else:
        realized_pnl = (trade.entry_price - payload.exit_price) * trade.quantity

    closed_trade = close_trade_record(db, str(trade_id), payload.exit_price, realized_pnl)
    return {"success": True, "data": _trade_to_dict(closed_trade)}


@router.post("/{trade_id}/update-mfe-mae")
async def update_mfe_mae(
    trade_id: UUID,
    current_price: float = Query(...),
    db: Session = Depends(get_db),
    user: SupabaseUser = Depends(get_current_user),
):
    trade = db.query(TradeRecord).filter(
        TradeRecord.id == trade_id,
        TradeRecord.user_id == user.id,
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    updated = update_trade_mfe_mae(db, trade, current_price)
    if not updated:
        raise HTTPException(status_code=400, detail="Trade is not open")
    return {"success": True, "data": _trade_to_dict(updated)}