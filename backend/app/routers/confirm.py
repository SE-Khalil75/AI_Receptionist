"""
Appointment confirmation / cancellation endpoints.

Customers receive an email with two links:
  GET /confirm/{appointment_id}?action=confirm&token=<hmac>
  GET /confirm/{appointment_id}?action=cancel&token=<hmac>

On confirm  → status set to "confirmed", Google Calendar event created.
On cancel   → status set to "cancelled".
Both return a simple HTML response the customer sees in their browser.
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

from app.services import supabase_service as db
from app.services.email_service import verify_token
from app.services import calendar_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/confirm", tags=["confirm"])


def _html_response(title: str, heading: str, body: str, color: str = "#16a34a", icon: str = "✓") -> HTMLResponse:
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="width:100%;max-width:440px;margin:24px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:48px 40px;text-align:center;box-sizing:border-box;">
    <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.05);border:1px solid {color}44;margin:0 auto 28px;display:flex;align-items:center;justify-content:center;font-size:30px;line-height:1;">
      {icon}
    </div>
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:{color};letter-spacing:-0.02em;">{heading}</h1>
    <p style="margin:0 0 36px;font-size:15px;color:#9ca3af;line-height:1.7;">{body}</p>
    <p style="margin:0;font-size:12px;color:#374151;">AI Receptionist &middot; AppointEase</p>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/{appointment_id}")
def handle_confirmation(
    appointment_id: str,
    action: str = Query(..., pattern="^(confirm|cancel)$"),
    token: str = Query(...),
    fmt: str = Query(default="html", alias="format"),
):
    try:
        return _handle(appointment_id, action, token, fmt)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error in confirm handler: %s", exc)
        if fmt == "json":
            from fastapi.responses import JSONResponse
            return JSONResponse({"status": "error", "detail": str(exc)}, status_code=500)
        return _html_response(
            "Error",
            "Something went wrong",
            f"An unexpected error occurred. Please try again or contact support.<br>"
            f"<span style='font-size:12px;color:#4b5563'>{exc}</span>",
            color="#f59e0b", icon="!",
        )


def _handle(appointment_id: str, action: str, token: str, fmt: str):
    # Verify HMAC token
    if not verify_token(appointment_id, action, token):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link.")

    appt = db.get_appointment(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    status = appt.get("status", "")

    # Idempotency: already processed
    if action == "confirm" and status == "confirmed":
        if fmt == "json":
            return JSONResponse({"status": "already_confirmed", "action": "confirm",
                                 "customer_name": appt.get("customer_name"),
                                 "service": appt.get("service"),
                                 "scheduled_at": appt.get("scheduled_at"),
                                 "duration_minutes": appt.get("duration_minutes")})
        return _html_response(
            "Already Confirmed",
            "Already Confirmed ✓",
            "Your appointment has already been confirmed.<br>We look forward to seeing you!",
        )
    if action == "cancel" and status == "cancelled":
        if fmt == "json":
            return JSONResponse({"status": "already_cancelled", "action": "cancel"})
        return _html_response(
            "Already Cancelled",
            "Already Cancelled",
            "This appointment was already cancelled.",
            color="#ef4444", icon="✗",
        )

    if action == "confirm":
        db.update_appointment(appointment_id, {"status": "confirmed"})

        # Create Google Calendar event
        business = db.get_business_company()
        business_name = business["name"] if business else "Our Business"
        customer_name = appt.get("customer_name", "Customer")
        service = appt.get("service") or "Appointment"
        scheduled_at = appt.get("scheduled_at", "")
        duration = appt.get("duration_minutes", 60)
        customer_email = appt.get("customer_email")

        try:
            start_dt = datetime.fromisoformat(scheduled_at)
        except (ValueError, TypeError):
            start_dt = None

        cal_event_id = None
        if start_dt:
            cal_event_id = calendar_service.create_calendar_event(
                summary=f"{service} – {customer_name}",
                description=(
                    f"Customer: {customer_name}\n"
                    f"Phone: {appt.get('customer_phone', '')}\n"
                    f"Email: {customer_email or ''}\n"
                    f"Notes: {appt.get('notes') or ''}"
                ),
                start_dt=start_dt,
                duration_minutes=duration,
                attendee_email=customer_email,
            )

        if cal_event_id:
            logger.info("Google Calendar event created: %s for appointment %s", cal_event_id, appointment_id)

        scheduled_display = start_dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " ") if start_dt else scheduled_at
        logger.info("Appointment %s confirmed by customer.", appointment_id)

        if fmt == "json":
            return JSONResponse({
                "status": "confirmed",
                "action": "confirm",
                "customer_name": customer_name,
                "service": service,
                "scheduled_at": appt.get("scheduled_at"),
                "scheduled_display": scheduled_display,
                "duration_minutes": duration,
                "business_name": business_name,
            })
        return _html_response(
            "Appointment Confirmed",
            "Appointment Confirmed!",
            f"Thank you, <strong style='color:#f3f4f6'>{customer_name}</strong>!<br><br>"
            f"<strong style='color:#f3f4f6'>{service}</strong><br>"
            f"<span style='color:#6b7280;font-size:13px'>{scheduled_display} &middot; {duration} min &middot; {business_name}</span>",
        )

    else:  # cancel
        db.update_appointment(appointment_id, {"status": "cancelled"})
        logger.info("Appointment %s cancelled by customer.", appointment_id)

        if fmt == "json":
            return JSONResponse({"status": "cancelled", "action": "cancel",
                                 "customer_name": appt.get("customer_name"),
                                 "service": appt.get("service")})
        return _html_response(
            "Appointment Cancelled",
            "Appointment Cancelled",
            "Your appointment has been cancelled.<br>Please call us if you'd like to reschedule.",
            color="#ef4444", icon="✗",
        )
