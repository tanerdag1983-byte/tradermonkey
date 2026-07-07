from typing import Any, Optional
from sqlalchemy.orm import Session
from app.models import UserSetting


DEFAULT_RESEARCH_SETTINGS = {
    "budget": 1000.0,
    "currency": "EUR",
    "risk_profile": "moderate",
    "watchlist": [],
    "sectors": [],
}


def get_user_setting(db: Session, user_id: str, key: str) -> Optional[dict]:
    row = db.query(UserSetting).filter_by(user_id=user_id, key=key).first()
    if row:
        return row.value if isinstance(row.value, dict) else {}
    return None


def set_user_setting(db: Session, user_id: str, key: str, value: dict) -> dict:
    row = db.query(UserSetting).filter_by(user_id=user_id, key=key).first()
    if row:
        row.value = value
    else:
        row = UserSetting(user_id=user_id, key=key, value=value)
        db.add(row)
    db.commit()
    return value


def get_research_settings(db: Session, user_id: str) -> dict:
    existing = get_user_setting(db, user_id, "research_defaults")
    if existing:
        settings = dict(DEFAULT_RESEARCH_SETTINGS)
        settings.update(existing)
        return settings
    return dict(DEFAULT_RESEARCH_SETTINGS)


def update_research_settings(db: Session, user_id: str, payload: dict) -> dict:
    current = get_research_settings(db, user_id)
    merged = {**current, **payload}
    for bad_key in ("budget",):
        val = merged.get("budget")
        if val is not None:
            try:
                merged["budget"] = float(val)
            except (ValueError, TypeError):
                merged["budget"] = current.get("budget", 1000.0)
    for key in ("currency", "risk_profile"):
        if merged.get(key):
            merged[key] = str(merged[key]).upper() if key == "currency" else str(merged[key]).lower()
    watchlist = merged.get("watchlist")
    if isinstance(watchlist, str):
        merged["watchlist"] = [s.strip().upper() for s in watchlist.split(",") if s.strip()]
    elif isinstance(watchlist, list):
        merged["watchlist"] = [str(s).strip().upper() for s in watchlist if str(s).strip()]

    sectors = merged.get("sectors")
    if isinstance(sectors, str):
        merged["sectors"] = [s.strip().lower() for s in sectors.split(",") if s.strip()]
    elif isinstance(sectors, list):
        merged["sectors"] = [str(s).strip().lower() for s in sectors if str(s).strip()]

    return set_user_setting(db, user_id, "research_defaults", merged)
