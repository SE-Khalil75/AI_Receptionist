"""
Text-mode test endpoint – exercises the LangGraph agent without Twilio/audio.
Useful for the Next.js "Test Agent" page and integration testing.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage
from pydantic import BaseModel

from app.agent.graph import ReceptionistAgent
from app.models.schemas import APIResponse
from app.services import supabase_service as db
from app.services.email_service import send_confirmation_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/test", tags=["test"])

# In-memory session store keyed by session_id
_sessions: dict[str, ReceptionistAgent] = {}
# Track which appointments have already been emailed (avoid duplicates)
_emailed: set[str] = set()


class TestRequest(BaseModel):
    message: str
    session_id: str = "default"


@router.post("/agent")
async def test_agent(req: TestRequest):
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=503, detail="Business not configured. Set COMPANY_ID in .env")

    company_id = Business["id"]
    session_key = req.session_id

    if session_key not in _sessions:
        _sessions[session_key] = ReceptionistAgent(
            company_id=company_id,
            customer_phone="+10000000000",  # dummy phone for text tests
            text_mode=True,
        )

    agent = _sessions[session_key]

    try:
        response_text, should_end = await agent.process_turn(req.message)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Send confirmation email as soon as the appointment is booked (don't wait for call end)
    if agent.appointment_id and agent.appointment_id not in _emailed:
        _emailed.add(agent.appointment_id)
        _send_confirmation_email(agent.appointment_id)

    if should_end:
        _sessions.pop(session_key, None)

    return APIResponse(
        success=True,
        data={
            "response": response_text,
            "should_end": should_end,
            "transcript": agent.transcript,
            "appointment_id": agent.appointment_id,
            "call_outcome": agent.call_outcome,
        },
    )


def _send_confirmation_email(appointment_id: str) -> None:
    appt = db.get_appointment(appointment_id)
    if not appt or not appt.get("customer_email"):
        return
    if appt.get("status") != "pending_confirmation":
        return

    business = db.get_business_company()
    business_name = business["name"] if business else "Our Business"

    try:
        scheduled_display = datetime.fromisoformat(appt["scheduled_at"]).strftime("%A, %B %d at %I:%M %p").replace(" 0", " ")
    except (ValueError, TypeError, KeyError):
        scheduled_display = appt.get("scheduled_at", "")

    sent = send_confirmation_email(
        to_email=appt["customer_email"],
        customer_name=appt.get("customer_name", "Customer"),
        business_name=business_name,
        service=appt.get("service") or "Appointment",
        scheduled_display=scheduled_display,
        duration_minutes=appt.get("duration_minutes", 60),
        appointment_id=appointment_id,
    )
    if not sent:
        logger.warning("Confirmation email not sent for appointment %s – check SMTP settings in .env", appointment_id)


@router.post("/agent/stream")
def test_agent_stream(req: TestRequest):
    """
    Streaming version of test_agent.
    Emits Server-Sent Events (SSE):
      data: {"type": "token",  "token": "..."}   — one per LLM token
      data: {"type": "done",   "should_end": bool, "appointment_id": ...}
      data: {"type": "error",  "message": "..."}
    """
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=503, detail="Business not configured. Set COMPANY_ID in .env")

    company_id = Business["id"]
    session_key = req.session_id

    if session_key not in _sessions:
        _sessions[session_key] = ReceptionistAgent(
            company_id=company_id,
            customer_phone="+10000000000",
        )

    agent = _sessions[session_key]

    def generate():
        # Build input state with the new user message
        state = dict(agent.state)
        state["messages"] = list(agent.state["messages"]) + [HumanMessage(content=req.message)]
        state["transcript_lines"] = list(agent.state.get("transcript_lines", [])) + [f"Customer: {req.message}"]

        full_response = ""
        final_state = None

        try:
            # stream_mode=["messages","values"] yields (mode, data) tuples:
            #   ("messages", (AIMessageChunk, metadata)) – one per LLM token
            #   ("values",   full_state_dict)             – one per node completion
            for event in agent.graph.stream(state, stream_mode=["messages", "values"]):
                mode, data = event
                if mode == "messages":
                    msg_chunk, _ = data
                    # Only forward plain text tokens, skip tool-call chunks
                    if (
                        isinstance(msg_chunk, AIMessageChunk)
                        and isinstance(msg_chunk.content, str)
                        and msg_chunk.content
                        and not getattr(msg_chunk, "tool_call_chunks", None)
                    ):
                        full_response += msg_chunk.content
                        yield f"data: {json.dumps({'type': 'token', 'token': msg_chunk.content})}\n\n"
                elif mode == "values":
                    final_state = data  # keep overwriting – last one is the final state
        except Exception as exc:
            logger.exception("Streaming error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

        # Persist final state back onto the agent
        if final_state:
            agent.state = final_state
            agent.state["transcript_lines"] = list(agent.state.get("transcript_lines", [])) + [f"Agent: {full_response}"]

        should_end = agent.state.get("should_end_call", False)
        appointment_id = agent.state.get("appointment_id")

        if appointment_id and appointment_id not in _emailed:
            _emailed.add(appointment_id)
            _send_confirmation_email(appointment_id)

        if should_end:
            _sessions.pop(session_key, None)

        yield f"data: {json.dumps({'type': 'done', 'should_end': should_end, 'appointment_id': appointment_id, 'call_outcome': agent.state.get('call_outcome')})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/agent/{session_id}")
def reset_session(session_id: str):
    _sessions.pop(session_id, None)
    return APIResponse(success=True, message="Session reset")
