import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Broker(Base):
    __tablename__ = "brokers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    broker_name = Column(String, nullable=False, default="trading212")
    is_demo = Column(Boolean, default=True)
    api_key_encrypted = Column(Text, nullable=True)
    api_secret_encrypted = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Position(Base):
    __tablename__ = "positions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    broker_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=False)
    market_value = Column(Float, nullable=True)
    unrealized_pnl = Column(Float, nullable=True)
    realized_pnl = Column(Float, nullable=True)
    currency = Column(String, nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    broker_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    broker_order_id = Column(String, nullable=True, index=True)
    symbol = Column(String, nullable=False, index=True)
    direction = Column(String, nullable=False)  # BUY / SELL
    order_type = Column(String, nullable=False)  # market / limit / stop / stop_limit
    quantity = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="pending")
    filled_price = Column(Float, nullable=True)
    limit_price = Column(Float, nullable=True)
    stop_price = Column(Float, nullable=True)
    time_validity = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Signal(Base):
    __tablename__ = "signals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    direction = Column(String, nullable=True)  # BUY / SELL / None for NO_TRADE
    entry_type = Column(String, nullable=True)
    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit_1 = Column(Float, nullable=True)
    take_profit_2 = Column(Float, nullable=True)
    quantity = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="generated")  # generated / approved / rejected / executed
    analysis_json = Column(JSON, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)


class NewsItem(Base):
    __tablename__ = "news_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String, nullable=False)
    source_class = Column(String, nullable=False, index=True)
    publisher = Column(String, nullable=True)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=True)
    language = Column(String, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    sentiment_score = Column(Float, nullable=True)
    entities = Column(JSON, nullable=True)
    embedding = Column(JSON, nullable=True)
    url = Column(Text, nullable=True)
    fetched_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class MarketBar(Base):
    __tablename__ = "market_bars"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String, nullable=False, index=True)
    timeframe = Column(String, nullable=False, index=True)  # e.g. 1d, 1h, 15m
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        # Ensure unique bars per symbol/timeframe/timestamp
        UniqueConstraint(
            "symbol",
            "timeframe",
            "timestamp",
            name="uix_market_bars_symbol_timeframe_timestamp",
        ),
        {"comment": "OHLCV market bars"},
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ResearchProposal(Base):
    __tablename__ = "research_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    frequency = Column(String, nullable=False, index=True)  # daily / weekly / monthly
    direction = Column(String, nullable=False)  # BUY / HOLD / SELL
    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit_1 = Column(Float, nullable=True)
    take_profit_2 = Column(Float, nullable=True)
    quantity = Column(Float, nullable=True)
    suggested_amount = Column(Float, nullable=True)  # amount in budget currency
    confidence = Column(Float, nullable=True)
    thesis = Column(Text, nullable=True)
    budget = Column(Float, nullable=True)
    currency = Column(String, nullable=True)
    risk_profile = Column(String, nullable=True)
    status = Column(String, nullable=False, default="generated")  # generated / reviewed
    analysis_json = Column(JSON, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class UserSetting(Base):
    __tablename__ = "user_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),
        {"comment": "Per-user key/value settings"},
    )


class PositionAdvice(Base):
    __tablename__ = "position_advice"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=False)
    latest_price = Column(Float, nullable=True)
    recommendation = Column(String, nullable=False, default="NO_ADVICE")
    confidence = Column(Float, nullable=True)
    reasoning = Column(Text, nullable=True)
    news_sentiment_avg = Column(Float, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TradeRecord(Base):
    __tablename__ = "trade_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    direction = Column(String, nullable=False)  # BUY / SELL
    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    entry_time = Column(DateTime(timezone=True), default=datetime.utcnow)
    exit_time = Column(DateTime(timezone=True), nullable=True)
    realized_pnl = Column(Float, nullable=True)
    pnl_pct = Column(Float, nullable=True)
    max_favorable_excursion = Column(Float, nullable=True)  # MFE
    max_adverse_excursion = Column(Float, nullable=True)    # MAE
    status = Column(String, nullable=False, default="open")  # open / closed
    source = Column(String, nullable=True)  # signal / manual / research
    source_id = Column(String, nullable=True)  # reference to signal/order/research id
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
