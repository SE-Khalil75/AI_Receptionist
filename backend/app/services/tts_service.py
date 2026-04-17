"""
Text-to-speech via OpenAI TTS API.

OpenAI TTS returns MP3 audio. Twilio Media Streams requires 8-bit μ-law
at 8 kHz. We use pydub (ffmpeg) to resample and audioop (stdlib) to encode.
"""
from __future__ import annotations

import audioop
import io
import os

from pydub import AudioSegment

from app.config import settings

# Add ffmpeg bin dir to PATH so pydub can find ffmpeg and ffprobe (Windows WinGet install)
_FFMPEG_BIN = r"C:\Users\SalahEddineKhalil\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"
if os.path.isdir(_FFMPEG_BIN) and _FFMPEG_BIN not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _FFMPEG_BIN + os.pathsep + os.environ.get("PATH", "")


# ── OpenAI TTS call ───────────────────────────────────────────────────────────

def synthesize_to_mp3(text: str) -> bytes:
    """Call OpenAI TTS and return raw MP3 bytes."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.audio.speech.create(
        model="tts-1",       # tts-1 has lower latency; tts-1-hd for higher quality
        voice="nova",        # nova: friendly, professional female voice
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
