# Implementation plan: frontend upload → real ingestion pipeline

**Audience:** a coding agent implementing this end to end. Follow the tasks in order. Each task lists exact files, exact signatures, and a verification command. Do not skip verification steps — several tasks depend on the previous one actually working.

**Repo root:** `/Users/Kathi/Hack_Rice/graphite`
Backend lives in `graphite-rest/`, frontend in `apps/web/`.

---

## 0. What already exists (do not rebuild these)

| Component | Location | State |
| --- | --- | --- |
| Parse (PDF/DOCX/MD/TXT) | `graphite-rest/graphite/parse.py` | Done, tested |
| OCR for scanned PDFs | `graphite-rest/graphite/ocr.py` | Done, tested offline |
| Chunking | `graphite-rest/graphite/chunk.py` | Done, tested |
| Local embeddings (384-dim) | `graphite-rest/graphite/embed.py` | Done |
| Full ingest orchestration | `graphite-rest/graphite/ingest.py` → `ingest_file()` | Done, tested |
| Gemini adapter | `graphite-rest/graphite/model_adapter.py` | Done; needs `GEMINI_API_KEY` |
| DB pool (psycopg, AGE-ready) | `graphite-rest/graphite/db.py` | Done |
| Upload endpoint | `graphite-rest/app/routers/documents.py` | Stores file + `QUEUED` job, nothing more |
| Graph + study-session endpoints | `app/routers/graph.py`, `study_sessions.py` | Done |

**The three gaps this plan closes:**

1. The upload endpoint has no `ocr` flag.
2. Nothing consumes the `jobs` table, so uploaded documents sit at `status='UPLOADED'` forever.
3. The frontend (`apps/web/src/pages/SourcesPage.tsx`) never calls the API — it fakes the pipeline with `setTimeout`.

**Run all backend commands from `graphite-rest/`.** Verify the database is up first:

```bash
cd graphite-rest && uv run pytest -q     # must report 102 passed
```

---

## Task 1 — Record OCR provenance on chunks

**Why:** OCR'd handwriting is less reliable than extracted text. Once stored, the two are currently indistinguishable, so the UI cannot warn a student that a citation came from a transcription.

### 1a. `graphite-rest/graphite/parse.py`

Add a field to the `ParsedDocument` dataclass:

```python
@dataclass
class ParsedDocument:
    blocks: list[Block]
    page_count: int | None
    used_ocr: bool = False
```

In `_parse_pdf`, the OCR fallback branch currently reads:

```python
    if not blocks and ocr:
        from graphite.ocr import ocr_pdf
        blocks = ocr_pdf(path)
```

Change the final return of `_parse_pdf` so it reports whether OCR ran. Track it with a local variable set to `True` inside that branch, then:

```python
    return ParsedDocument(blocks=blocks, page_count=page_count, used_ocr=used_ocr)
```

The other parsers (`_parse_docx`, `_parse_markdown`) keep returning the default `used_ocr=False`.

### 1b. `graphite-rest/graphite/chunk.py`

`chunk_blocks` must accept and propagate the flag:

```python
def chunk_blocks(blocks: list[Block], *, used_ocr: bool = False) -> list[Chunk]:
```

Pass `used_ocr` into `_provenance()`:

```python
def _provenance(used_ocr: bool = False) -> dict:
    return {
        "chunk_target_tokens": settings.chunk_target_tokens,
        "chunk_max_tokens": settings.chunk_max_tokens,
        "chunk_overlap_tokens": settings.chunk_overlap_tokens,
        "token_estimator": "chars/4",
        "ocr": used_ocr,
    }
```

`_provenance()` is called in two places (`_emit` and `_make`) — both need the argument threaded through. `_emit` and `_split_oversized` and `_make` all need a `used_ocr` parameter added.

### 1c. `graphite-rest/graphite/ingest.py`

In `ingest_file`, change the chunking call:

```python
        chunks = chunk_blocks(parsed.blocks, used_ocr=parsed.used_ocr)
```

### Verify

```bash
uv run pytest -q          # 102 still pass
uv run python -c "
from graphite.chunk import chunk_blocks
from graphite.parse import Block
print(chunk_blocks([Block(text='x')], used_ocr=True)[0].metadata)
"
# must print a dict containing 'ocr': True
```

---

## Task 2 — Add the `ocr` flag to the upload endpoint

**File:** `graphite-rest/app/routers/documents.py`

### 2a. Add the query parameter

The current signature is:

```python
async def upload_documents(
    course_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentUploadResponse:
```

Add `ocr` **before** the `db` parameter (FastAPI requires non-default params first; these all have defaults so order is free, but keep it readable):

```python
async def upload_documents(
    course_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    ocr: bool = Query(
        default=False,
        description=(
            "Transcribe PDFs that have no text layer (scans, photographed "
            "handwriting). This sends page images to the model provider, which "
            "is more than the text excerpts normally sent, so it is off by "
            "default (design-doc.md §8.11)."
        ),
    ),
    db: psycopg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentUploadResponse:
```

`Query` is already imported in this file. Confirm with `grep -n "from fastapi import" app/routers/documents.py` and add `Query` to that import list if missing.

### 2b. Persist the flag into the job payload

Find the `INSERT INTO jobs` statement. Its parameter tuple currently ends with:

```python
    (course_id, document_id, json.dumps({"filename": original_name})),
```

Change to:

```python
    (
        course_id,
        document_id,
        json.dumps({"filename": original_name, "ocr": ocr}),
    ),
```

The worker in Task 3 reads `payload->>'ocr'` to decide whether to transcribe.

### Verify

```bash
uv run python -c "
from fastapi.testclient import TestClient
from app.main import create_app
c = TestClient(create_app())
spec = c.get('/openapi.json').json()
params = spec['paths']['/api/v1/courses/{course_id}/documents']['post'].get('parameters', [])
print([p['name'] for p in params])
"
# must include 'ocr'
```

---

## Task 3 — Build the ingestion worker

**New file:** `graphite-rest/graphite/worker.py`

This is design doc §6.5. It claims `QUEUED` jobs, runs the existing pipeline, and advances `documents.status` so the frontend's polling shows real progress.

### 3a. Job claiming

Use `FOR UPDATE SKIP LOCKED` so two workers never take the same job (design doc §7.2). The claim must be its own committed transaction — do not hold the row lock while running the pipeline, which takes tens of seconds.

```python
def claim_job(conn) -> dict | None:
    """Atomically take one QUEUED job. Returns None when the queue is empty."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE jobs
               SET status = 'RUNNING',
                   locked_at = now(),
                   attempts = attempts + 1
             WHERE id = (
                   SELECT id FROM jobs
                    WHERE status = 'QUEUED'
                    ORDER BY created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
             )
            RETURNING id, course_id, document_id, job_type, payload, attempts
            """
        )
        row = cur.fetchone()
    conn.commit()
    return row
```

### 3b. Running one job

```python
MAX_ATTEMPTS = 3

def run_job(conn, job: dict) -> None:
    document_id = job["document_id"]
    payload = job["payload"] or {}
    use_ocr = bool(payload.get("ocr", False))
```

Look up the document's `local_path`:

```python
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT local_path, filename FROM documents WHERE id = %s",
            (document_id,),
        )
        doc = cur.fetchone()
```

If `doc is None`, mark the job `FAILED` with error `{"code": "DOCUMENT_MISSING"}` and return.

Then reuse the existing pipeline rather than reimplementing it. Import from `graphite.ingest`:

```python
from graphite.ingest import store_chunks, _set_status, _fail
from graphite.parse import parse_file, ParseError
from graphite.chunk import chunk_blocks
```

The body mirrors the `try` block of `ingest_file`:

```python
    path = Path(doc["local_path"])
    try:
        _set_status(conn, document_id, "PARSING")
        _set_stage(conn, job["id"], "PARSING")
        parsed = parse_file(path, ocr=use_ocr)

        _set_status(conn, document_id, "CHUNKING")
        _set_stage(conn, job["id"], "CHUNKING")
        chunks = chunk_blocks(parsed.blocks, used_ocr=parsed.used_ocr)
        if not chunks:
            raise ParseError("PARSE_EMPTY", "Parsing produced no usable chunks.")

        _set_status(conn, document_id, "EMBEDDING")
        _set_stage(conn, job["id"], "EMBEDDING")
        store_chunks(conn, document_id, chunks)

        if parsed.page_count is not None:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE documents SET page_count = %s WHERE id = %s",
                    (parsed.page_count, document_id),
                )
            conn.commit()

        _succeed(conn, job["id"])
    except ParseError as exc:
        _fail(conn, document_id, exc.code, exc.message)
        _fail_job(conn, job["id"], exc.code, exc.message, job["attempts"])
    except Exception as exc:
        _fail(conn, document_id, "INGEST_FAILED", str(exc))
        _fail_job(conn, job["id"], "INGEST_FAILED", str(exc), job["attempts"])
```

**Important:** documents stop at `EMBEDDING`, not `READY`. `READY` means the knowledge graph has been extracted, which is a later phase. Do not set `READY` here.

### 3c. Job state helpers

Write these three small functions in the same file:

- `_set_stage(conn, job_id, stage)` — `UPDATE jobs SET stage = %s WHERE id = %s`, then commit.
- `_succeed(conn, job_id)` — `UPDATE jobs SET status='SUCCEEDED', stage='EMBEDDING', completed_at=now() WHERE id=%s`, then commit.
- `_fail_job(conn, job_id, code, message, attempts)` — if `attempts >= MAX_ATTEMPTS`, set `status='FAILED'`, `error = jsonb_build_object('code', %s, 'message', %s)`, `completed_at=now()`. Otherwise set `status='QUEUED'` and `locked_at=NULL` so it is retried. Commit either way.

### 3d. Stale job recovery

A worker killed mid-job leaves a row `RUNNING` forever. Add:

```python
STALE_AFTER_SECONDS = 600

def requeue_stale_jobs(conn) -> int:
    """Return jobs abandoned by a dead worker to the queue (design-doc.md §7.2)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
               SET status = 'QUEUED', locked_at = NULL
             WHERE status = 'RUNNING'
               AND locked_at < now() - make_interval(secs => %s)
               AND attempts < %s
            """,
            (STALE_AFTER_SECONDS, MAX_ATTEMPTS),
        )
        count = cur.rowcount
    conn.commit()
    return count
```

### 3e. The loop

```python
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="graphite.worker")
    parser.add_argument("--once", action="store_true",
                        help="Drain the queue and exit (used by tests).")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args(argv)

    verify_embedding_dimensions()
    logger.info("worker started")

    while True:
        with connection() as conn:
            requeue_stale_jobs(conn)
            job = claim_job(conn)
            if job is not None:
                run_job(conn, job)
        if job is None:
            if args.once:
                return 0
            time.sleep(args.poll_seconds)
```

Note the `job is None` check sits **outside** the `with` block so the connection returns to the pool while sleeping.

Add `if __name__ == "__main__": sys.exit(main())`.

### Verify

```bash
# Terminal A
uv run python -m graphite.worker

# Terminal B
uv run python -c "
from fastapi.testclient import TestClient
from app.main import create_app
c = TestClient(create_app())
cid = c.post('/api/v1/courses', json={'name':'worker-test'}).json()['id']
with open('../fixtures/demo-course/01-arrays-and-searching.md','rb') as f:
    r = c.post(f'/api/v1/courses/{cid}/documents', files={'files': f})
print(r.status_code, r.json()['uploaded'][0]['job']['status'])
print('course', cid)
"
# Wait ~5s, then check the document reached EMBEDDING:
uv run python -c "
from graphite.db import connection
with connection() as conn, conn.cursor() as cur:
    cur.execute(\"SELECT filename, status FROM documents WHERE course_id=(SELECT id FROM courses WHERE name='worker-test')\")
    print(cur.fetchall())
"
# expect: [('01-arrays-and-searching.md', 'EMBEDDING')]
```

Clean up afterwards: `DELETE FROM courses WHERE name='worker-test';`

### 3f. Tests

**New file:** `graphite-rest/tests/test_worker.py`. Use the existing `conn`, `course_id`, and `notes_file` fixtures from `tests/conftest.py`. Cover:

1. `claim_job` returns `None` on an empty queue.
2. A queued job is claimed exactly once — call `claim_job` twice, second returns `None`.
3. `run_job` on a valid markdown document leaves `documents.status = 'EMBEDDING'` and creates chunk rows.
4. `run_job` on an empty file sets `jobs.status='FAILED'` **only after** `MAX_ATTEMPTS`, and `documents.error_code='PARSE_EMPTY'`.
5. `requeue_stale_jobs` returns a `RUNNING` job with an old `locked_at` back to `QUEUED`.
6. A job whose payload has `ocr: true` calls `parse_file` with `ocr=True` — assert via `monkeypatch` on `graphite.worker.parse_file`, do not call a real model.

---

## Task 4 — Frontend: replace the simulation with real calls

**Files:** everything under `apps/web/src/`.

### 4a. Create the API client

**New file:** `apps/web/src/lib/api.ts`

```ts
const BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000/api/v1'

export type ApiError = { code: string; message: string; retryable: boolean }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error(body?.error?.message ?? res.statusText), {
      code: body?.error?.code ?? 'UNKNOWN',
    })
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
```

Add these functions. **Field names from the API are snake_case** — the backend deliberately does not camelCase them (see `graphite-rest/app/schemas.py` docstring), so convert at this boundary.

```ts
export type DocumentDto = {
  id: string
  filename: string
  status: 'UPLOADED' | 'PARSING' | 'CHUNKING' | 'EMBEDDING' | 'EXTRACTING' | 'RESOLVING' | 'READY' | 'FAILED'
  error_code: string | null
  error_message: string | null
  page_count: number | null
  created_at: string
}

export type UploadResponse = {
  uploaded: { document: DocumentDto; job: { id: string; status: string } }[]
  rejected: { filename: string; code: string; message: string }[]
}

export const api = {
  listCourses: () => request<{ items: { id: string; name: string }[] }>('/courses'),

  createCourse: (name: string) =>
    request<{ id: string; name: string }>('/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  uploadDocuments: (courseId: string, files: File[], ocr: boolean) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return request<UploadResponse>(
      `/courses/${courseId}/documents?ocr=${ocr}`,
      { method: 'POST', body: form },
    )
  },

  listDocuments: (courseId: string) =>
    request<{ items: DocumentDto[] }>(`/courses/${courseId}/documents`),
}
```

Do **not** set `Content-Type` on the upload — the browser must set the multipart boundary itself.

### 4b. Rewrite `SourcesPage.tsx`

Current behavior to delete: the `PIPELINE.slice(1).forEach(... setTimeout ...)` block that fakes status transitions, and the `mockSources` import used as initial state.

New behavior:

1. On mount, resolve a course: call `api.listCourses()`; if empty, `api.createCourse('My Course')`. Store the id in state.
2. `ingest(files)` calls `api.uploadDocuments(courseId, Array.from(files), ocrEnabled)`.
3. Map each returned `uploaded[].document` into the existing `SourceFile` shape and put it in state. Show `rejected[]` entries as failed rows with their `message`.
4. **Poll** `api.listDocuments(courseId)` every 1500 ms while any document is in a non-terminal status (`UPLOADED`/`PARSING`/`CHUNKING`/`EMBEDDING`/`EXTRACTING`/`RESOLVING`). Stop polling when all are `READY`, `FAILED`, or `EMBEDDING` (the current terminal state until extraction exists). Clear the interval on unmount.

### 4c. The OCR opt-in control

This is a privacy control, not a convenience toggle — it must be explicit.

Add near the dropzone:

```tsx
<label className="flex items-start gap-2 text-sm">
  <input
    type="checkbox"
    checked={ocrEnabled}
    onChange={(e) => setOcrEnabled(e.target.checked)}
  />
  <span>
    <strong>Read scanned or handwritten PDFs</strong>
    <br />
    Files without selectable text can only be read by sending pictures of their
    pages to the model provider for transcription. That is more than the text
    excerpts normally sent. Off by default.
  </span>
</label>
```

When a document comes back `FAILED` with `error_code === 'PARSE_EMPTY'`, render an inline prompt on that row: *"This file has no selectable text. Enable the scanned-PDF option above and upload it again."*

### Verify

```bash
# Terminal A
cd graphite-rest && uv run uvicorn app.main:app --reload
# Terminal B
cd graphite-rest && uv run python -m graphite.worker
# Terminal C
cd apps/web && npm run dev
```

In the browser: drop `fixtures/demo-course/01-arrays-and-searching.md` onto the dropzone. The row must progress `UPLOADED → PARSING → CHUNKING → EMBEDDING` **driven by real polling**, not timers. Confirm with:

```bash
cd graphite-rest && uv run python -c "
from graphite.db import connection
with connection() as conn, conn.cursor() as cur:
    cur.execute('SELECT count(*) FROM chunks')
    print('chunks in db:', cur.fetchone()[0])
"
```

---

## Task 5 — End-to-end OCR check (requires `GEMINI_API_KEY`)

Only attempt after Tasks 1–4 pass. Set `GEMINI_API_KEY` in the repo-root `.env` first (free key: https://aistudio.google.com/apikey). Leave `GEMINI_MODEL` blank — the adapter discovers a model automatically.

1. Upload a handwritten or scanned PDF **with the OCR checkbox off**. Expect the row to fail with `PARSE_EMPTY` and show the inline prompt.
2. Upload the same file **with the checkbox on**. Expect `PARSING → CHUNKING → EMBEDDING`.
3. Confirm the transcription reached the database and is marked as OCR-derived:

```bash
uv run python -c "
from graphite.db import connection
with connection() as conn, conn.cursor() as cur:
    cur.execute(\"SELECT page_start, metadata->>'ocr', left(text,80) FROM chunks WHERE metadata->>'ocr' = 'true' ORDER BY page_start LIMIT 5\")
    for r in cur.fetchall(): print(r)
"
```

Expect real transcribed text, correct page numbers, and `ocr = true`. Math should appear as LaTeX between `$` signs.

4. Confirm caching works: re-run the same upload and check `data/ocr-cache/` has one `.txt` per page, and that the second run is noticeably faster with no new API calls.

---

## Guardrails

- **Do not** change `EMBEDDING_DIMENSIONS` (384) or the `vector(384)` columns. The width is fixed at container init; changing it requires `make db-reset` and destroys all data.
- **Do not** set `documents.status = 'READY'`. That means the knowledge graph is extracted, which is a later phase.
- **Do not** make OCR default-on anywhere. Two tests in `tests/test_ocr.py` exist specifically to catch that regression.
- **Do not** return `local_path` in any API response (design doc §11.1).
- **Do not** run DDL from application code. The connection pool puts `ag_catalog` first in `search_path`, so a bare `CREATE TABLE` lands in Apache AGE's schema. Schema changes belong in `graphite-db/init/`.
- Run `uv run pytest -q` after every task. The baseline is **102 passing**; it should only ever go up.

---

## Definition of done

- [ ] `uv run pytest -q` passes, with new worker tests added.
- [ ] Dropping a Markdown file in the browser creates real `documents` and `chunks` rows.
- [ ] The status shown in the UI comes from polling the API, with no `setTimeout` simulation left in `SourcesPage.tsx`.
- [ ] A scanned PDF fails clearly with `PARSE_EMPTY` when OCR is off, and succeeds when it is on.
- [ ] `chunks.metadata->>'ocr'` is `true` for transcribed content and `false` otherwise.
- [ ] Killing the worker mid-job and restarting it re-queues that job rather than stranding it.
