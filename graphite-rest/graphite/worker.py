"""Ingestion worker: consumes QUEUED jobs the API creates (design-doc.md §6.5).

Claims one job at a time with `FOR UPDATE SKIP LOCKED` (§7.2), runs the same
parse -> chunk -> embed pipeline `graphite.ingest.ingest_file` uses, and
advances `documents.status` so the frontend's polling shows real progress.

    uv run python -m graphite.worker

Stops at EMBEDDING, not READY — READY means the knowledge graph has been
extracted, which is a later phase.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from psycopg.rows import dict_row

from graphite.chunk import chunk_blocks
from graphite.db import connection, verify_embedding_dimensions
from graphite.extract import ExtractionError, extract_document
from graphite.ingest import _fail, _set_status, store_chunks
from graphite.parse import ParseError, parse_file

logger = logging.getLogger("graphite")

MAX_ATTEMPTS = 3
STALE_AFTER_SECONDS = 600


def claim_job(conn) -> dict | None:
    """Atomically take one QUEUED job. Returns None when the queue is empty."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE jobs
               SET status = 'RUNNING',
                   locked_at = now(),
                   attempts = attempts + 1
             WHERE id = (
                   SELECT id FROM jobs
                    WHERE status = 'QUEUED'
                    ORDER BY created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
             )
            RETURNING id, course_id, document_id, job_type, payload, attempts
            """
        )
        row = cur.fetchone()
    conn.commit()
    return row


def _set_stage(conn, job_id, stage: str) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE jobs SET stage = %s WHERE id = %s", (stage, job_id))
    conn.commit()


def _succeed(conn, job_id, payload_extra: dict | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
               SET status = 'SUCCEEDED', stage = 'READY', completed_at = now(),
                   payload = payload || %s::jsonb
             WHERE id = %s
            """,
            (json.dumps(payload_extra or {}), job_id),
        )
    conn.commit()


def _fail_job(conn, job_id, code: str, message: str, attempts: int) -> None:
    if attempts >= MAX_ATTEMPTS:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                   SET status = 'FAILED',
                       error = %s::jsonb,
                       completed_at = now()
                 WHERE id = %s
                """,
                (json.dumps({"code": code, "message": message}), job_id),
            )
    else:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status = 'QUEUED', locked_at = NULL WHERE id = %s",
                (job_id,),
            )
    conn.commit()


def requeue_stale_jobs(conn) -> int:
    """Return jobs abandoned by a dead worker to the queue (design-doc.md §7.2)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
               SET status = 'QUEUED', locked_at = NULL
             WHERE status = 'RUNNING'
               AND locked_at < now() - make_interval(secs => %s)
               AND attempts < %s
            """,
            (STALE_AFTER_SECONDS, MAX_ATTEMPTS),
        )
        count = cur.rowcount
    conn.commit()
    return count


def run_job(conn, job: dict) -> None:
    document_id = job["document_id"]
    payload = job["payload"] or {}
    use_ocr = bool(payload.get("ocr", False))

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT local_path, filename FROM documents WHERE id = %s",
            (document_id,),
        )
        doc = cur.fetchone()

    if doc is None:
        _fail_job(
            conn, job["id"], "DOCUMENT_MISSING",
            f"No document with id {document_id}.", job["attempts"],
        )
        return

    if job["job_type"] == "EXTRACT_DOCUMENT":
        _run_extraction(conn, job, document_id)
        return

    path = Path(doc["local_path"])
    try:
        _set_status(conn, document_id, "PARSING")
        _set_stage(conn, job["id"], "PARSING")
        parsed = parse_file(path, ocr=use_ocr)

        _set_status(conn, document_id, "CHUNKING")
        _set_stage(conn, job["id"], "CHUNKING")
        chunks = chunk_blocks(parsed.blocks, used_ocr=parsed.used_ocr)
        if not chunks:
            raise ParseError("PARSE_EMPTY", "Parsing produced no usable chunks.")

        _set_status(conn, document_id, "EMBEDDING")
        _set_stage(conn, job["id"], "EMBEDDING")
        store_chunks(conn, document_id, chunks)

        if parsed.page_count is not None:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE documents SET page_count = %s WHERE id = %s",
                    (parsed.page_count, document_id),
                )
            conn.commit()
    except ParseError as exc:
        _fail(conn, document_id, exc.code, exc.message)
        _fail_job(conn, job["id"], exc.code, exc.message, job["attempts"])
        return
    except Exception as exc:
        _fail(conn, document_id, "INGEST_FAILED", str(exc))
        _fail_job(conn, job["id"], "INGEST_FAILED", str(exc), job["attempts"])
        return

    _run_extraction(conn, job, document_id)


def _run_extraction(conn, job: dict, document_id) -> None:
    # Never requeue: re-running the ingest path would duplicate stored chunks.
    _set_stage(conn, job["id"], "EXTRACTING")
    try:
        summary = extract_document(conn, document_id)
    except ExtractionError as exc:
        _fail_job(conn, job["id"], exc.code, exc.message, MAX_ATTEMPTS)
        return
    _succeed(conn, job["id"], {"extraction": summary.as_dict()})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="graphite.worker")
    parser.add_argument(
        "--once", action="store_true", help="Drain the queue and exit (used by tests)."
    )
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args(argv)

    verify_embedding_dimensions()
    logger.info("worker started")

    while True:
        with connection() as conn:
            requeue_stale_jobs(conn)
            job = claim_job(conn)
            if job is not None:
                run_job(conn, job)
        if job is None:
            if args.once:
                return 0
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    sys.exit(main())
