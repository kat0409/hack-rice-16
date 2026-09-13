from __future__ import annotations

import uuid

import psycopg
from fastapi import APIRouter, Depends, Query, status
from psycopg.rows import dict_row

from app.deps import get_db
from app.errors import AppError
from app.pagination import decode_cursor, encode_cursor
from app.schemas import CourseCreate, CourseListOut, CourseOut

router = APIRouter(tags=["courses"])


def _rows(conn: psycopg.Connection, sql: str, params: tuple = ()) -> list[dict]:
    """Run a query and return dict rows.

    Cursors are opened with dict_row here rather than pool-wide so the engine
    modules, which read positionally, keep working unchanged.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _row(conn: psycopg.Connection, sql: str, params: tuple = ()) -> dict | None:
    rows = _rows(conn, sql, params)
    return rows[0] if rows else None


def _row_to_course(row: dict) -> CourseOut:
    return CourseOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    body: CourseCreate, db: psycopg.Connection = Depends(get_db)
) -> CourseOut:
    row = _row(
        db,
        """
        INSERT INTO courses (name, description)
        VALUES (%s, %s)
        RETURNING id, name, description, created_at, updated_at
        """,
        (body.name, body.description),
    )
    return _row_to_course(row)


@router.get("/courses", response_model=CourseListOut)
def list_courses(
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
    db: psycopg.Connection = Depends(get_db),
) -> CourseListOut:
    if cursor is not None:
        created_at, last_id = decode_cursor(cursor)
        rows = _rows(
            db,
            """
            SELECT id, name, description, created_at, updated_at
            FROM courses
            WHERE (created_at, id) < (%s, %s)
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (created_at, last_id, limit),
        )
    else:
        rows = _rows(
            db,
            """
            SELECT id, name, description, created_at, updated_at
            FROM courses
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (limit,),
        )

    items = [_row_to_course(r) for r in rows]
    next_cursor = None
    if len(items) == limit:
        last = rows[-1]
        next_cursor = encode_cursor(last["created_at"], last["id"])
    return CourseListOut(items=items, next_cursor=next_cursor)


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(
    course_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> CourseOut:
    row = _row(
        db,
        """
        SELECT id, name, description, created_at, updated_at
        FROM courses
        WHERE id = %s
        """,
        (course_id,),
    )
    if row is None:
        raise AppError(
            code="COURSE_NOT_FOUND",
            message=f"No course with id {course_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return _row_to_course(row)


def require_course(course_id: uuid.UUID, db: psycopg.Connection) -> None:
    """Shared existence check used by documents/jobs/graph/audio routers so
    they raise the same COURSE_NOT_FOUND envelope instead of a bare FK error."""
    if _row(db, "SELECT 1 FROM courses WHERE id = %s", (course_id,)) is None:
        raise AppError(
            code="COURSE_NOT_FOUND",
            message=f"No course with id {course_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
