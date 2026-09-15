"""Narration of a step's summary (design-doc.md §10.3).

Runs entirely on this machine (`app/services/local_voice.py`), no API key and
no network at inference. Audio is cached on disk by a hash of the normalized
text + voice + model so replaying a step costs nothing, and the API streams
the local file rather than returning a path.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from pathlib import Path

import psycopg
from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse

from app.deps import get_db
from app.errors import AppError
from app.routers.artifacts import _to_out
from app.routers.courses import _row
from app.schemas import ArtifactOut
from app.services.local_voice import TTS_MODEL_ID, synthesize_speech
from graphite.config import REPO_ROOT, Settings, get_settings

router = APIRouter(tags=["narration"])

CACHE_DIR = REPO_ROOT / "data" / "narration-cache"
MAX_CHARS = 2500

# {digest}.wav is current; {digest}.mp3 is what the old ElevenLabs backend
# wrote, kept readable so narrations generated before the switch still play.
_AUDIO_MEDIA_TYPES = {".wav": "audio/wav", ".mp3": "audio/mpeg"}


def audio_path(digest: str) -> tuple[Path, str] | None:
    for suffix, media_type in _AUDIO_MEDIA_TYPES.items():
        path = CACHE_DIR / f"{digest}{suffix}"
        if path.exists():
            return path, media_type
    return None


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

    voice_id = settings.tts_voice
    digest = hashlib.sha256(f"{text}\n{voice_id}\n{TTS_MODEL_ID}".encode()).hexdigest()
    if audio_path(digest) is None:
        audio = synthesize_speech(text=text, settings=settings)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{digest}.wav").write_bytes(audio)

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
    found = audio_path(content["hash"]) if content and content.get("hash") else None
    if found is None:
        raise AppError(
            code="NARRATION_NOT_FOUND",
            message=f"No narration audio for id {narration_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    path, media_type = found
    return FileResponse(path, media_type=media_type, filename=f"narration{path.suffix}")
