from __future__ import annotations

import uuid
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, Query, status

from app.deps import get_db
from app.errors import AppError
from app.routers.courses import _rows
from app.schemas import ArtifactListOut, ArtifactOut, GraphEvidenceOut
from graphite.artifacts import ArtifactError, generate_artifact

router = APIRouter(tags=["study-artifacts"])

_STATUS = {
    "STEP_NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "NO_EVIDENCE": status.HTTP_409_CONFLICT,
    "MODEL_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
    "MODEL_SCHEMA_INVALID": status.HTTP_502_BAD_GATEWAY,
}


def _to_out(row: dict) -> ArtifactOut:
    return ArtifactOut(
        id=row["id"],
        study_step_id=row["study_step_id"],
        artifact_type=row["artifact_type"],
        content=row["content"],
        citations=[
            GraphEvidenceOut(
                chunk_id=c["chunk_id"],
                document_id=c["document_id"],
                label=c.get("label") or "",
                excerpt=c.get("excerpt") or "",
            )
            for c in row["citations"]
            if c.get("chunk_id") and c.get("document_id")
        ],
        created_at=row["created_at"],
    )


@router.post(
    "/study-steps/{step_id}/artifacts",
    response_model=ArtifactOut,
    status_code=status.HTTP_201_CREATED,
)
def create_artifact(
    step_id: uuid.UUID,
    type: Literal["SUMMARY", "FLASHCARDS", "QUESTIONS"] = Query(...),
    db: psycopg.Connection = Depends(get_db),
) -> ArtifactOut:
    """Generate (or return the cached) study material for one route step (§10.1)."""
    try:
        row = generate_artifact(db, step_id, type)
    except ArtifactError as exc:
        raise AppError(
            code=exc.code,
            message=exc.message,
            status_code=_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
            retryable=exc.code in ("MODEL_UNAVAILABLE", "MODEL_SCHEMA_INVALID"),
        ) from exc
    return _to_out(row)


@router.get("/study-steps/{step_id}/artifacts", response_model=ArtifactListOut)
def list_artifacts(step_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)) -> ArtifactListOut:
    rows = _rows(
        db,
        """
        SELECT id, study_step_id, artifact_type, content, citations, created_at
        FROM study_artifacts WHERE study_step_id = %s ORDER BY created_at
        """,
        (step_id,),
    )
    return ArtifactListOut(items=[_to_out(r) for r in rows])
