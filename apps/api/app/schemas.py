from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class HealthStatus(BaseModel):
    status: str
    version: str = "0.1.0"
    environment: str
    timestamp: datetime


class BrokerConfig(BaseModel):
    broker_name: str = "trading212"
    is_demo: bool = True
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    base_url: Optional[str] = "https://demo.trading212.com"


class Trading212Health(BaseModel):
    reachable: bool
    account_id: Optional[str] = None
    currency: Optional[str] = None
    total_balance: Optional[float] = None
    error: Optional[str] = None


class PositionSchema(BaseModel):
    id: UUID
    user_id: str
    broker_id: UUID
    symbol: str
    quantity: float
    avg_price: float
    market_value: Optional[float]
    unrealized_pnl: Optional[float]
    currency: Optional[str]
    last_synced_at: Optional[datetime]

    class Config:
        from_attributes = True


class SignalSchema(BaseModel):
    id: UUID
    user_id: str
    symbol: str
    direction: str
    entry_type: Optional[str]
    entry_price: Optional[float]
    stop_loss: Optional[float]
    take_profit_1: Optional[float]
    take_profit_2: Optional[float]
    quantity: Optional[float]
    confidence: Optional[float]
    status: str
    generated_at: datetime

    class Config:
        from_attributes = True


class NewsItemSchema(BaseModel):
    id: UUID
    source: str
    source_class: str
    publisher: Optional[str]
    title: str
    language: Optional[str]
    published_at: Optional[datetime]
    sentiment_score: Optional[float]
    entities: Optional[dict]

    class Config:
        from_attributes = True
