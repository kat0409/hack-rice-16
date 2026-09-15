"""Voice tutor turns: a question in, a grounded answer and its spoken audio out.

Stateless on the server: the client sends recent conversation turns with each
question, so no conversation table is needed. Speech-to-text reuses the
existing audio-transcriptions endpoint. The spoken answer is synthesized
locally (no key, no network — `app/services/local_voice.py`) and cached on
disk by content hash, like step narration (design-doc.md §10.3).
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid

import psycopg
from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse

from app.deps import get_db
from app.errors import AppError
from app.routers.courses import require_course
from app.routers.narration import CACHE_DIR, MAX_CHARS, audio_path
from app.schemas import GraphEvidenceOut, TutorConceptOut, TutorTurnCreate, TutorTurnOut
from app.services.local_voice import TTS_MODEL_ID, synthesize_speech
from graphite.config import Settings, get_settings
from graphite.tutor import Turn, TutorError, answer_question

logger = logging.getLogger("graphite")

router = APIRouter(tags=["tutor"])

_STATUS = {
    "MODEL_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
    "MODEL_SCHEMA_INVALID": status.HTTP_502_BAD_GATEWAY,
}

_AUDIO_ID = re.compile(r"^[0-9a-f]{64}$")


def _speech_text(text: str) -> str:
    text = re.sub(r"[#*_>`\[\]()]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > MAX_CHARS:
        cut = text[:MAX_CHARS]
        text = cut[: cut.rfind(".") + 1] or cut
    return text


def _synthesize(text: str, settings: Settings) -> tuple[str | None, str | None]:
    """Return (audio_id, error_code). Voice is optional: failures degrade to text mode."""
    speech = _speech_text(text)
    if not speech:
        return None, "NARRATION_EMPTY"
    voice_id = settings.tts_voice
    digest = hashlib.sha256(f"{speech}\n{voice_id}\n{TTS_MODEL_ID}".encode()).hexdigest()
    if audio_path(digest) is None:
        try:
            audio = synthesize_speech(text=speech, settings=settings)
        except AppError as exc:
            logger.warning("Tutor narration failed: %s", exc.code)
            return None, exc.code
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{digest}.wav").write_bytes(audio)
    return digest, None


@router.post(
    "/courses/{course_id}/tutor/turns",
    response_model=TutorTurnOut,
    status_code=status.HTTP_201_CREATED,
)
def create_tutor_turn(
    course_id: uuid.UUID,
    body: TutorTurnCreate,
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TutorTurnOut:
    require_course(course_id, db)
    history = [Turn(role=t.role, text=t.text) for t in body.history]
    try:
        result = answer_question(db, course_id, body.question, history)
    except TutorError as exc:
        raise AppError(
            code=exc.code,
            message=exc.message,
            status_code=_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
            retryable=True,
        ) from exc

    audio_id, audio_error = _synthesize(result["answer_text"], settings)
    return TutorTurnOut(
        answer_text=result["answer_text"],
        citations=[GraphEvidenceOut(**c) for c in result["citations"]],
        concepts=[TutorConceptOut(**c) for c in result["concepts"]],
        audio_id=audio_id,
        audio_error=audio_error,
    )


@router.get("/tutor-audio/{audio_id}")
def tutor_audio(audio_id: str):
    found = audio_path(audio_id) if _AUDIO_ID.fullmatch(audio_id) else None
    if found is None:
        raise AppError(
            code="TUTOR_AUDIO_NOT_FOUND",
            message="No tutor audio with that id.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    path, media_type = found
    return FileResponse(path, media_type=media_type, filename=f"tutor-answer{path.suffix}")
