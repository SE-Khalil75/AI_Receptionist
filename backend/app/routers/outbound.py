"""
Outbound call endpoint.

POST /call/outbound  – tells Twilio to call a phone number; when the recipient
                       answers, Twilio hits /webhook/voice exactly like an
                       inbound call and the AI receptionist takes over.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.config import settings
from app.models.schemas import APIResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/call", tags=["call"])

# Maps Twilio error codes to human-readable messages
_TWILIO_ERRORS = {
    21216: (
        "Twilio error 21216 – your account is not allowed to call this number. "
        "Fix in Twilio Console → Voice → Settings → Geo Permissions: "
        "find the destination country, enable both 'Local' AND 'Mobile' subcategories. "
        "If already enabled, also check Voice → Settings → High Risk Special Services Geo Permissions."
    ),
    21214: "The destination number is not a valid phone number.",
    21401: "Twilio SID or Auth Token is invalid – check your .env credentials.",
}


def _clean(text: str) -> str:
    """Strip ANSI terminal colour codes from Twilio exception messages."""
    return re.sub(r"\x1b\[[0-9;]*m", "", text).strip()


class OutboundCallRequest(BaseModel):
    to: str  # E.164 phone number to dial, e.g. "+212xxxxxxxxx"


@router.post("/outbound")
def trigger_outbound_call(payload: OutboundCallRequest):
    """
    Initiate an outbound call via Twilio.
    Twilio calls `to`, and when the call is answered it hits /webhook/voice
    so the AI receptionist handles the conversation identically to an inbound call.
    """
    if not all([settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_phone_number]):
        raise HTTPException(status_code=503, detail="Twilio credentials not configured in .env")

    webhook_url = f"{settings.public_base_url}/webhook/voice"

    try:
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        call = client.calls.create(
            to=payload.to,
            from_=settings.twilio_phone_number,
            url=webhook_url,
            method="POST",
        )
        logger.info("Outbound call initiated to %s – SID: %s", payload.to, call.sid)
        return APIResponse(success=True, data={"call_sid": call.sid, "status": call.status})
    except TwilioRestException as exc:
        friendly = _TWILIO_ERRORS.get(exc.code)
        detail = friendly or _clean(str(exc))
        logger.error("Twilio error %s calling %s: %s", exc.code, payload.to, detail)
        raise HTTPException(status_code=400, detail=detail)
    except Exception as exc:
        logger.exception("Failed to initiate outbound call: %s", exc)
        raise HTTPException(status_code=400, detail=_clean(str(exc)))
