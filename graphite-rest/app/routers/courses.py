from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, Query, status

from app.deps import get_db
from app.errors import AppError
from app.pagination import decode_cursor, encode_cursor
from app.schemas import CourseCreate, CourseListOut, CourseOut

router = APIRouter(tags=["courses"])


def _row_to_course(row: asyncpg.Record) -> CourseOut:
    return CourseOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(body: CourseCreate, db: asyncpg.Pool = Depends(get_db)) -> CourseOut:
    row = await db.fetchrow(
        """
        INSERT INTO courses (name, description)
        VALUES ($1, $2)
        RETURNING id, name, description, created_at, updated_at
        """,
        body.name,
        body.description,
    )
    return _row_to_course(row)


@router.get("/courses", response_model=CourseListOut)
async def list_courses(
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
    db: asyncpg.Pool = Depends(get_db),
) -> CourseListOut:
    if cursor is not None:
        created_at, last_id = decode_cursor(cursor)
        rows = await db.fetch(
            """
            SELECT id, name, description, created_at, updated_at
            FROM courses
            WHERE (created_at, id) < ($1, $2)
            ORDER BY created_at DESC, id DESC
            LIMIT $3
            """,
            created_at,
            last_id,
            limit,
        )
    else:
        rows = await db.fetch(
            """
            SELECT id, name, description, created_at, updated_at
            FROM courses
            ORDER BY created_at DESC, id DESC
            LIMIT $1
            """,
            limit,
        )

    items = [_row_to_course(r) for r in rows]
    next_cursor = None
    if len(items) == limit:
        last = rows[-1]
        next_cursor = encode_cursor(last["created_at"], last["id"])
    return CourseListOut(items=items, next_cursor=next_cursor)


@router.get("/courses/{course_id}", response_model=CourseOut)
async def get_course(course_id: uuid.UUID, db: asyncpg.Pool = Depends(get_db)) -> CourseOut:
    row = await db.fetchrow(
        """
        SELECT id, name, description, created_at, updated_at
        FROM courses
        WHERE id = $1
        """,
        course_id,
    )
    if row is None:
        raise AppError(
            code="COURSE_NOT_FOUND",
            message=f"No course with id {course_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return _row_to_course(row)


async def require_course(course_id: uuid.UUID, db: asyncpg.Pool) -> None:
    """Shared existence check used by documents/jobs/graph/audio routers so
    they raise the same COURSE_NOT_FOUND envelope instead of a bare FK error."""
    exists = await db.fetchval("SELECT 1 FROM courses WHERE id = $1", course_id)
    if not exists:
        raise AppError(
            code="COURSE_NOT_FOUND",
            message=f"No course with id {course_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
