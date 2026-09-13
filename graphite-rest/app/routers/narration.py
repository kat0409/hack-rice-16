"""Narration of a step's summary (design-doc.md §10.3).

Backend-mediated: the browser never holds the ElevenLabs key. Audio is cached
on disk by a hash of the normalized text + voice + model so replaying a step
costs nothing, and the API streams the local file rather than returning a path.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid

import psycopg
from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse

from app.deps import get_db
from app.errors import AppError
from app.routers.artifacts import _to_out
from app.routers.courses import _row
from app.schemas import ArtifactOut
from app.services.elevenlabs import TTS_MODEL_ID, synthesize_speech
from graphite.config import REPO_ROOT, Settings, get_settings

router = APIRouter(tags=["narration"])

CACHE_DIR = REPO_ROOT / "data" / "narration-cache"
MAX_CHARS = 2500


def _narration_text(content: dict) -> str:
    """Summary -> plain speech text. Markdown syntax and citations never reach the voice."""
    parts = [content.get("learning_objective") or "", content.get("summary_markdown") or ""]
    points = content.get("key_points") or []
    if points:
        parts.append("Key points. " + " ".join(p.rstrip(".") + "." for p in points))
    text = "\n\n".join(p for p in parts if p)
    text = re.sub(r"[#*_>`\[\]()]", "", text)
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) > MAX_CHARS:
        cut = text[:MAX_CHARS]
        text = cut[: cut.rfind(".") + 1] or cut
    return text


@router.post(
    "/study-artifacts/{artifact_id}/narration",
    response_model=ArtifactOut,
    status_code=status.HTTP_201_CREATED,
)
def create_narration(
    artifact_id: uuid.UUID,
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ArtifactOut:
    source = _row(
        db,
        "SELECT id, study_step_id, artifact_type, content FROM study_artifacts WHERE id = %s",
        (artifact_id,),
    )
    if source is None:
        raise AppError(
            code="ARTIFACT_NOT_FOUND",
            message=f"No study artifact with id {artifact_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if source["artifact_type"] != "SUMMARY":
        raise AppError(
            code="NARRATION_UNSUPPORTED",
            message="Only summaries can be narrated.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
        raise AppError(
            code="NARRATION_UNAVAILABLE",
            message="Narration is not configured; text mode stays available.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            retryable=False,
        )

    content = source["content"]
    if isinstance(content, str):
        content = json.loads(content)
    text = _narration_text(content)
    if not text:
        raise AppError(
            code="NARRATION_EMPTY",
            message="This summary has no narratable text.",
            status_code=status.HTTP_409_CONFLICT,
        )

    voice_id = settings.elevenlabs_voice_id
    digest = hashlib.sha256(f"{text}\n{voice_id}\n{TTS_MODEL_ID}".encode()).hexdigest()
    path = CACHE_DIR / f"{digest}.mp3"
    if not path.exists():
        audio = synthesize_speech(api_key=settings.elevenlabs_api_key, voice_id=voice_id, text=text)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(audio)

    row = _row(
        db,
        """
        INSERT INTO study_artifacts (study_step_id, artifact_type, content, citations, model_metadata)
        VALUES (%s, 'NARRATION', %s::jsonb, '[]'::jsonb, %s::jsonb)
        ON CONFLICT (study_step_id, artifact_type) DO UPDATE
           SET content = EXCLUDED.content, model_metadata = EXCLUDED.model_metadata
        RETURNING id, study_step_id, artifact_type, content, citations, created_at
        """,
        (
            source["study_step_id"],
            json.dumps({"hash": digest, "chars": len(text), "text": text, "source_artifact_id": str(artifact_id)}),
            json.dumps({"voice_id": voice_id, "model_id": TTS_MODEL_ID}),
        ),
    )
    return _to_out(row)


@router.get("/narrations/{narration_id}/audio")
def narration_audio(narration_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)):
    row = _row(
        db,
        "SELECT content FROM study_artifacts WHERE id = %s AND artifact_type = 'NARRATION'",
        (narration_id,),
    )
    content = row["content"] if row else None
    if isinstance(content, str):
        content = json.loads(content)
    path = CACHE_DIR / f"{content['hash']}.mp3" if content and content.get("hash") else None
    if path is None or not path.exists():
        raise AppError(
            code="NARRATION_NOT_FOUND",
            message=f"No narration audio for id {narration_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return FileResponse(path, media_type="audio/mpeg", filename="narration.mp3")
