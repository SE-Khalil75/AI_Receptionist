"""
Speech-to-text via the Deepgram API.

Twilio delivers audio as 8-bit μ-law at 8 kHz.
We send μ-law directly to Deepgram (no WAV conversion needed) using the
nova-2-phonecall model, which is specifically trained on telephone audio.
"""
from __future__ import annotations

import re
import httpx

from app.config import settings

# Persistent client — TCP/TLS connection to Deepgram is established once and reused
_http_client = httpx.Client(timeout=30.0)


# ── Phonetic correction map ───────────────────────────────────────────────────
# Maps regex patterns (case-insensitive) to their correct replacements.
# Add any name/email combos that are commonly misrecognised during demos.

_CORRECTIONS: list[tuple[re.Pattern, str]] = [
    # Full name variations
    (re.compile(r"\bsala[h]?\s*[–-]?\s*e[dt]?[dt]?i?ne?\b", re.IGNORECASE), "Salah-Eddine"),
    (re.compile(r"\bsala[h]?\s*[–-]?\s*ad+ine?\b", re.IGNORECASE), "Salah-Eddine"),
    (re.compile(r"\bsala[h]?\s*[–-]?\s*ed+[ei]ne?\b", re.IGNORECASE), "Salah-Eddine"),
    (re.compile(r"\bsal[ae][h]?\s*ed[di]*[n]?\b", re.IGNORECASE), "Salah-Eddine"),
    (re.compile(r"\bsalah\s+eddine\b", re.IGNORECASE), "Salah-Eddine"),
    (re.compile(r"\bsalaheddine\b", re.IGNORECASE), "Salah-Eddine"),
    # Last name
    (re.compile(r"\bkhal+il+\b", re.IGNORECASE), "Khalil"),
    (re.compile(r"\bkhal+eel+\b", re.IGNORECASE), "Khalil"),
    (re.compile(r"\bkal+il+\b", re.IGNORECASE), "Khalil"),
    # Full name together
    (re.compile(r"Salah-Eddine\s+Khal+i[l]+", re.IGNORECASE), "Salah-Eddine Khalil"),
    # Contextual fix: Deepgram sometimes transcribes "Khalil" as "Salah" (phonetic confusion).
    # "Salah-Eddine Salah" cannot be a real name — last word must be "Khalil".
    (re.compile(r"\bSalah-Eddine\s+Salah\b", re.IGNORECASE), "Salah-Eddine Khalil"),
    # Also catch other common misreadings of the last name in context
    (re.compile(r"\bSalah-Eddine\s+(?:Kahlil|Kalil|Kahil|Khali[^l]|Halil)\b", re.IGNORECASE), "Salah-Eddine Khalil"),
    # Email – catch any reasonable attempt at saying the email address
    (re.compile(
        r"khal+[iy]l?\s*sala[h]?\s*[–-]?\s*e[dt]+[iy]?ne?\s*[2@][^\s]*",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    (re.compile(
        r"khal+[iy]l?\s*sala[h]?[e]?d+[iy]?ne?\s*[2@][^\s]*",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    (re.compile(
        r"khal+[iy]l?\s*sala[h]?\s*add?[iy]?ne?\s*2\s*(?:at|@)?\s*gmail",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    (re.compile(
        r"khal+[iy]l?\s*sala[h]?\s*[a-z]*\s*2\s*(?:at|@)\s*gmail(?:\.com)?",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    # Spoken email format: "khalil salah eddine 2 at gmail dot com"
    (re.compile(
        r"khal+[iy]l?\s+sala[h]?\s*[–-]?\s*e[dt]+[iy]?ne?\s+2\s+(?:at|@)\s+gmail\s+(?:dot\s+)?com",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    # Generic "… at gmail dot com" normalisation
    (re.compile(r"\bat\s+gmail\s+dot\s+com\b", re.IGNORECASE), "@gmail.com"),
    (re.compile(r"\bat\s+gmail\.com\b", re.IGNORECASE), "@gmail.com"),
    # Broad catch-all: anything with "khalil" + "salah" + "gmail" that isn't already correct.
    # Pattern ends at "gmail.com" so we never double-append ".com".
    (re.compile(
        r"khal+[iy]l?\s*\S*\s*sala[h]?\s*\S*\s*\d*\s*(?:at\s+|@\s*)gmail(?:\s*dot\s*|\.)com",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    # Handle letter-by-letter spelling where STT leaves spaces between letters
    # e.g. "k h a l i l s a l a h e d d i n e 2 at gmail dot com"
    (re.compile(
        r"(?:[a-z]\s){6,}(?:\d+\s)?(?:at\s)?gmail(?:\s*dot\s*com|\s*\.com)",
        re.IGNORECASE,
    ), "khalilsalaheddine2@gmail.com"),
    # Remove accidental double domain (e.g. "@gmail.com.com" → "@gmail.com")
    (re.compile(r"@gmail\.com\.com", re.IGNORECASE), "@gmail.com"),
    # Strip trailing noise words after a recognised email (e.g. "…@gmail.com shortly")
    (re.compile(r"(khalilsalaheddine2@gmail\.com)\s+\w+", re.IGNORECASE), r"\1"),
]


def _correct(text: str) -> str:
    """Apply phonetic corrections to a raw transcript."""
    for pattern, replacement in _CORRECTIONS:
        text = pattern.sub(replacement, text)
    return text


# ── Deepgram API call ─────────────────────────────────────────────────────────

def transcribe(mulaw_bytes: bytes) -> str:
    """
    Transcribe a μ-law audio chunk using Deepgram nova-2-phonecall.
    Returns the transcript text, or an empty string if nothing was detected.
    """
    response = _http_client.post(
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
            # Boost specific words so Deepgram is more likely to recognise them
            "keywords": [
                "Salah-Eddine:5",
                "Khalil:8",
                "khalilsalaheddine2:5",
                "gmail:1",
            ],
        },
    )
    response.raise_for_status()

    result = response.json()
    try:
        transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
    except (KeyError, IndexError):
        return ""

    return _correct(transcript.strip())
