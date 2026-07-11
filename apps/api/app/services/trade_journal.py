from datetime import datetime, timezone
from typing import Optional, List
from uuid import uuid4
from sqlalchemy.orm import Session
from app.models import TradeRecord


def create_trade_record(
    db: Session,
    user_id: str,
    symbol: str,
    direction: str,
    quantity: float,
    entry_price: float,
    order_id: Optional[str] = None,
    signal_id: Optional[str] = None,
    position_id: Optional[str] = None,
    strategy: str = "manual",
) -> TradeRecord:
    trade = TradeRecord(
        id=uuid4(),
        user_id=user_id,
        symbol=symbol.upper(),
        direction=direction.upper(),
        quantity=quantity,
        entry_price=entry_price,
        entry_time=datetime.now(timezone.utc),
        order_id=order_id,
        signal_id=signal_id,
        position_id=position_id,
        strategy=strategy,
        status="open",
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


def close_trade_record(
    db: Session,
    trade_id: str,
    exit_price: float,
    realized_pnl: float,
) -> Optional[TradeRecord]:
    trade = db.query(TradeRecord).filter(TradeRecord.id == trade_id).first()
    if not trade:
        return None
    trade.exit_price = exit_price
    trade.exit_time = datetime.now(timezone.utc)
    trade.realized_pnl = realized_pnl
    trade.status = "closed"
    db.commit()
    db.refresh(trade)
    return trade


def update_trade_mfe_mae(
    db: Session,
    trade: TradeRecord,
    current_price: float,
) -> Optional[TradeRecord]:
    if not trade or trade.status != "open":
        return None

    if trade.direction == "BUY":
        excursion = (current_price - trade.entry_price) / trade.entry_price * 100
    else:
        excursion = (trade.entry_price - current_price) / trade.entry_price * 100

    if trade.max_favorable_excursion is None or excursion > trade.max_favorable_excursion:
        trade.max_favorable_excursion = max(0, excursion)
    if trade.max_adverse_excursion is None or excursion < trade.max_adverse_excursion:
        trade.max_adverse_excursion = min(0, excursion)

    db.commit()
    db.refresh(trade)
    return trade


def get_open_trades(db: Session, user_id: str) -> List[TradeRecord]:
    return db.query(TradeRecord).filter(
        TradeRecord.user_id == user_id,
        TradeRecord.status == "open"
    ).order_by(TradeRecord.entry_time.desc()).all()


def get_closed_trades(db: Session, user_id: str, limit: int = 100, offset: int = 0) -> List[TradeRecord]:
    return db.query(TradeRecord).filter(
        TradeRecord.user_id == user_id,
        TradeRecord.status == "closed"
    ).order_by(TradeRecord.exit_time.desc()).offset(offset).limit(limit).all()


def calculate_trade_stats(db: Session, user_id: str) -> dict:
    trades = db.query(TradeRecord).filter(
        TradeRecord.user_id == user_id,
        TradeRecord.status == "closed",
    ).all()

    if not trades:
        return {
            "total_trades": 0,
            "win_rate": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "profit_factor": 0.0,
            "avg_mfe": 0.0,
            "avg_mae": 0.0,
        }

    wins = [t for t in trades if t.realized_pnl and t.realized_pnl > 0]
    losses = [t for t in trades if t.realized_pnl and t.realized_pnl < 0]

    total_wins = sum(t.realized_pnl for t in wins) if wins else 0
    total_losses = abs(sum(t.realized_pnl for t in losses)) if losses else 0

    mfe_values = [t.max_favorable_excursion for t in trades if t.max_favorable_excursion is not None]
    mae_values = [t.max_adverse_excursion for t in trades if t.max_adverse_excursion is not None]

    return {
        "total_trades": len(trades),
        "win_rate": len(wins) / len(trades) * 100,
        "avg_win": total_wins / len(wins) if wins else 0,
        "avg_loss": total_losses / len(losses) if losses else 0,
        "profit_factor": total_wins / total_losses if total_losses > 0 else float("inf"),
        "avg_mfe": sum(mfe_values) / len(mfe_values) if mfe_values else 0,
        "avg_mae": sum(mae_values) / len(mae_values) if mae_values else 0,
    }