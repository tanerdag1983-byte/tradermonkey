from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import engine, Base, ensure_constraints
from app.routers import health, sync, news, signals, market, broker, system, scheduler, research, manual, trade_journal, trade_journal
from app.services.scheduler import build_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Ensure all tables exist in both development and production
    Base.metadata.create_all(bind=engine)
    # Apply constraints that create_all() leaves out on existing tables
    ensure_constraints()

    if settings.enable_scheduler:
        logger.info("Scheduler is enabled; building and starting APScheduler jobs")
        scheduler_instance = build_scheduler()
        app.state.scheduler = scheduler_instance
        scheduler_instance.start()
        logger.info("Scheduler started with %d jobs", len(scheduler_instance.get_jobs()))
    else:
        logger.info("Scheduler is disabled")
    yield
    if getattr(app.state, "scheduler", None):
        app.state.scheduler.shutdown(wait=False)


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sync.router)
app.include_router(news.router)
app.include_router(signals.router)
app.include_router(market.router)
app.include_router(broker.router)
app.include_router(system.router)
app.include_router(scheduler.router)
app.include_router(research.router)
app.include_router(manual.router)
app.include_router(trade_journal.router)
app.include_router(trade_journal.router)


@app.get("/")
async def root():
    return {"message": "TraderMonkeys API", "version": "0.1.0"}
