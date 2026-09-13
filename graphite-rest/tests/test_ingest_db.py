"""Persistence tests against a real Postgres (design-doc.md §18.1 integration tier).

Covers the layer that had no automated coverage at all: that ingestion actually
lands correct rows, that embeddings survive the ::vector round-trip at the right
width, and that the documented failure modes leave the database in a state the
UI can explain (§5.3) rather than a half-written one.
"""

from __future__ import annotations

import pytest

from graphite import ingest as ingest_mod
from graphite.config import settings
from graphite.ingest import get_or_create_course, ingest_file


def _chunks(conn, course_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.chunk_index, c.text, c.token_count, c.page_start, c.page_end,
                   c.section_path, c.embedding IS NOT NULL, c.metadata
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.course_id = %s
            ORDER BY d.filename, c.chunk_index
            """,
            (course_id,),
        )
        return cur.fetchall()


def _document(conn, course_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status, error_code, error_message, page_count, sha256, local_path "
            "FROM documents WHERE course_id = %s",
            (course_id,),
        )
        return cur.fetchone()


class TestHappyPath:
    def test_stores_document_and_chunks(self, conn, course_id, notes_file):
        result = ingest_file(conn, course_id, notes_file)
        assert result["status"] == "EMBEDDED"

        status, error_code, _, _, sha, local_path = _document(conn, course_id)
        assert status == "EMBEDDING"
        assert error_code is None
        assert len(sha) == 64
        # local_path must be absolute, or the API cannot resolve it later.
        assert local_path.startswith("/")

        rows = _chunks(conn, course_id)
        assert len(rows) >= 2

    def test_every_chunk_is_embedded(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        assert all(row[6] for row in _chunks(conn, course_id))

    def test_embedding_width_matches_configuration(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT vector_dims(c.embedding)
                FROM chunks c JOIN documents d ON d.id = c.document_id
                WHERE d.course_id = %s
                """,
                (course_id,),
            )
            assert [r[0] for r in cur.fetchall()] == [settings.embedding_dimensions]

    def test_section_paths_survive_persistence(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        sections = {row[5] for row in _chunks(conn, course_id)}
        assert "Lecture 1 > Array Indexing" in sections
        assert "Lecture 1 > Binary Search" in sections

    def test_chunk_indexes_are_contiguous_from_zero(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        indexes = [row[0] for row in _chunks(conn, course_id)]
        assert indexes == list(range(len(indexes)))

    def test_chunking_parameters_are_recorded(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        metadata = _chunks(conn, course_id)[0][7]
        assert metadata["chunk_max_tokens"] == settings.chunk_max_tokens


class TestPdfPersistence:
    def test_page_numbers_reach_the_database(self, conn, course_id, tmp_path):
        pymupdf = pytest.importorskip("pymupdf")

        doc = pymupdf.open()
        for text in ("Array indexing is constant time.", "Binary search halves it."):
            doc.new_page().insert_text((72, 72), text)
        path = tmp_path / "lecture.pdf"
        doc.save(path)
        doc.close()

        assert ingest_file(conn, course_id, path)["status"] == "EMBEDDED"
        assert _document(conn, course_id)[3] == 2  # page_count

        pages = {row[3] for row in _chunks(conn, course_id)}
        assert pages == {1, 2}


class TestFailureModes:
    def test_duplicate_file_is_rejected_not_reingested(self, conn, course_id, notes_file):
        assert ingest_file(conn, course_id, notes_file)["status"] == "EMBEDDED"
        before = len(_chunks(conn, course_id))

        assert ingest_file(conn, course_id, notes_file)["status"] == "DUPLICATE"
        assert len(_chunks(conn, course_id)) == before

    def test_same_file_is_allowed_in_a_different_course(self, conn, course_id, notes_file):
        ingest_file(conn, course_id, notes_file)
        other = get_or_create_course(conn, "__test__other_course")
        conn.commit()
        try:
            # documents_course_sha256_unique is scoped to (course_id, sha256).
            assert ingest_file(conn, other, notes_file)["status"] == "EMBEDDED"
        finally:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM courses WHERE id = %s", (other,))
            conn.commit()

    def test_empty_file_records_a_recoverable_failure(self, conn, course_id, tmp_path):
        empty = tmp_path / "scan.md"
        empty.write_text("   \n\n")

        assert ingest_file(conn, course_id, empty)["status"] == "FAILED"

        status, error_code, message, _, _, _ = _document(conn, course_id)
        # §5.3: the row must survive and explain itself, not vanish.
        assert status == "FAILED"
        assert error_code == "PARSE_EMPTY"
        assert message
        assert _chunks(conn, course_id) == []

    def test_oversized_file_is_rejected_before_any_row_is_written(
        self, conn, course_id, notes_file, monkeypatch
    ):
        monkeypatch.setattr(ingest_mod, "MAX_FILE_BYTES", 10)

        assert ingest_file(conn, course_id, notes_file)["status"] == "REJECTED"
        assert _document(conn, course_id) is None

    def test_unsupported_type_records_a_failure(self, conn, course_id, tmp_path):
        path = tmp_path / "notes.pages"
        path.write_text("some content")

        assert ingest_file(conn, course_id, path)["status"] == "FAILED"
        assert _document(conn, course_id)[1] == "UNSUPPORTED_FILE_TYPE"


class TestCourses:
    def test_get_or_create_is_idempotent(self, conn):
        name = "__test__idempotent"
        try:
            first = get_or_create_course(conn, name)
            conn.commit()
            assert get_or_create_course(conn, name) == first
        finally:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM courses WHERE name = %s", (name,))
            conn.commit()
