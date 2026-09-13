"""ElevenLabs Speech-to-Text (Scribe) client — design-doc.md §10.4 "Voice
input" (speech -> text), NOT §10.3's text -> speech narration.

Contract confirmed live (2026-09-13) against
https://elevenlabs.io/docs/api-reference/speech-to-text/convert :

    POST https://api.elevenlabs.io/v1/speech-to-text
    Header: xi-api-key: <ELEVENLABS_API_KEY>
    multipart/form-data body:
        model_id: "scribe_v2" (current recommended model; "scribe_v1" also
                   still accepted for existing integrations) — configurable
                   via ELEVENLABS_STT_MODEL_ID, see app/config.py.
        file: the audio/video file
    200 response JSON (single-channel, the case this module handles):
        {"language_code", "language_probability", "text", "words": [...], ...}

Never logs the API key or the raw provider response (design-doc.md §16.1
"Logs redact authorization headers and keys", §11.6 "Never send ... raw
provider responses to the browser").
"""

from __future__ import annotations

import logging

import httpx

from app.errors import AppError

logger = logging.getLogger("graphite")

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"


class TranscriptionResult:
    __slots__ = ("text", "language_code")

    def __init__(self, text: str, language_code: str | None) -> None:
        self.text = text
        self.language_code = language_code


async def transcribe_audio(
    *,
    api_key: str,
    model_id: str,
    filename: str,
    content_type: str,
    audio_bytes: bytes,
) -> TranscriptionResult:
    headers = {"xi-api-key": api_key}
    files = {"file": (filename, audio_bytes, content_type or "application/octet-stream")}
    data = {"model_id": model_id}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                ELEVENLABS_STT_URL, headers=headers, files=files, data=data
            )
    except httpx.RequestError:
        logger.exception("ElevenLabs speech-to-text request failed (network error)")
        raise AppError(
            code="TRANSCRIPTION_UNAVAILABLE",
            message="Could not reach the transcription provider. Please retry.",
            status_code=503,
            retryable=True,
        ) from None

    if response.status_code == 401:
        logger.error("ElevenLabs speech-to-text rejected the configured API key")
        raise AppError(
            code="TRANSCRIPTION_UNAVAILABLE",
            message="Transcription provider rejected the configured credentials.",
            status_code=503,
            retryable=False,
        )

    if response.status_code >= 400:
        # §11.6: never forward the raw provider response body to the browser.
        logger.error(
            "ElevenLabs speech-to-text returned status %s", response.status_code
        )
        raise AppError(
            code="TRANSCRIPTION_FAILED",
            message="The transcription provider could not process this audio file.",
            status_code=502,
            retryable=True,
        )

    body = response.json()
    text = body.get("text")
    if not isinstance(text, str):
        logger.error("ElevenLabs speech-to-text response missing 'text' field")
        raise AppError(
            code="TRANSCRIPTION_FAILED",
            message="The transcription provider returned an unexpected response.",
            status_code=502,
            retryable=True,
        )

    return TranscriptionResult(text=text, language_code=body.get("language_code"))
