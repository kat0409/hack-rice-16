from __future__ import annotations

import json
import uuid

import psycopg
from fastapi import APIRouter, Depends, status

from app.deps import get_db
from app.routers.courses import _row
from app.errors import AppError
from app.schemas import JobOut

router = APIRouter(tags=["jobs"])


def _row_to_job(row: dict) -> JobOut:
    payload = row["payload"]
    error = row["error"]
    return JobOut(
        id=row["id"],
        course_id=row["course_id"],
        document_id=row["document_id"],
        job_type=row["job_type"],
        status=row["status"],
        stage=row["stage"],
        attempts=row["attempts"],
        payload=json.loads(payload) if isinstance(payload, str) else (payload or {}),
        error=json.loads(error) if isinstance(error, str) else error,
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)) -> JobOut:
    row = _row(
        db,
        """
        SELECT id, course_id, document_id, job_type, status, stage,
               attempts, payload, error, created_at, completed_at
        FROM jobs
        WHERE id = %s
        """,
        (job_id,),
    )
    if row is None:
        raise AppError(
            code="JOB_NOT_FOUND",
            message=f"No job with id {job_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return _row_to_job(row)
