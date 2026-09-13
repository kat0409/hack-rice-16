from __future__ import annotations

from collections.abc import Iterator

import psycopg
from fastapi import status

from graphite import db
from graphite.db import connection
from app.errors import AppError


def get_db() -> Iterator[psycopg.Connection]:
    """Yield a pooled, AGE-ready connection for the duration of one request.

    Route handlers are plain `def`, so FastAPI runs them in a threadpool and a
    synchronous connection is safe to hold across the call. The transaction
    commits when the handler returns and rolls back if it raises.
    """
    if db.get_pool() is None:
        db.connect()
    if db.get_pool() is None:
        raise AppError(
            code="DB_UNAVAILABLE",
            message="The database is not reachable. Run `make db-up` and retry.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            retryable=True,
        )
    with connection() as conn:
        yield conn
