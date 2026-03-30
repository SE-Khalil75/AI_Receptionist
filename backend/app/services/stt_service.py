"""
STT router — dispatches to Deepgram or Whisper based on settings.stt_provider.

Usage (in webhook.py):
    from app.services import stt_service
    transcript = stt_service.transcribe(mulaw_bytes)
    rms        = stt_service.compute_rms(chunk)
"""
from __future__ import annotations

from app.config import settings
from app.services import whisper_service


def transcribe(mulaw_bytes: bytes) -> str:
    if settings.stt_provider == "deepgram":
        from app.services import deepgram_service
        return deepgram_service.transcribe(mulaw_bytes)
    return whisper_service.transcribe(mulaw_bytes)


# compute_rms is pure audio math — no network call, always use whisper_service
def compute_rms(mulaw_bytes: bytes) -> float:
    return whisper_service.compute_rms(mulaw_bytes)
