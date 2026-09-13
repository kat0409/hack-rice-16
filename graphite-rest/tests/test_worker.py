"""Worker tests against a real Postgres (design-doc.md §6.5, §7.2).

Mirrors test_ingest_db.py's approach: exercise the actual queue-claiming SQL
and status transitions rather than mocking the database, since the things most
likely to break here are exactly the things a mock would paper over — the
`FOR UPDATE SKIP LOCKED` claim, and the attempts/backoff bookkeeping.
"""

from __future__ import annotations

import json
import shutil
import uuid

from graphite.config import settings
from graphite.ingest import safe_stem, sha256_file
from graphite.parse import Block, ParsedDocument
from graphite.worker import MAX_ATTEMPTS, claim_job, requeue_stale_jobs, run_job

import graphite.worker as worker_mod


def _insert_document(conn, course_id, path):
    upload_dir = settings.upload_dir_path
    upload_dir.mkdir(parents=True, exist_ok=True)
    document_id = uuid.uuid4()
    stored = upload_dir / f"{document_id}_{safe_stem(path.name)}"
    shutil.copy2(path, stored)
    digest = sha256_file(path)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (id, course_id, filename, mime_type, sha256,
                                   local_path, status)
            VALUES (%s, %s, %s, 'text/markdown', %s, %s, 'UPLOADED')
            """,
            (document_id, course_id, path.name, digest, str(stored)),
        )
    conn.commit()
    return document_id


def _insert_job(conn, course_id, document_id, payload=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO jobs (course_id, document_id, job_type, status, payload)
            VALUES (%s, %s, 'INGEST_DOCUMENT', 'QUEUED', %s::jsonb)
            RETURNING id
            """,
            (course_id, document_id, json.dumps(payload or {})),
        )
        job_id = cur.fetchone()[0]
    conn.commit()
    return job_id


def _job_row(conn, job_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status, stage, attempts, error, locked_at FROM jobs WHERE id = %s",
            (job_id,),
        )
        return cur.fetchone()


def _document_row(conn, document_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status, error_code FROM documents WHERE id = %s", (document_id,)
        )
        return cur.fetchone()


def _chunk_count(conn, document_id):
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM chunks WHERE document_id = %s", (document_id,))
        return cur.fetchone()[0]


class TestClaimJob:
    def test_returns_none_on_empty_queue(self, conn, course_id):
        assert claim_job(conn) is None

    def test_a_queued_job_is_claimed_exactly_once(self, conn, course_id, notes_file):
        document_id = _insert_document(conn, course_id, notes_file)
        _insert_job(conn, course_id, document_id)

        first = claim_job(conn)
        assert first is not None
        assert first["document_id"] == document_id

        assert claim_job(conn) is None


class TestRunJob:
    def test_valid_markdown_reaches_embedding_with_chunks(
        self, conn, course_id, notes_file
    ):
        document_id = _insert_document(conn, course_id, notes_file)
        _insert_job(conn, course_id, document_id)

        job = claim_job(conn)
        run_job(conn, job)

        status, _ = _document_row(conn, document_id)
        # READY when Gemini is reachable; EMBEDDING (with an error code) when not.
        assert status in ("EMBEDDING", "READY")
        assert _chunk_count(conn, document_id) >= 1

    def test_empty_file_fails_job_only_after_max_attempts(
        self, conn, course_id, tmp_path
    ):
        empty = tmp_path / "scan.md"
        empty.write_text("   \n\n")
        document_id = _insert_document(conn, course_id, empty)
        job_id = _insert_job(conn, course_id, document_id)

        for attempt in range(1, MAX_ATTEMPTS + 1):
            job = claim_job(conn)
            assert job is not None
            run_job(conn, job)

            status, _, attempts, error, _ = _job_row(conn, job_id)
            assert attempts == attempt
            if attempt < MAX_ATTEMPTS:
                assert status == "QUEUED"
            else:
                assert status == "FAILED"
                assert error["code"] == "PARSE_EMPTY"

        doc_status, error_code = _document_row(conn, document_id)
        assert doc_status == "FAILED"
        assert error_code == "PARSE_EMPTY"

    def test_ocr_flag_is_threaded_to_parse_file(self, conn, course_id, notes_file, monkeypatch):
        calls = {}

        def fake_parse_file(path, *, ocr=False):
            calls["ocr"] = ocr
            return ParsedDocument(
                blocks=[Block(text="hello world")], page_count=None, used_ocr=ocr
            )

        monkeypatch.setattr(worker_mod, "parse_file", fake_parse_file)

        document_id = _insert_document(conn, course_id, notes_file)
        _insert_job(conn, course_id, document_id, payload={"ocr": True})

        job = claim_job(conn)
        run_job(conn, job)

        assert calls["ocr"] is True


class TestRequeueStaleJobs:
    def test_requeues_a_running_job_with_old_locked_at(self, conn, course_id, notes_file):
        document_id = _insert_document(conn, course_id, notes_file)
        job_id = _insert_job(conn, course_id, document_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                   SET status = 'RUNNING',
                       locked_at = now() - make_interval(secs => %s)
                 WHERE id = %s
                """,
                (worker_mod.STALE_AFTER_SECONDS + 60, job_id),
            )
        conn.commit()

        count = requeue_stale_jobs(conn)
        assert count >= 1

        status, _, _, _, locked_at = _job_row(conn, job_id)
        assert status == "QUEUED"
        assert locked_at is None
