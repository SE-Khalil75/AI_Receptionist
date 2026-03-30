"""
Speech-to-text via the OpenAI Whisper API.

Twilio Media Streams delivers audio as 8-bit μ-law at 8 kHz.
Python's stdlib `audioop` converts it to PCM in one call; we then
wrap it in a WAV container and POST it straight to the Whisper endpoint.
"""
from __future__ import annotations

import audioop
import io
import wave

from openai import OpenAI

from app.config import settings


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


# ── Format bridge: Twilio μ-law → WAV ────────────────────────────────────────

def mulaw_to_wav(mulaw_bytes: bytes, sample_rate: int = 8000) -> bytes:
    """μ-law bytes (from Twilio) → in-memory WAV file ready for Whisper."""
    pcm = audioop.ulaw2lin(mulaw_bytes, 2)   # 2 = 16-bit output; one stdlib call
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def compute_rms(mulaw_bytes: bytes) -> float:
    """RMS energy of a μ-law chunk — used for voice-activity detection."""
    if not mulaw_bytes:
        return 0.0
    pcm = audioop.ulaw2lin(mulaw_bytes, 2)
    return audioop.rms(pcm, 2)


# ── Whisper API call ──────────────────────────────────────────────────────────

def transcribe(mulaw_bytes: bytes) -> str:
    """
    Transcribe a μ-law audio chunk using the OpenAI Whisper API.
    Returns the transcript text, or an empty string if nothing was detected.
    """
    wav_data = mulaw_to_wav(mulaw_bytes)
    audio_file = io.BytesIO(wav_data)
    audio_file.name = "audio.wav"          # Whisper needs a filename hint

    response = _client().audio.transcriptions.create(
        model=settings.whisper_model,      # default: "whisper-1"
        file=audio_file,
        response_format="text",
        prompt=(
            "This is a phone call to a business receptionist. "
            "The caller may be booking, rescheduling, or cancelling an appointment. "
            "They may mention names, dates, times, phone numbers, and services."
        ),
    )
    text = response if isinstance(response, str) else response.text
    return text.strip()
