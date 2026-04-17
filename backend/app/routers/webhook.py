"""
Twilio webhook handlers.

POST /webhook/voice  – called when a call arrives; returns TwiML that opens
                       a bidirectional Media Stream WebSocket.
WebSocket /ws/stream/{call_sid} – real-time audio exchange with Twilio.
GET /calls/active    – returns currently active calls.
GET /calls/live/{call_sid} – SSE stream of live transcript events.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.agent.graph import ReceptionistAgent
from app.config import settings
from app.services import supabase_service as db
from app.services import tts_service, stt_service
from app.services.twilio_service import build_stream_twiml

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory store: call_sid → metadata  (use Redis in production)
_call_store: dict[str, dict] = {}

# Live event bus: call_sid → list of subscriber queues (one per SSE client)
_live_queues: dict[str, list[asyncio.Queue]] = {}

# Event replay buffer: call_sid → list of past events (so late SSE subscribers catch up)
_call_event_buffer: dict[str, list[dict]] = {}
_EVENT_BUFFER_MAX = 100


async def _publish_call_event(call_sid: str, event: dict) -> None:
    """Broadcast an event to all SSE subscribers and append to replay buffer."""
    # Append to replay buffer (skip ping events)
    if event.get("type") != "ping":
        buf = _call_event_buffer.setdefault(call_sid, [])
        buf.append(event)
        if len(buf) > _EVENT_BUFFER_MAX:
            buf.pop(0)
    # Push to live subscribers
    for q in _live_queues.get(call_sid, []):
        await q.put(event)


# ── Twilio voice webhook ──────────────────────────────────────────────────────

@router.post("/webhook/voice")
async def voice_webhook(request: Request):
    """
    Entry point for every incoming Twilio call.
    Responds with TwiML that connects to our WebSocket Media Stream.
    """
    form = await request.form()
    call_sid: str = form.get("CallSid", "")
    from_number: str = form.get("From", "")
    to_number: str = form.get("To", "")

    logger.info("Incoming call: %s → %s  (sid=%s)", from_number, to_number, call_sid)

    # Single-Business: always use the configured Business
    Business = db.get_business_company()
    company_id = Business["id"] if Business else None

    # Create an initial call log row
    call_log = db.create_call_log(
        {
            "company_id": company_id,
            "call_sid": call_sid,
            "caller_number": from_number,
            "called_number": to_number,
            "metadata": {"raw_form": dict(form)},
        }
    )

    # Stash everything the WebSocket handler will need
    _call_store[call_sid] = {
        "company_id": company_id,
        "from_number": from_number,
        "to_number": to_number,
        "call_log_id": call_log["id"],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    twiml = build_stream_twiml(call_sid)
    return Response(content=twiml, media_type="application/xml")


# ── Twilio status callback ────────────────────────────────────────────────────

@router.post("/webhook/status")
async def status_callback(request: Request):
    """Receives call status updates from Twilio (completed, failed, etc.)."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    status = form.get("CallStatus", "")
    duration = form.get("CallDuration")

    logger.info("Call %s status: %s  duration=%s", call_sid, status, duration)

    info = _call_store.get(call_sid, {})
    call_log_id = info.get("call_log_id")
    if call_log_id:
        db.update_call_log(
            call_log_id,
            {
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": int(duration) if duration else None,
                "metadata": {"final_status": status},
            },
        )

    _call_store.pop(call_sid, None)
    # Clean up event buffer 30 s after call ends (leave it briefly for late SSE connects)
    async def _cleanup_buffer():
        await asyncio.sleep(30)
        _call_event_buffer.pop(call_sid, None)
    asyncio.create_task(_cleanup_buffer())
    return Response(content="", status_code=204)


# ── Active calls & live transcript SSE ───────────────────────────────────────

@router.get("/calls/active")
async def get_active_calls():
    """Return metadata for all currently active calls."""
    return {
        "data": [
            {
                "call_sid": sid,
                "from_number": info.get("from_number", "unknown"),
                "started_at": info.get("started_at"),
                "call_log_id": info.get("call_log_id"),
            }
            for sid, info in _call_store.items()
        ]
    }


@router.get("/calls/live/{call_sid}")
async def live_call_stream(call_sid: str):
    """
    SSE stream of live transcript events for a call.

    Event types emitted:
        connected   – subscription confirmed
        call_started – call WebSocket opened, includes from_number
        customer    – customer utterance transcribed (text field)
        thinking    – agent is processing (no text)
        agent       – agent response text (text field)
        call_ended  – call finished
        ping        – keepalive (every 15 s)
    """
    queue: asyncio.Queue = asyncio.Queue()

    # Snapshot buffered events BEFORE registering the queue, so we don't
    # double-deliver any event that arrives between the snapshot and registration.
    past_events = list(_call_event_buffer.get(call_sid, []))
    _live_queues.setdefault(call_sid, []).append(queue)

    async def generate():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'call_sid': call_sid})}\n\n"

            # Replay missed events to the late subscriber
            for evt in past_events:
                yield f"data: {json.dumps(evt)}\n\n"
                if evt.get("type") == "call_ended":
                    return

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") == "call_ended":
                        break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            queues = _live_queues.get(call_sid, [])
            try:
                queues.remove(queue)
            except ValueError:
                pass
            if not queues:
                _live_queues.pop(call_sid, None)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── WebSocket Media Stream ────────────────────────────────────────────────────

@router.websocket("/ws/stream/{call_sid}")
async def media_stream(websocket: WebSocket, call_sid: str):
    """
    Bidirectional Twilio Media Stream WebSocket.

    Protocol (Twilio → us):
        {"event": "connected"}
        {"event": "start",  "start": {"streamSid": "...", ...}}
        {"event": "media",  "media": {"track":"inbound","payload":"<base64 mulaw>"}}
        {"event": "stop"}

    Protocol (us → Twilio):
        {"event": "media", "streamSid": "...", "media": {"payload": "<base64 mulaw>"}}
        {"event": "mark",  "streamSid": "...", "mark": {"name": "..."}}
    """
    await websocket.accept()
    logger.info("WebSocket opened for call %s", call_sid)

    info = _call_store.get(call_sid, {})
    company_id: Optional[str] = info.get("company_id")
    call_log_id: Optional[str] = info.get("call_log_id")
    from_number: str = info.get("from_number", "unknown")

    stream_sid: str = ""
    agent: Optional[ReceptionistAgent] = None
    audio_buffer = bytearray()
    silence_frames = 0
    speech_frames = 0
    processing = False   # prevent overlapping Whisper calls
    listen_after: float = 0.0  # epoch time before which incoming audio is ignored

    # ── helpers ───────────────────────────────────────────────────────────────

    async def send_audio(mulaw_bytes: bytes) -> None:
        payload = base64.b64encode(mulaw_bytes).decode()
        try:
            await websocket.send_text(
                json.dumps(
                    {
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {"payload": payload},
                    }
                )
            )
        except (WebSocketDisconnect, RuntimeError):
            raise WebSocketDisconnect(code=1006)

    async def send_silence(duration_ms: int = 500) -> None:
        """Send μ-law silence to keep the Twilio WebSocket alive during processing."""
        # μ-law silence byte is 0xFF; Twilio expects 160-byte chunks (20 ms @ 8 kHz)
        chunk_size = 160
        num_chunks = (duration_ms // 20)
        silence_chunk = base64.b64encode(bytes([0xFF] * chunk_size)).decode()
        payload = json.dumps({
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": silence_chunk},
        })
        try:
            for _ in range(num_chunks):
                await websocket.send_text(payload)
                await asyncio.sleep(0.02)
        except (WebSocketDisconnect, RuntimeError):
            raise WebSocketDisconnect(code=1006)

    def _set_listen_cooldown(mulaw_bytes: bytes, extra_seconds: float = 0.5) -> None:
        """Block VAD triggering for the audio playback duration plus a small buffer."""
        nonlocal listen_after
        playback_duration = len(mulaw_bytes) / 8000.0  # μ-law @ 8 kHz = 8000 B/s
        listen_after = time.time() + playback_duration + extra_seconds

    async def handle_utterance(mulaw_data: bytes) -> bool:
        """Transcribe → agent → TTS → send. Returns True if call should end."""
        nonlocal processing
        processing = True
        keep_alive_task: Optional[asyncio.Task] = None
        try:
            # Send silence every 4 s so Twilio doesn't close the WebSocket.
            async def _keep_alive():
                while True:
                    await asyncio.sleep(4)
                    await send_silence(200)

            keep_alive_task = asyncio.create_task(_keep_alive())

            # ── STT ───────────────────────────────────────────────────────────
            transcript = await asyncio.to_thread(stt_service.transcribe, mulaw_data)
            if not transcript:
                return False

            logger.info("[%s] Customer: %s", call_sid, transcript)
            await _publish_call_event(call_sid, {"type": "customer", "text": transcript})
            await _publish_call_event(call_sid, {"type": "thinking"})

            # ── LLM ───────────────────────────────────────────────────────────
            agent_text, should_end = await agent.process_turn(transcript)

            if agent_text:
                logger.info("[%s] Agent: %s", call_sid, agent_text)

                # ── TTS (runs concurrently with publishing the text event) ───
                mulaw_response, _ = await asyncio.gather(
                    asyncio.to_thread(tts_service.synthesize_mulaw, agent_text),
                    _publish_call_event(call_sid, {"type": "agent", "text": agent_text}),
                )
                await send_audio(mulaw_response)
                _set_listen_cooldown(mulaw_response)

            return should_end
        except WebSocketDisconnect:
            raise  # let the outer loop handle it
        except Exception as exc:
            logger.exception("Error processing utterance: %s", exc)
            return False
        finally:
            if keep_alive_task:
                keep_alive_task.cancel()
            processing = False

    # ── main receive loop ─────────────────────────────────────────────────────

    try:
        async for raw in websocket.iter_text():
            data = json.loads(raw)
            event = data.get("event")

            if event == "connected":
                logger.info("Media stream connected for call %s", call_sid)

            elif event == "start":
                stream_sid = data["start"]["streamSid"]
                logger.info("Stream started: %s", stream_sid)

                if company_id:
                    agent = ReceptionistAgent(
                        company_id=company_id,
                        customer_phone=from_number,
                    )
                    agent.state["call_sid"] = call_sid
                    agent.state["call_log_id"] = call_log_id or ""

                    await _publish_call_event(call_sid, {
                        "type": "call_started",
                        "from_number": from_number,
                    })

                    # Send opening greeting via TTS
                    Business = db.get_business_company()
                    business_name = Business["name"] if Business else "us"
                    greeting = (
                        f"Thank you for calling {business_name}. "
                        "This is your AI receptionist. How can I help you today?"
                    )
                    greeting_mulaw = await asyncio.to_thread(
                        tts_service.synthesize_mulaw, greeting
                    )
                    await send_audio(greeting_mulaw)
                    await _publish_call_event(call_sid, {"type": "agent", "text": greeting})
                    _set_listen_cooldown(greeting_mulaw)

            elif event == "media":
                if agent is None or processing:
                    continue

                # While the agent is still speaking, keep accumulating audio
                # but reset VAD counters so we don't trigger early.
                if time.time() < listen_after:
                    chunk = base64.b64decode(data["media"]["payload"])
                    audio_buffer.extend(chunk)
                    speech_frames = 0
                    silence_frames = 0
                    continue

                chunk = base64.b64decode(data["media"]["payload"])
                audio_buffer.extend(chunk)

                # Simple energy-based VAD
                rms = stt_service.compute_rms(chunk)
                if rms < settings.silence_threshold:
                    silence_frames += 1
                else:
                    silence_frames = 0
                    speech_frames += 1

                # End-of-speech: enough speech collected + sustained silence
                if (
                    speech_frames >= settings.min_speech_frames
                    and silence_frames >= settings.silence_frames_needed
                ):
                    audio_data = bytes(audio_buffer)
                    audio_buffer.clear()
                    speech_frames = 0
                    silence_frames = 0

                    should_end = await handle_utterance(audio_data)
                    if should_end:
                        break

            elif event == "stop":
                logger.info("Stream stopped for call %s", call_sid)
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for call %s", call_sid)
    except Exception as exc:
        logger.exception("WebSocket error for call %s: %s", call_sid, exc)
    finally:
        await _publish_call_event(call_sid, {"type": "call_ended"})

        # Persist transcript and outcome
        if agent and call_log_id:
            db.update_call_log(
                call_log_id,
                {
                    "transcript": agent.transcript,
                    "outcome": agent.call_outcome or "no_action",
                    "appointment_id": agent.appointment_id,
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            # Send confirmation email if an appointment was booked
            if agent.appointment_id:
                await asyncio.to_thread(_send_post_call_email, agent.appointment_id)

        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket closed for call %s", call_sid)


def _send_post_call_email(appointment_id: str) -> None:
    """Send a confirmation email for a pending appointment (runs in thread pool)."""
    from app.services.email_service import send_confirmation_email

    appt = db.get_appointment(appointment_id)
    if not appt:
        return

    customer_email = appt.get("customer_email")
    if not customer_email:
        logger.warning("No email address for appointment %s – skipping confirmation email", appointment_id)
        return

    if appt.get("status") != "pending_confirmation":
        return  # already confirmed or cancelled

    business = db.get_business_company()
    business_name = business["name"] if business else "Our Business"

    try:
        scheduled_dt = datetime.fromisoformat(appt["scheduled_at"])
        scheduled_display = scheduled_dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " ")
    except (ValueError, TypeError, KeyError):
        scheduled_display = appt.get("scheduled_at", "")

    send_confirmation_email(
        to_email=customer_email,
        customer_name=appt.get("customer_name", "Customer"),
        business_name=business_name,
        service=appt.get("service") or "Appointment",
        scheduled_display=scheduled_display,
        duration_minutes=appt.get("duration_minutes", 60),
        appointment_id=appointment_id,
    )
