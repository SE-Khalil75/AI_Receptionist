"""
Speech-to-text via the Deepgram API.

Twilio delivers audio as 8-bit μ-law at 8 kHz.
We send μ-law directly to Deepgram (no WAV conversion needed) using the
nova-2-phonecall model, which is specifically trained on telephone audio.
"""
from __future__ import annotations

import httpx

from app.config import settings


# ── Deepgram API call ─────────────────────────────────────────────────────────

def transcribe(mulaw_bytes: bytes) -> str:
    """
    Transcribe a μ-law audio chunk using Deepgram nova-2-phonecall.
    Returns the transcript text, or an empty string if nothing was detected.
    """
    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "audio/mulaw",
            },
            content=mulaw_bytes,
            params={
                "model": "nova-2-phonecall",   # trained on 8 kHz telephone audio
                "encoding": "mulaw",           # send raw μ-law, no conversion needed
                "sample_rate": "8000",         # Twilio's fixed sample rate
                "channels": "1",
                "language": "en",
                "smart_format": "true",
                "punctuate": "true",
            },
        )
        response.raise_for_status()

    result = response.json()
    try:
        transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
    except (KeyError, IndexError):
        return ""
    return transcript.strip()
