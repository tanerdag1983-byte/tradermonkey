from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "TraderMonkeys API"
    debug: bool = True
    log_level: str = "info"
    port: int = 8000
    host: str = "0.0.0.0"

    database_url: str

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    t212_api_key: str = ""
    t212_api_secret: str = ""
    t212_base_url: str = "https://demo.trading212.com"

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # Apify: token + actor ids for Reddit, X/Twitter and news crawling
    apify_api_token: str = ""
    apify_reddit_actor_id: str = ""
    apify_twitter_actor_id: str = ""
    apify_news_actor_id: str = ""
    apify_max_results_per_source: int = 20

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Optional path to a file containing a custom signal prompt template
    signal_prompt_override_path: str = ""

    # Optional path to a file containing a custom research prompt template
    research_prompt_override_path: str = ""

    # Scheduler settings
    enable_scheduler: bool = False
    scheduler_user_id: str = "scheduler"
    scheduler_news_interval_minutes: int = 60
    scheduler_signals_time: str = "09:30"
    scheduler_signals_timezone: str = "US/Eastern"
    scheduler_default_watchlist: str = "AAPL,MSFT,AMZN,GOOGL,META,TSLA,NVDA,AMD,INTC,NFLX,CRM,BABA,JPM,V,MA,DIS"

    # Default values used by the scheduler-generated research proposals
    research_default_budget: float = 1000.0
    research_default_currency: str = "EUR"
    research_default_risk_profile: str = "moderate"

    # Notifications (email digest)
    resend_api_key: str = ""
    notification_from_email: str = "noreply@tradermonkeys.app"
    admin_email: str = ""
    enable_email_digest: bool = False

    sentry_dsn: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
