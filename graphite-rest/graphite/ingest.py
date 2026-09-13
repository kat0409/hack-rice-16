"""Ingest notes files: parse -> chunk -> embed -> persist (design-doc.md §8.1-8.5).

Deliberately a CLI before it is a job worker. The worker in §6.5 adds durability
and status polling, but nothing about correctness — and having this runnable
standalone means the pipeline is testable without the API, the queue, or the
frontend existing.

    uv run python -m graphite.ingest "Data Structures" ../fixtures/demo-course/*.md

Stops at the EMBEDDING stage. Moving a document to READY is Phase 4's job, once
the graph has actually been extracted from it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import shutil
import sys
import uuid
from pathlib import Path

from graphite.chunk import Chunk, chunk_blocks
from graphite.config import settings
from graphite.db import connection, verify_embedding_dimensions
from graphite.embed import embed_texts
from graphite.parse import ParseError, parse_file

MAX_FILE_BYTES = 25 * 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_stem(name: str) -> str:
    """§8.2: sanitize filenames and generate internal storage names."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80] or "upload"


def get_or_create_course(conn, name: str) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM courses WHERE name = %s", (name,))
        if row := cur.fetchone():
            return row[0]
        cur.execute(
            "INSERT INTO courses (name) VALUES (%s) RETURNING id", (name,)
        )
        return cur.fetchone()[0]


def _to_vector(values: list[float]) -> str:
    """pgvector's text input format, cast server-side with ::vector.

    Avoids taking a dependency on pgvector's psycopg adapter just to send a
    literal; the cast in the INSERT below does the type conversion.
    """
    return "[" + ",".join(repr(v) for v in values) + "]"


def _set_status(conn, document_id: uuid.UUID, status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status = %s WHERE id = %s", (status, document_id)
        )
    conn.commit()


def _fail(conn, document_id: uuid.UUID, code: str, message: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documents
               SET status = 'FAILED', error_code = %s, error_message = %s
             WHERE id = %s
            """,
            (code, message[:500], document_id),
        )
    conn.commit()


def store_chunks(conn, document_id: uuid.UUID, chunks: list[Chunk]) -> None:
    vectors = embed_texts([c.text for c in chunks])
    with conn.cursor() as cur:
        for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
            cur.execute(
                """
                INSERT INTO chunks (document_id, chunk_index, text, token_count,
                                    page_start, page_end, section_path, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s)
                """,
                (
                    document_id,
                    index,
                    chunk.text,
                    chunk.token_count,
                    chunk.page_start,
                    chunk.page_end,
                    chunk.section_path,
                    _to_vector(vector),
                    json.dumps(chunk.metadata),
                ),
            )
    conn.commit()


def ingest_file(
    conn, course_id: uuid.UUID, path: Path, *, ocr: bool = False, extract: bool = False
) -> dict:
    if not path.is_file():
        return {"file": path.name, "status": "SKIPPED", "detail": "not a file"}

    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        return {
            "file": path.name,
            "status": "REJECTED",
            "detail": f"{size / 1e6:.1f} MB exceeds the {MAX_FILE_BYTES / 1e6:.0f} MB limit",
        }

    digest = sha256_file(path)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM documents WHERE course_id = %s AND sha256 = %s",
            (course_id, digest),
        )
        if cur.fetchone():
            return {
                "file": path.name,
                "status": "DUPLICATE",
                "detail": "identical file already ingested in this course",
            }

    upload_dir = settings.upload_dir_path
    upload_dir.mkdir(parents=True, exist_ok=True)
    document_id = uuid.uuid4()
    stored = upload_dir / f"{document_id}_{safe_stem(path.name)}"
    shutil.copy2(path, stored)

    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (id, course_id, filename, mime_type, sha256,
                                   local_path, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'UPLOADED')
            """,
            (document_id, course_id, path.name, mime, digest, str(stored)),
        )
    conn.commit()

    try:
        _set_status(conn, document_id, "PARSING")
        parsed = parse_file(path, ocr=ocr)

        _set_status(conn, document_id, "CHUNKING")
        chunks = chunk_blocks(parsed.blocks, used_ocr=parsed.used_ocr)
        if not chunks:
            raise ParseError("PARSE_EMPTY", "Parsing produced no usable chunks.")

        _set_status(conn, document_id, "EMBEDDING")
        store_chunks(conn, document_id, chunks)

        if parsed.page_count is not None:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE documents SET page_count = %s WHERE id = %s",
                    (parsed.page_count, document_id),
                )
            conn.commit()

    except ParseError as exc:
        _fail(conn, document_id, exc.code, exc.message)
        return {"file": path.name, "status": "FAILED", "detail": f"{exc.code}: {exc.message}"}
    except Exception as exc:
        _fail(conn, document_id, "INGEST_FAILED", str(exc))
        return {"file": path.name, "status": "FAILED", "detail": str(exc)}

    pages = {c.page_start for c in chunks if c.page_start is not None}
    sections = {c.section_path for c in chunks if c.section_path}
    detail = (
        f"{len(chunks)} chunks, "
        f"{sum(c.token_count for c in chunks)} est. tokens, "
        f"{len(pages)} pages, {len(sections)} sections"
    )

    if extract:
        from graphite.extract import ExtractionError, extract_document

        try:
            summary = extract_document(conn, document_id)
        except ExtractionError as exc:
            return {"file": path.name, "status": "FAILED", "detail": f"{exc.code}: {exc.message}"}
        detail += (
            f"; {summary.entities_created} new entities, {summary.entities_merged} merged, "
            f"{summary.edges_created} edges"
        )
        return {"file": path.name, "status": "READY", "detail": detail}

    return {"file": path.name, "status": "EMBEDDED", "detail": detail}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="graphite.ingest", description="Ingest notes into a graphite course."
    )
    parser.add_argument("course", help="Course name; created if it does not exist.")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument(
        "--ocr",
        action="store_true",
        help=(
            "Transcribe PDFs that have no text layer (scans, photographed "
            "handwriting). Sends page images to the model provider, so it is "
            "off by default — see design-doc.md §8.11."
        ),
    )
    parser.add_argument(
        "--no-extract",
        action="store_true",
        help="Stop at EMBEDDING; skip the Gemini graph extraction.",
    )
    args = parser.parse_args(argv)

    verify_embedding_dimensions()

    with connection() as conn:
        course_id = get_or_create_course(conn, args.course)
        conn.commit()
        print(f"course: {args.course}  ({course_id})\n")

        results = [
            ingest_file(conn, course_id, path, ocr=args.ocr, extract=not args.no_extract)
            for path in args.files
        ]

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*) FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.course_id = %s
                """,
                (course_id,),
            )
            total = cur.fetchone()[0]

    width = max(len(r["file"]) for r in results)
    for r in results:
        print(f"  {r['file']:<{width}}  {r['status']:<9}  {r['detail']}")

    print(f"\n{total} chunks now stored for this course.")
    return 1 if any(r["status"] == "FAILED" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
