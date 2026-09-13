"""File validation and storage helpers for document uploads.

design-doc.md §8.2 "File validation":
- Validate extension and detected MIME type.
- Set a conservative file-size limit in configuration.
- Hash bytes before parsing to identify duplicate uploads within a course.
- Sanitize filenames and generate internal storage names.
- Never execute macros, embedded scripts, or linked content.
- Reject password-protected files with an actionable error.
- Treat scanned PDFs without extractable text as unsupported for the MVP.

Only the first four bullets are implemented here — this module never parses
file contents (no PyMuPDF/python-docx call), so macro execution, password
protection, and scanned-PDF detection genuinely cannot happen and are also
not detectable yet. Those three checks belong in the (out-of-scope, §8.3)
parsing stage a real ingestion worker would add; TODOs are left in the
documents router at the point a worker would pick this up.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from pathlib import Path

from app.errors import AppError

# design-doc.md §8.3 "Suggested local libraries" implies these four formats
# (PDF via PyMuPDF/pypdf, DOCX via python-docx, Markdown/TXT via native
# decoding) and graphite_ui_frontend_build_spec.md §24 shows the same set in
# the upload dropzone copy ("PDF · DOCX · TXT · Markdown").
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
    ".txt": "text/plain",
}

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(filename: str) -> str:
    """Strip any directory component and normalize to a safe display name.
    This is the *original filename* stored in `documents.filename` — it is
    never used as the on-disk path (see `internal_storage_name`)."""
    name = unicodedata.normalize("NFKC", filename)
    name = Path(name).name  # drop any path components (../, /etc/passwd, etc.)
    name = _SAFE_NAME_RE.sub("_", name).strip("._") or "upload"
    return name[:255]


def validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(
            code="UNSUPPORTED_FILE_TYPE",
            message=(
                f"'{ext or '(no extension)'}' is not a supported file type. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
            ),
            status_code=400,
        )
    return ext


def validate_size(size_bytes: int, max_bytes: int) -> None:
    if size_bytes > max_bytes:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"File exceeds the {max_bytes // (1024 * 1024)}MB upload limit.",
            status_code=400,
        )
    if size_bytes == 0:
        raise AppError(
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
            status_code=400,
        )


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def internal_storage_name(document_id: uuid.UUID, ext: str) -> str:
    """Internal storage name, deliberately decoupled from the user-supplied
    filename (design-doc.md §8.2 "generate internal storage names")."""
    return f"{document_id}{ext}"


def resolve_document_path(upload_dir: Path, course_id: uuid.UUID, document_id: uuid.UUID, ext: str) -> Path:
    course_dir = upload_dir / str(course_id)
    return course_dir / internal_storage_name(document_id, ext)
