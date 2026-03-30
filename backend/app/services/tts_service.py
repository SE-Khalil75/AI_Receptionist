"""
Text-to-speech via the OpenAI TTS API.

OpenAI returns MP3 audio. Twilio Media Streams requires 8-bit μ-law
at 8 kHz. We use pydub (ffmpeg) to resample and audioop (stdlib) to
encode μ-law — both are single function calls, no custom DSP.
"""
from __future__ import annotations

import audioop
import io

from openai import OpenAI
from pydub import AudioSegment

from app.config import settings


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


# ── OpenAI TTS call ───────────────────────────────────────────────────────────

def synthesize_to_mp3(text: str) -> bytes:
    """Call the OpenAI TTS API and return raw MP3 bytes."""
    client = _client()
    response = client.audio.speech.create(
        model="tts-1",          # tts-1 = low latency, tts-1-hd = higher quality
        voice="nova",           # options: alloy, echo, fable, onyx, nova, shimmer
        input=text,
        response_format="mp3",
    )
    return response.content


# ── Format bridge: MP3 → Twilio μ-law 8 kHz ──────────────────────────────────

def mp3_to_mulaw_8k(mp3_data: bytes) -> bytes:
    """
    Resample MP3 → 8 kHz mono 16-bit PCM (pydub/ffmpeg),
    then encode as μ-law (audioop stdlib) for Twilio Media Streams.
    """
    audio = AudioSegment.from_mp3(io.BytesIO(mp3_data))
    audio = audio.set_frame_rate(8000).set_channels(1).set_sample_width(2)
    return audioop.lin2ulaw(audio.raw_data, 2)   # 2 = 16-bit input


# ── Public interface ──────────────────────────────────────────────────────────

def synthesize_mulaw(text: str) -> bytes:
    """Full pipeline: text → μ-law 8 kHz bytes ready for Twilio."""
    mp3 = synthesize_to_mp3(text)
    return mp3_to_mulaw_8k(mp3)
