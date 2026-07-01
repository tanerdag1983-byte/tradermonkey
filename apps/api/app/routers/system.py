from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from app.dependencies.auth import get_current_user, SupabaseUser

router = APIRouter(prefix="/system", tags=["system"])

PROMPT_DIR = Path("/app/prompts")
PROMPT_FILE = PROMPT_DIR / "signal_prompt.txt"


def _ensure_prompt_dir():
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/prompt")
async def get_prompt(user: SupabaseUser = Depends(get_current_user)):
    """Return the current active signal prompt."""
    if PROMPT_FILE.exists():
        return {"success": True, "data": {"source": "override", "content": PROMPT_FILE.read_text(encoding="utf-8")}}
    from app.services.signal.engine import DEFAULT_SIGNAL_PLANNER_PROMPT
    return {"success": True, "data": {"source": "default", "content": DEFAULT_SIGNAL_PLANNER_PROMPT}}


@router.post("/prompt")
async def update_prompt(request: dict, user: SupabaseUser = Depends(get_current_user)):
    """Override the signal prompt. Pass {"content": "..."} or {"reset": true}."""
    _ensure_prompt_dir()
    if request.get("reset"):
        if PROMPT_FILE.exists():
            PROMPT_FILE.unlink()
        return {"success": True, "data": {"source": "default"}}

    content = request.get("content")
    if not content or not isinstance(content, str):
        return {"success": False, "error": "content is required"}

    try:
        # Validate that template placeholders are present
        required = ["{request_id}", "{portfolio}", "{broker}", "{market_state}", "{sources}"]
        missing = [p for p in required if p not in content]
        if missing:
            return {"success": False, "error": f"Missing placeholders: {', '.join(missing)}"}

        PROMPT_FILE.write_text(content, encoding="utf-8")
        return {"success": True, "data": {"source": "override"}}
    except Exception as e:
        return {"success": False, "error": str(e)}
