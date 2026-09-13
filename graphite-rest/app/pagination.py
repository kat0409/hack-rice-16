"""Minimal opaque cursor pagination (design-doc.md §11.1: "Use cursor
pagination for large collections"). Cursors encode (created_at, id) of the
last row seen, ordered `created_at DESC, id DESC`.
"""

from __future__ import annotations

import base64
import binascii
import datetime
import uuid

from app.errors import AppError


def encode_cursor(created_at: datetime.datetime, row_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{row_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> tuple[datetime.datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        created_at_raw, id_raw = raw.split("|", 1)
        return datetime.datetime.fromisoformat(created_at_raw), uuid.UUID(id_raw)
    except (ValueError, binascii.Error) as exc:
        raise AppError(
            code="INVALID_CURSOR",
            message="The provided pagination cursor is invalid.",
            status_code=400,
        ) from exc
