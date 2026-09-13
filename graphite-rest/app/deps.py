from __future__ import annotations

import asyncpg
from fastapi import status

from app.db import get_pool
from app.errors import AppError


async def get_db() -> asyncpg.Pool:
    pool = get_pool()
    if pool is None:
        raise AppError(
            code="DB_UNAVAILABLE",
            message="The database is not reachable. Run `make db-up` and retry.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            retryable=True,
        )
    return pool
