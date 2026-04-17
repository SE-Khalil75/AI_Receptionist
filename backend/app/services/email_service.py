"""Send HTML appointment confirmation emails via SMTP."""
from __future__ import annotations

import hashlib
import hmac
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


# ── Token helpers ──────────────────────────────────────────────────────────────

def _make_token(appointment_id: str, action: str) -> str:
    """Return an HMAC-SHA256 token for the given appointment + action.
    Padding (=) is stripped — base64url does not require it and = in URLs
    is corrupted by Gmail's link-rewriting and some email clients.
    """
    msg = f"{appointment_id}:{action}".encode()
    sig = hmac.new(settings.confirmation_secret.encode(), msg, hashlib.sha256).digest()
    import base64
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def verify_token(appointment_id: str, action: str, token: str) -> bool:
    """Return True if the token is valid for this appointment + action.
    Strips any = padding from the received token so that tokens generated
    by older code (with padding) still verify correctly.
    """
    expected = _make_token(appointment_id, action)          # never has =
    return hmac.compare_digest(expected, token.rstrip("=")) # strip if present


# ── Email sending ──────────────────────────────────────────────────────────────

def send_confirmation_email(
    *,
    to_email: str,
    customer_name: str,
    business_name: str,
    service: str,
    scheduled_display: str,  # e.g. "Monday, March 3 at 2:00 PM"
    duration_minutes: int,
    appointment_id: str,
) -> bool:
    """
    Send an HTML email with Confirm / Cancel buttons.
    Returns True on success, False if SMTP is not configured or sending fails.
    """
    if not all([settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.email_from]):
        logger.warning("SMTP not configured – skipping confirmation email for %s", appointment_id)
        return False

    confirm_token = _make_token(appointment_id, "confirm")
    cancel_token = _make_token(appointment_id, "cancel")
    # Point directly to the backend — add ngrok-skip-browser-warning so the
    # ngrok interstitial is bypassed without needing a frontend proxy hop.
    backend_base = settings.public_base_url.rstrip("/")
    confirm_url = f"{backend_base}/confirm/{appointment_id}?action=confirm&token={confirm_token}&ngrok-skip-browser-warning=true"
    cancel_url = f"{backend_base}/confirm/{appointment_id}?action=cancel&token={cancel_token}&ngrok-skip-browser-warning=true"

    subject = f"Appointment Request – {business_name}"

    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {{ font-family: Arial, sans-serif; color: #333; background: #f9f9f9; margin: 0; padding: 0; }}
    .container {{ max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0,0,0,.08); padding: 40px; }}
    h1 {{ color: #1a56db; font-size: 22px; margin-bottom: 4px; }}
    .detail {{ background: #f0f4ff; border-radius: 6px; padding: 16px 20px; margin: 24px 0; }}
    .detail p {{ margin: 6px 0; font-size: 15px; }}
    .detail strong {{ display: inline-block; width: 110px; color: #555; }}
    .btn {{ display: inline-block; padding: 14px 28px; border-radius: 6px; text-decoration: none;
            font-weight: bold; font-size: 15px; margin: 8px 8px 8px 0; }}
    .btn-confirm {{ background: #16a34a; color: #ffffff; }}
    .btn-cancel  {{ background: #fff; color: #e02424; border: 2px solid #e02424; }}
    .footer {{ margin-top: 32px; font-size: 12px; color: #999; }}
  </style>
</head>
<body>
  <div class="container">
    <h1>{business_name}</h1>
    <p>Dear <strong>{customer_name}</strong>,</p>
    <p>Thank you for calling us! We have a pending appointment request for you.
       Please confirm or cancel using the buttons below.</p>

    <div class="detail">
      <p><strong>Service:</strong> {service or "Appointment"}</p>
      <p><strong>Date &amp; Time:</strong> {scheduled_display}</p>
      <p><strong>Duration:</strong> {duration_minutes} minutes</p>
    </div>

    <a href="{confirm_url}" class="btn btn-confirm">✓ Confirm Appointment</a>
    <a href="{cancel_url}"  class="btn btn-cancel">✗ Cancel</a>

    <div class="footer">
      <p>If you did not request this appointment, you can safely ignore this email.</p>
      <p>This link is unique to your appointment and should not be shared.</p>
    </div>
  </div>
</body>
</html>
"""

    plain = (
        f"Appointment Request – {business_name}\n\n"
        f"Dear {customer_name},\n\n"
        f"Service: {service or 'Appointment'}\n"
        f"Date & Time: {scheduled_display}\n"
        f"Duration: {duration_minutes} minutes\n\n"
        f"CONFIRM: {confirm_url}\n"
        f"CANCEL:  {cancel_url}\n"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.email_from, to_email, msg.as_string())
        logger.info("Confirmation email sent to %s for appointment %s", to_email, appointment_id)
        return True
    except Exception as exc:
        logger.exception("Failed to send confirmation email: %s", exc)
        return False
