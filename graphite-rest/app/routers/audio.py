from __future__ import annotations

import hashlib
import json
import uuid

import psycopg
from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from graphite.config import Settings, get_settings
from app.deps import get_db
from app.errors import AppError
from app.routers.courses import require_course
from app.schemas import TranscriptionResponse
from app.services.elevenlabs import transcribe_audio

router = APIRouter(tags=["audio"])

# Generous but bounded; ElevenLabs itself caps request size and this is a
# voice-note/goal-dictation feature, not bulk lecture-recording ingestion.
MAX_AUDIO_BYTES = 25 * 1024 * 1024


@router.post(
    "/courses/{course_id}/audio-transcriptions",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def transcribe_course_audio(
    course_id: uuid.UUID,
    audio: UploadFile = File(...),
    persist_as_document: bool = Query(
        default=False,
        description=(
            "If true, also save the transcript as a text document on this "
            "course (status=UPLOADED, ready for the same ingestion pipeline "
            "as an uploaded .txt file). Interpretation beyond the literal "
            "design-doc.md §10.4 spec, which only requires returning editable "
            "text to the caller."
        ),
    ),
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TranscriptionResponse:
    require_course(course_id, db)

    if not settings.elevenlabs_api_key:
        raise AppError(
            code="TRANSCRIPTION_UNAVAILABLE",
            message=(
                "Voice transcription is not configured on this server "
                "(ELEVENLABS_API_KEY is unset)."
            ),
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            retryable=False,
        )

    data = await audio.read()
    if not data:
        raise AppError(code="EMPTY_FILE", message="Uploaded audio is empty.", status_code=400)
    if len(data) > MAX_AUDIO_BYTES:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"Audio exceeds the {MAX_AUDIO_BYTES // (1024 * 1024)}MB limit.",
            status_code=400,
        )

    result = await transcribe_audio(
        api_key=settings.elevenlabs_api_key,
        model_id=settings.elevenlabs_stt_model_id,
        filename=audio.filename or "voice-note.webm",
        content_type=audio.content_type or "application/octet-stream",
        audio_bytes=data,
    )

    document_id: uuid.UUID | None = None
    if persist_as_document:
        document_id = uuid.uuid4()
        dest_path = settings.upload_dir_path / str(course_id) / f"{document_id}.txt"
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_text(result.text, encoding="utf-8")

        digest = hashlib.sha256(result.text.encode("utf-8")).hexdigest()
        filename = f"voice-transcript-{document_id.hex[:8]}.txt"

        # Both inserts share the request's connection, so they commit together
        # when the handler returns and roll back together on error.
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents
                    (id, course_id, filename, mime_type, sha256, local_path, status)
                VALUES (%s, %s, %s, 'text/plain', %s, %s, 'UPLOADED')
                """,
                (document_id, course_id, filename, digest, str(dest_path)),
            )
            cur.execute(
                """
                INSERT INTO jobs (course_id, document_id, job_type, status, stage, payload)
                VALUES (%s, %s, 'INGEST_DOCUMENT', 'QUEUED', 'UPLOADED', %s::jsonb)
                """,
                (
                    course_id,
                    document_id,
                    json.dumps({"filename": filename, "source": "audio-transcription"}),
                ),
            )

    return TranscriptionResponse(
        text=result.text,
        language_code=result.language_code,
        document_id=document_id,
    )
