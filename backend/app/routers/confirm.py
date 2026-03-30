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
from fastapi.responses import HTMLResponse

from app.services import supabase_service as db
from app.services.email_service import verify_token
from app.services import calendar_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/confirm", tags=["confirm"])


def _html_response(title: str, heading: str, body: str, color: str = "#1a56db") -> HTMLResponse:
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    body {{ font-family: Arial, sans-serif; background:#f9f9f9; margin:0; padding:0; }}
    .box {{ max-width:480px; margin:80px auto; background:#fff; border-radius:8px;
            box-shadow:0 2px 8px rgba(0,0,0,.1); padding:48px; text-align:center; }}
    h1 {{ color:{color}; font-size:24px; margin-bottom:12px; }}
    p  {{ color:#555; font-size:16px; line-height:1.6; }}
  </style>
</head>
<body>
  <div class="box">
    <h1>{heading}</h1>
    <p>{body}</p>
  </div>
</body>
</html>
"""
    return HTMLResponse(content=html)


@router.get("/{appointment_id}", response_class=HTMLResponse)
def handle_confirmation(
    appointment_id: str,
    action: str = Query(..., pattern="^(confirm|cancel)$"),
    token: str = Query(...),
):
    # Verify HMAC token
    if not verify_token(appointment_id, action, token):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link.")

    appt = db.get_appointment(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    status = appt.get("status", "")

    # Idempotency: already processed
    if action == "confirm" and status == "confirmed":
        return _html_response(
            "Already Confirmed",
            "Already Confirmed",
            "Your appointment has already been confirmed. We look forward to seeing you!",
        )
    if action == "cancel" and status == "cancelled":
        return _html_response(
            "Already Cancelled",
            "Already Cancelled",
            "This appointment was already cancelled.",
            color="#e02424",
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
            db.update_appointment(appointment_id, {"metadata": {"calendar_event_id": cal_event_id}})

        scheduled_display = start_dt.strftime("%A, %B %-d at %-I:%M %p") if start_dt else scheduled_at
        logger.info("Appointment %s confirmed by customer.", appointment_id)

        return _html_response(
            "Appointment Confirmed",
            "Appointment Confirmed!",
            f"Thank you, <strong>{customer_name}</strong>!<br><br>"
            f"Your appointment for <strong>{service}</strong> on "
            f"<strong>{scheduled_display}</strong> is confirmed.<br><br>"
            f"We look forward to seeing you at {business_name}.",
        )

    else:  # cancel
        db.update_appointment(appointment_id, {"status": "cancelled"})
        logger.info("Appointment %s cancelled by customer.", appointment_id)

        return _html_response(
            "Appointment Cancelled",
            "Appointment Cancelled",
            "Your appointment has been cancelled. "
            "Please call us if you would like to reschedule.",
            color="#e02424",
        )
