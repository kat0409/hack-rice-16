"""asyncpg connection pool.

Explicitly pins `search_path = public` on every new connection. This is not
optional: graphite-db/init/00_extensions.sql documents that Apache AGE's
`create_graph('graphite')` creates a real Postgres schema named `graphite`,
and the role-default search_path (`"$user", public`) resolves `$user` to a
schema of that same name whenever POSTGRES_USER also equals the graph name
(true of `.env.example`'s default). Every application table lives in
`public`, so pinning `search_path` here avoids relying on schema-resolution
fallback behavior for correctness.
"""

from __future__ import annotations

import logging

import asyncpg

from app.config import get_settings

logger = logging.getLogger("graphite")

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.execute("SET search_path = public")


async def connect() -> None:
    global _pool
    settings = get_settings()
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=10,
            init=_init_connection,
        )
    except Exception:
        # Don't crash app startup if Postgres isn't up yet (§9 "External model is
        # unavailable during demo" mirrors the same "degrade, don't crash" spirit
        # for the DB). /health reports the DB as down; every DB-backed route
        # raises a clean DB_UNAVAILABLE AppError instead of a bare exception.
        logger.exception("Could not connect to Postgres at startup")
        _pool = None


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool | None:
    return _pool


async def is_healthy() -> bool:
    if _pool is None:
        return False
    try:
        async with _pool.acquire() as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False
