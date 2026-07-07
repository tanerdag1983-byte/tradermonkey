import logging
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> dict:
    """Send an email via Resend if configured; otherwise log the message.

    Returns {"sent": bool, "provider": str, "detail": optional message}
    """
    settings = get_settings()
    api_key = settings.resend_api_key
    from_email = settings.notification_from_email or "onboarding@resend.dev"

    if not api_key or not to_email:
        logger.info(
            "[email] Skipping email to %s (Resend not configured): %s",
            to_email,
            subject,
        )
        return {
            "sent": False,
            "provider": "none",
            "detail": "RESEND_API_KEY or recipient missing",
        }

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            logger.info("[email] Sent email to %s, id=%s", to_email, data.get("id"))
            return {"sent": True, "provider": "resend", "id": data.get("id")}
    except httpx.HTTPStatusError as e:
        logger.exception("[email] Resend error %s: %s", e.response.status_code, e.response.text)
        return {
            "sent": False,
            "provider": "resend",
            "detail": f"Resend HTTP {e.response.status_code}: {e.response.text}",
        }
    except Exception as e:
        logger.exception("[email] Failed to send email: %s", e)
        return {"sent": False, "provider": "resend", "detail": str(e)}


def build_research_digest_html(proposals: list, frequency: str, currency: str) -> str:
    title = f"TraderMonkeys {frequency.capitalize()} Research Digest"
    rows = []
    for p in proposals[:10]:
        direction = p.get("direction", "HOLD")
        color = "#16a34a" if direction == "BUY" else "#dc2626" if direction == "SELL" else "#4b5563"
        rows.append(
            f"""
            <tr>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">{p.get('symbol')}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:{color};">{direction}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">{p.get('entry_price') or '—'}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">{p.get('suggested_amount') or '—'} {currency}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">{p.get('thesis') or ''}</td>
            </tr>
            """
        )

    table_rows = "".join(rows) if rows else "<tr><td colspan=5 style='padding:8px;'>Geen voorstellen deze periode.</td></tr>"

    return f"""
    <html>
      <body style="font-family:system-ui,sans-serif;color:#1f2937;">
        <h2>{title}</h2>
        <p>Hier zijn je laatste onderzoeksvoorstellen:</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:8px;">Symbool</th>
              <th style="padding:8px;">Richting</th>
              <th style="padding:8px;">Entry</th>
              <th style="padding:8px;">Bedrag</th>
              <th style="padding:8px;">Thesis</th>
            </tr>
          </thead>
          <tbody>
            {table_rows}
          </tbody>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#6b7280;">
          Je ontvangt dit omdat je email-notificaties hebt ingeschakeld in TraderMonkeys.
        </p>
      </body>
    </html>
    """


def build_research_digest_text(proposals: list, frequency: str, currency: str) -> str:
    lines = [f"TraderMonkeys {frequency.capitalize()} Research Digest", ""]
    if not proposals:
        lines.append("Geen voorstellen deze periode.")
    for p in proposals[:10]:
        lines.append(
            f"- {p.get('symbol')} | {p.get('direction')} | entry {p.get('entry_price') or '—'} | "
            f"bedrag {p.get('suggested_amount') or '—'} {currency} | {p.get('thesis') or ''}"
        )
    return "\n".join(lines)
