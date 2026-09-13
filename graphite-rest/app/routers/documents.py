from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

import psycopg
from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from graphite.config import Settings, get_settings
from app.deps import get_db
from app.routers.courses import _row, _rows
from app.errors import AppError
from app.files import (
    ALLOWED_EXTENSIONS,
    resolve_document_path,
    sanitize_filename,
    sha256_of,
    validate_extension,
    validate_size,
)
from app.pagination import decode_cursor, encode_cursor
from app.routers.courses import require_course
from app.schemas import (
    DocumentListOut,
    DocumentOut,
    DocumentUploadResponse,
    DocumentUploadResult,
    JobOut,
)

logger = logging.getLogger("graphite")

router = APIRouter(tags=["documents"])


def _row_to_document(row: dict) -> DocumentOut:
    return DocumentOut(
        id=row["id"],
        course_id=row["course_id"],
        filename=row["filename"],
        mime_type=row["mime_type"],
        sha256=row["sha256"],
        status=row["status"],
        error_code=row["error_code"],
        error_message=row["error_message"],
        page_count=row["page_count"],
        created_at=row["created_at"],
    )


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


@router.post(
    "/courses/{course_id}/documents",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_documents(
    course_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    ocr: bool = Query(
        default=False,
        description=(
            "Transcribe PDFs that have no text layer (scans, photographed "
            "handwriting). This sends page images to the model provider, which "
            "is more than the text excerpts normally sent, so it is off by "
            "default (design-doc.md §8.11)."
        ),
    ),
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentUploadResponse:
    require_course(course_id, db)

    if not files:
        raise AppError(code="NO_FILES", message="No files were uploaded.", status_code=400)

    uploaded: list[DocumentUploadResult] = []
    rejected: list[dict] = []

    for upload in files:
        try:
            original_name = sanitize_filename(upload.filename or "upload")
            ext = validate_extension(original_name)
            data = await upload.read()
            validate_size(len(data), settings.max_upload_bytes)
            digest = sha256_of(data)
            mime_type = ALLOWED_EXTENSIONS[ext]
            document_id = uuid.uuid4()
            dest_path = resolve_document_path(
                settings.upload_dir_path, course_id, document_id, ext
            )

            # Check duplicate-in-course before touching the filesystem.
            existing_row = _row(
                db,
                "SELECT id FROM documents WHERE course_id = %s AND sha256 = %s",
                (course_id, digest),
            )
            existing = existing_row["id"] if existing_row else None
            if existing is not None:
                rejected.append(
                    {
                        "filename": original_name,
                        "code": "DUPLICATE_DOCUMENT",
                        "message": "An identical file already exists in this course.",
                        "existing_document_id": str(existing),
                    }
                )
                continue

            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_bytes(data)
        except AppError as exc:
            rejected.append(
                {
                    "filename": upload.filename or "upload",
                    "code": exc.code,
                    "message": exc.message,
                }
            )
            continue

        # Insert document + job in one transaction (a real connection, not a pool).
        try:
            # Both inserts share the request connection, so the document and
            # its job commit together or not at all.
            doc_row = _row(
                db,
                """
                INSERT INTO documents
                    (id, course_id, filename, mime_type, sha256, local_path, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'UPLOADED')
                RETURNING id, course_id, filename, mime_type, sha256, status,
                          error_code, error_message, page_count, created_at
                """,
                (document_id, course_id, original_name, mime_type, digest, str(dest_path)),
            )
            job_row = _row(
                db,
                """
                INSERT INTO jobs
                    (course_id, document_id, job_type, status, stage, payload)
                VALUES (%s, %s, 'INGEST_DOCUMENT', 'QUEUED', 'UPLOADED', %s::jsonb)
                RETURNING id, course_id, document_id, job_type, status, stage,
                          attempts, payload, error, created_at, completed_at
                """,
                (
                    course_id,
                    document_id,
                    json.dumps({"filename": original_name, "ocr": ocr}),
                ),
            )
            uploaded.append(
                DocumentUploadResult(
                    document=_row_to_document(doc_row),
                    job=_row_to_job(job_row),
                )
            )
        except psycopg.errors.UniqueViolation:
            # TOCTOU: another concurrent upload of the same bytes won the race
            # between our pre-check above and this INSERT.
            dest_path.unlink(missing_ok=True)
            rejected.append(
                {
                    "filename": original_name,
                    "code": "DUPLICATE_DOCUMENT",
                    "message": "An identical file already exists in this course.",
                }
            )
        except Exception:
            logger.exception("Failed to persist uploaded document %s", original_name)
            # Roll back the file we already wrote so we don't leak orphaned uploads.
            dest_path.unlink(missing_ok=True)
            rejected.append(
                {
                    "filename": original_name,
                    "code": "STORAGE_FAILED",
                    "message": "Could not save this document. Please retry.",
                }
            )

    # graphite.worker claims these jobs and runs parse -> chunk -> embed -> extract.
    return DocumentUploadResponse(uploaded=uploaded, rejected=rejected)


@router.post(
    "/documents/{document_id}/extract",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def rerun_extraction(
    document_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> JobOut:
    """Re-run only the graph-extraction stage; chunks are kept (§5.3 retry)."""
    doc = _row(db, "SELECT id, course_id FROM documents WHERE id = %s", (document_id,))
    if doc is None:
        raise AppError(
            code="DOCUMENT_NOT_FOUND",
            message=f"No document with id {document_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if _row(db, "SELECT 1 FROM chunks WHERE document_id = %s LIMIT 1", (document_id,)) is None:
        raise AppError(
            code="DOCUMENT_NOT_EMBEDDED",
            message="This document has no stored chunks yet, so there is nothing to extract.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if _row(
        db,
        "SELECT 1 FROM jobs WHERE document_id = %s AND status IN ('QUEUED','RUNNING') LIMIT 1",
        (document_id,),
    ):
        raise AppError(
            code="EXTRACTION_IN_PROGRESS",
            message="A job for this document is already queued or running.",
            status_code=status.HTTP_409_CONFLICT,
        )
    job_row = _row(
        db,
        """
        INSERT INTO jobs (course_id, document_id, job_type, status, stage, payload)
        VALUES (%s, %s, 'EXTRACT_DOCUMENT', 'QUEUED', 'EMBEDDING', '{}'::jsonb)
        RETURNING id, course_id, document_id, job_type, status, stage,
                  attempts, payload, error, created_at, completed_at
        """,
        (doc["course_id"], document_id),
    )
    return _row_to_job(job_row)


@router.get("/courses/{course_id}/documents", response_model=DocumentListOut)
def list_documents(
    course_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
    db: psycopg.Connection = Depends(get_db),
) -> DocumentListOut:
    require_course(course_id, db)

    if cursor is not None:
        created_at, last_id = decode_cursor(cursor)
        rows = _rows(
            db,
            """
            SELECT id, course_id, filename, mime_type, sha256, status,
                   error_code, error_message, page_count, created_at
            FROM documents
            WHERE course_id = %s AND (created_at, id) < (%s, %s)
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (course_id, created_at, last_id, limit),
        )
    else:
        rows = _rows(
            db,
            """
            SELECT id, course_id, filename, mime_type, sha256, status,
                   error_code, error_message, page_count, created_at
            FROM documents
            WHERE course_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (course_id, limit),
        )

    items = [_row_to_document(r) for r in rows]
    next_cursor = None
    if len(items) == limit:
        last = rows[-1]
        next_cursor = encode_cursor(last["created_at"], last["id"])
    return DocumentListOut(items=items, next_cursor=next_cursor)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> None:
    row = _row(db, "SELECT id, local_path FROM documents WHERE id = %s", (document_id,))
    if row is None:
        raise AppError(
            code="DOCUMENT_NOT_FOUND",
            message=f"No document with id {document_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    with db.cursor() as cur:
        cur.execute("DELETE FROM documents WHERE id = %s", (document_id,))

    Path(row["local_path"]).unlink(missing_ok=True)

    # TODO(design-doc.md §11.2 "Delete and schedule rebuild", §7.5 rebuild
    # behavior): deleting a document should schedule a REBUILD_GRAPH job so the
    # course graph drops entities/relationships that were only supported by
    # this document's evidence. No worker exists yet to consume such a job
    # (see architecture-mental-model.md §6), so this is intentionally a no-op
    # beyond the row/file delete above.
    return None
