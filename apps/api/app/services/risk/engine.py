from typing import Dict, Any, Optional


def calculate_atr_stop(entry_price: float, atr: float, direction: str, multiplier: float = 1.5) -> float:
    """Calculate initial stop based on ATR."""
    if direction == "BUY":
        return entry_price - (atr * multiplier)
    return entry_price + (atr * multiplier)


def calculate_take_profits(entry_price: float, stop_price: float, direction: str) -> list:
    """Calculate 1R and 2R take profit levels."""
    risk = abs(entry_price - stop_price)
    if risk == 0:
        return [entry_price, entry_price]

    if direction == "BUY":
        tp1 = entry_price + risk
        tp2 = entry_price + (2 * risk)
    else:
        tp1 = entry_price - risk
        tp2 = entry_price - (2 * risk)

    return [round(tp1, 2), round(tp2, 2)]


def calculate_position_size(
    portfolio_value: float,
    entry_price: float,
    stop_price: float,
    risk_limits: Dict[str, float],
    existing_exposure: float = 0,
) -> Optional[Dict[str, Any]]:
    """Calculate quantity and value for a new trade."""
    max_new_trade_risk = risk_limits.get("max_new_trade_risk_pct", 0.0025) * portfolio_value
    max_single_position = risk_limits.get("max_single_position_pct", 0.05) * portfolio_value
    available_position_budget = max_single_position - existing_exposure

    risk_per_share = abs(entry_price - stop_price)
    if risk_per_share == 0:
        return None

    quantity_by_risk = max_new_trade_risk / risk_per_share
    value_by_risk = quantity_by_risk * entry_price

    entry_value = min(value_by_risk, available_position_budget)
    if entry_value <= 0:
        return None

    quantity = entry_value / entry_price
    portfolio_risk_pct = (quantity * risk_per_share) / portfolio_value

    return {
        "quantity": round(quantity, 4),
        "entry_value": round(entry_value, 2),
        "portfolio_risk_pct": round(portfolio_risk_pct, 6),
        "risk_per_share": round(risk_per_share, 2),
    }


def validate_signal_against_risk(
    signal: Dict[str, Any],
    portfolio_value: float,
    risk_limits: Dict[str, float],
    existing_exposure: float = 0,
) -> Dict[str, Any]:
    """Validate and fill risk details in a signal."""
    entry_price = signal.get("entry_price") or signal.get("risk", {}).get("entry_price")
    stop_loss = signal.get("stop_loss") or signal.get("risk", {}).get("stop_loss")
    direction = signal.get("direction")

    if not entry_price or not stop_loss or not direction:
        signal["status"] = "REVIEW_REQUIRED"
        signal.setdefault("compliance", {}).setdefault("reasons", []).append("Missing price or stop")
        return signal

    sizing = calculate_position_size(
        portfolio_value=portfolio_value,
        entry_price=float(entry_price),
        stop_price=float(stop_loss),
        risk_limits=risk_limits,
        existing_exposure=existing_exposure,
    )

    if not sizing:
        signal["status"] = "REVIEW_REQUIRED"
        signal.setdefault("compliance", {}).setdefault("reasons", []).append("Cannot size position within risk limits")
        return signal

    signal.setdefault("risk", {})
    signal["risk"]["quantity"] = sizing["quantity"]
    signal["risk"]["entry_value"] = sizing["entry_value"]
    signal["risk"]["portfolio_risk_pct"] = sizing["portfolio_risk_pct"]

    return signal
