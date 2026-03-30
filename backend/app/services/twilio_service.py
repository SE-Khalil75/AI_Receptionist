"""Twilio helpers – TwiML generation and call management."""
from __future__ import annotations

from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream

from app.config import settings


def _client() -> Client:
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


def build_stream_twiml(call_sid: str) -> str:
    """
    Return TwiML that immediately connects the call to our bidirectional
    Media Stream WebSocket so the AI agent can handle audio in real time.
    """
    response = VoiceResponse()
    connect = Connect()
    stream = Stream(
        url=f"{settings.public_base_url.replace('http', 'ws')}/ws/stream/{call_sid}"
    )
    connect.append(stream)
    response.append(connect)
    return str(response)


def build_say_twiml(message: str, voice: str = "Polly.Joanna") -> str:
    """Simple TwiML that reads a message and hangs up (fallback)."""
    response = VoiceResponse()
    response.say(message, voice=voice)
    return str(response)


def end_call(call_sid: str) -> None:
    """Terminate an in-progress call via the Twilio REST API."""
    client = _client()
    client.calls(call_sid).update(status="completed")


def get_call_details(call_sid: str) -> dict:
    client = _client()
    call = client.calls(call_sid).fetch()
    return {
        "sid": call.sid,
        "from": call.from_formatted,
        "to": call.to_formatted,
        "status": call.status,
        "duration": call.duration,
    }
