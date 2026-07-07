import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.debug,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_constraints() -> None:
    """Idempotent DB fixes that create_all() doesn't apply to existing tables."""
    try:
        with engine.begin() as conn:
            # Remove any duplicate bars before enforcing uniqueness
            conn.execute(
                text(
                    """
                    DELETE FROM market_bars
                    WHERE id NOT IN (
                        SELECT id FROM (
                            SELECT id,
                                ROW_NUMBER() OVER (
                                    PARTITION BY symbol, timeframe, timestamp
                                    ORDER BY created_at DESC, id DESC
                                ) AS rn
                            FROM market_bars
                        ) ranked
                        WHERE rn = 1
                    );
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uix_market_bars_symbol_timeframe_timestamp
                    ON market_bars (symbol, timeframe, timestamp);
                    """
                )
            )
        logger.info("Ensured unique index on market_bars(symbol, timeframe, timestamp)")
    except Exception as exc:
        logger.warning("Could not ensure market_bars unique index: %s", exc)
