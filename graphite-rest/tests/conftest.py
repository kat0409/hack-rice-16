"""Fixtures for tests that need a real Postgres.

These run against the live development database rather than a mock, because the
things most likely to break are exactly the things a mock would paper over:
pgvector's ::vector cast, the vector(384) width constraint, the
(document_id, chunk_index) unique index, and FK cascade behaviour.

Every test works inside its own uniquely-named course and deletes it afterwards,
so the suite is safe to run against a database holding real ingested work.
"""

from __future__ import annotations

import uuid

import pytest


@pytest.fixture(scope="session")
def db_available() -> bool:
    try:
        from graphite.db import connection

        with connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"Postgres not reachable ({exc}). Start it with `make db-up`.")


@pytest.fixture
def conn(db_available):
    from graphite.db import connection

    with connection() as c:
        yield c


@pytest.fixture
def course_id(conn):
    """A throwaway course, removed afterwards. Deletion cascades to documents/chunks."""
    name = f"__test__{uuid.uuid4()}"
    with conn.cursor() as cur:
        cur.execute("INSERT INTO courses (name) VALUES (%s) RETURNING id", (name,))
        created = cur.fetchone()[0]
    conn.commit()

    yield created

    # A failing test can leave the transaction aborted, which would make the
    # cleanup DELETE fail too and leak the course into the next run.
    conn.rollback()
    with conn.cursor() as cur:
        # Study sessions must go first. Deleting a course cascades to
        # knowledge_entities, but study_steps.knowledge_entity_id is ON DELETE
        # RESTRICT, so any saved route blocks the course delete outright. That
        # is a real product bug (§16.3 requires course deletion to cascade) and
        # this ordering is a test-local workaround, not the fix.
        cur.execute("DELETE FROM study_sessions WHERE course_id = %s", (created,))
        cur.execute("DELETE FROM courses WHERE id = %s", (created,))
    conn.commit()


@pytest.fixture
def notes_file(tmp_path):
    """A small markdown file with two sections and a known prerequisite claim."""
    path = tmp_path / "notes.md"
    path.write_text(
        "# Lecture 1\n\n"
        "## Array Indexing\n\n"
        "Elements sit in contiguous memory, so a[i] is constant time.\n\n"
        "## Binary Search\n\n"
        "Binary search requires a sorted array and halves the range each step.\n"
    )
    return path
