"""The single Postgres connection pool, shared by the API and the engine.

One driver, one pool. psycopg 3 rather than asyncpg because Apache AGE needs
two things on every connection that asyncpg's pool was not providing:

  * `LOAD 'age'`, without which Cypher is not available at all; and
  * `search_path = ag_catalog, "$user", public`, without which `cypher(...)`
    does not resolve.

design-doc.md §6.6 requires both to happen "through the connection-pool hook",
and requires application code to do it rather than relying on the server-level
`session_preload_libraries` that graphite-db/init/00_extensions.sql sets as a
safety net — a managed Postgres may not permit that ALTER SYSTEM, and it does
not cover search_path at all.

Note the ordering hazard: ag_catalog comes first, so a bare `CREATE TABLE` on
one of these connections would land in AGE's schema instead of `public`. DDL
belongs in graphite-db/init/, never in application code.

Cursors return tuples by default. Route handlers that want name-based access
open their cursor with `conn.cursor(row_factory=dict_row)` — chosen per cursor
rather than pool-wide so the two styles can coexist without a sweeping rewrite.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from graphite.config import settings

logger = logging.getLogger("graphite")

AGE_SEARCH_PATH = 'ag_catalog, "$user", public'

_pool: ConnectionPool | None = None


def _configure(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("LOAD 'age'")
        cur.execute(f"SET search_path = {AGE_SEARCH_PATH}")
    conn.commit()


def connect() -> None:
    """Open the pool. Never raises.

    A missing database must not stop the API from booting: /health then reports
    `degraded` and DB-backed routes return a clean DB_UNAVAILABLE instead of a
    stack trace. That mirrors the degrade-don't-crash posture §9's failure table
    takes for the model provider.
    """
    global _pool
    if _pool is not None:
        return
    try:
        pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=10,
            configure=_configure,
            open=True,
            timeout=5.0,
        )
        pool.wait(timeout=5.0)
        _pool = pool
    except Exception:
        logger.exception("Could not connect to Postgres at startup")
        _pool = None


def disconnect() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def get_pool() -> ConnectionPool | None:
    return _pool


def is_healthy() -> bool:
    if _pool is None:
        return False
    try:
        with _pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False


@contextmanager
def connection():
    """A pooled connection with AGE ready; commits on success, rolls back on error.

    Opens the pool on first use so the ingest CLI and the test suite work without
    going through the API's lifespan.
    """
    if _pool is None:
        connect()
    if _pool is None:
        raise RuntimeError(
            f"Cannot reach Postgres at {settings.database_url}. Run `make db-up`."
        )
    with _pool.connection() as conn:
        yield conn


def verify_embedding_dimensions() -> None:
    """Fail loudly when config and schema disagree (§17).

    Otherwise a mismatch is invisible until the first INSERT — after parsing,
    chunking and embedding have already run.
    """
    with connection() as conn, conn.cursor() as cur:
        # pgvector stores the dimension in atttypmod directly. Do NOT subtract
        # VARHDRSZ (4) here — that convention belongs to varchar/char, and
        # applying it reports a width 4 short of the truth.
        cur.execute(
            """
            SELECT atttypmod
            FROM pg_attribute
            WHERE attrelid = 'public.chunks'::regclass
              AND attname = 'embedding' AND NOT attisdropped
            """
        )
        row = cur.fetchone()

    if row is None:
        raise RuntimeError(
            "public.chunks.embedding not found — is the database initialized? "
            "Try `make db-up`."
        )
    if row[0] != settings.embedding_dimensions:
        raise RuntimeError(
            f"chunks.embedding is vector({row[0]}) but EMBEDDING_DIMENSIONS "
            f"is {settings.embedding_dimensions}. These must match; changing the "
            f"column width requires `make db-reset`."
        )
