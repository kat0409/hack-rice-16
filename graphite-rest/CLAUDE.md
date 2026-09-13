# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `graphite-rest/` (uses `uv`, Python pinned to 3.12 via repo-root `.python-version`):

```bash
uv sync                                    # install/update deps from pyproject.toml + uv.lock
uv run uvicorn app.main:app --reload       # run the API — http://127.0.0.1:8000
uv run python -m graphite.worker           # ingestion worker (needed for uploads to progress past UPLOADED)
uv run pytest                              # test suite (DB-backed tests need `make db-up`)
uv run python -m graphite.ingest "Course Name" ../fixtures/demo-course/*.md   # ingest notes
uv run fastapi dev main.py                 # equivalent, via the repo-convention entrypoint at main.py
uv run python scripts/export_openapi.py    # regenerate the committed openapi.json after any route/schema change
```

Add dependencies with `uv add <package>` — never hand-edit `pyproject.toml`'s dependency list or `uv.lock`.

From the **repo root**, the DB is managed via `Makefile`, not from inside this directory:

```bash
make db-up      # docker compose up -d --build db  (Postgres + pgvector + Apache AGE)
make db-psql    # psql shell inside the container, AGE already on search_path
make db-down
make db-reset   # destroys the data volume — confirms first
```

Copy repo-root `.env.example` to `.env` before running against a real database (`DATABASE_URL`, `ELEVENLABS_API_KEY`, etc. — see `graphite/config.py` for every field and its default). Without a `.env`/reachable Postgres, the app **still boots**: `/health` reports `{"status":"degraded","database":"down"}` and DB-backed routes return `503 DB_UNAVAILABLE` instead of crashing. That's intentional graceful-degradation behavior (useful in sandboxes with no Docker access) — don't treat it as a bug to silently "fix" by making startup fail hard.

Run the test suite with `uv run pytest` (88 tests covering parsing, chunking, the graph repository, and the planner; the DB-backed ones need `make db-up`).

## The contract is design-doc.md, not this code

`../design-doc.md` §11 ("API contract") is the authoritative, explicitly-locked spec for routes, request/response shapes, and error format. §7.2 has the exact relational table schemas (cross-check against `../graphite-db/init/*.sql` if they ever seem to diverge — the SQL files are ground truth over the prose). §16.1/§16.2 cover secrets and local exposure rules. `../architecture-mental-model.md` explains the bigger hybrid Postgres+pgvector+Apache AGE design this API is one piece of. Before adding or changing an endpoint, check whether design-doc.md already specifies its shape — don't invent a new one that conflicts with it.

Known discrepancy: `docs/graphite_ui_frontend_build_spec.md` types graph nodes with an entity type enum that doesn't match design-doc.md §7.2's `entity_type` values (e.g. `PROCESS` vs `PROCEDURE`). design-doc.md wins; this API emits `PROCEDURE`.

## Architecture

`app/` (actual app lives here; repo-root-convention `main.py` just re-exports `app.main:app` for ASGI servers):

- `main.py` — `create_app()`: CORS (open to the Vite dev origins in `config.py`), a request-id middleware (`X-Request-ID` header, also used in error bodies), `register_exception_handlers`, `/health`, and mounts every router under one `APIRouter(prefix="/api/v1")`.
- **Config and the DB pool are NOT in `app/`** — they live in `graphite/` and are shared by the API and the engine. `graphite/config.py` holds the single `Settings` (DB URL, Gemini key/model, embedding model + dimensions, chunking params, upload limits, ElevenLabs, CORS, host/port). `graphite/db.py` owns the one psycopg pool (`connect`/`disconnect`/`get_pool`/`is_healthy`/`connection`). Connection failure at startup logs a warning and continues rather than raising.
- `deps.py` — `get_db()` yields a pooled, AGE-ready `psycopg.Connection` for one request; it commits when the handler returns and rolls back if it raises. Handlers are plain `def` (FastAPI runs them in a threadpool), except `upload_documents` and `transcribe_course_audio`, which stay `async` because they await file/HTTP I/O.
- `errors.py` — **always** raise `AppError(code, message, status_code, retryable, details)` from route/service code for a well-formed error; don't hand-roll `HTTPException` bodies. A handler is also registered for plain `HTTPException`, validation errors, and any uncaught `Exception`, so every error response — including bugs — comes back as the design-doc.md §11.6 envelope `{"error": {code, message, retryable, request_id, details}}` and never leaks a traceback or internal detail to the client.
- `files.py` — upload validation shared by the documents and audio routers: extension allowlist (`ALLOWED_EXTENSIONS`), size limits, filename sanitization, sha256 hashing, and building the on-disk path under `UPLOAD_DIR`. `local_path` is stored in the DB but must never be serialized into an API response (design-doc.md §11.1).
- `pagination.py` — opaque cursor encode/decode for the `(created_at, id)` keyset pagination used by list endpoints.
- `schemas.py` — Pydantic request/response models. Field names are **snake_case**, matching design-doc.md's DTOs exactly (`source_count`, `relation_type`, etc.) — do not camelCase these to match the frontend's TypeScript types; that conversion belongs at the frontend's fetch boundary, not here.
- `routers/` — one thin `APIRouter` per resource:
  - `courses.py` — create/list/get; exposes `require_course(course_id, db)`, used by every other router to 404 early on an unknown course.
  - `documents.py` — multipart upload (multi-file in one request; each file independently validated/deduped/inserted, partial success is normal — response has both `uploaded` and `rejected` lists), list (paginated), delete. Insert of the `documents` row and its paired `jobs` row (`job_type='INGEST_DOCUMENT'`, `status='QUEUED'`) happens in one transaction (both share the request connection). Nothing consumes these jobs yet — ingestion currently runs via the `graphite.ingest` CLI, not a worker.
  - `jobs.py` — poll a single job's status/stage.
  - `graph.py` — the design-doc.md §11.3 graph DTO, nodes **and edges** both real. Edges come from `graphite.graph_repository.fetch_course_graph`, which reads topology from Apache AGE and hydrates it with relational confidence/rationale/evidence by application UUID.
  - `study_sessions.py` — `POST /api/v1/courses/{id}/study-sessions` turns a goal + minutes + weakness into an ordered, cited route via `graphite.planner`, and persists it to `study_sessions`/`study_steps`. `GET /api/v1/study-sessions/{id}` reads one back. Ordering is deterministic graph traversal, never a model call (§0.2 principle 2).
  - `audio.py` — `POST /api/v1/courses/{course_id}/audio-transcriptions`: multipart audio → `services/elevenlabs.py` → transcript text back to the caller (design-doc.md §10.4 "voice input" — the typed/transcribed text must stay editable client-side, this endpoint's only job is producing it). `persist_as_document=true` (query param) additionally saves the transcript as a `documents` row so it can flow through the same ingestion status pipeline as an uploaded `.txt` — this is an interpretation beyond the literal spec, flagged in the code, not a spec requirement.
  - `tutor.py` — `POST /api/v1/courses/{course_id}/tutor/turns`: a question (+ recent `history` sent by the client; stateless, no table) → `graphite.tutor.answer_question` → a grounded, cited, speech-friendly answer, then TTS cached by content hash under `data/narration-cache/` like narration. Voice is optional: a TTS failure or missing key returns the text with `audio_id: null` and `audio_error`. `GET /api/v1/tutor-audio/{audio_id}` streams it; the id is validated as 64 hex chars before touching the filesystem.
- `services/elevenlabs.py` — isolated ElevenLabs Speech-to-Text client (`httpx`, `xi-api-key` header). Default model id is `scribe_v2` (`Settings.elevenlabs_stt_model_id`), confirmed against live ElevenLabs docs — design-doc.md/older assumptions may say `scribe_v1`; that's stale, not a bug here. Missing `ELEVENLABS_API_KEY` → clean `503 TRANSCRIPTION_UNAVAILABLE`, never a crash.

## Pipeline pieces beyond the API

- **Worker** — `uv run python -m graphite.worker` claims `jobs` rows (`FOR UPDATE SKIP LOCKED`) and runs parse → chunk → embed → **extract** (`graphite/extract.py`: two Gemini JSON calls per document, name-only entity resolution, deterministic `HAS_STEP`/`NEXT`). Documents end at `READY`. Extraction failures leave the document at `EMBEDDING` with an `error_code`, chunks intact; `POST /documents/{id}/extract` enqueues an `EXTRACT_DOCUMENT` job to retry just that stage. The `graphite.ingest` CLI runs the same extraction unless `--no-extract`.
- **Study artifacts** — `POST /study-steps/{id}/artifacts?type=SUMMARY|FLASHCARDS|QUESTIONS` (`graphite/artifacts.py`), grounded on the step's evidence chunks + nearest chunks by embedding, cached per `(step, type)`. Questions are multiple-choice (deviation from §10.1's short-answer, to reuse the existing UI).
- **Voice tutor** (`graphite/tutor.py`) — retrieval is **hybrid**: vector candidates plus chunks whose `section_path` or text match question terms, re-ranked. Markdown chunks are small and their heading lives in `section_path`, not the chunk text (a chunk under "VPC Gateway Endpoint" may never say those words), so pure vector ranking missed the right chunk on real notes; each chunk is also shown to the model with its `[Section: …]`. Related concepts come from `planner.select_targets`. No chunks → a fixed "not covered" answer with zero model calls. Invented chunk/concept ids are dropped, as in artifacts.
- **Narration** — `POST /study-artifacts/{id}/narration` voices a SUMMARY via ElevenLabs TTS (`services/elevenlabs.py::synthesize_speech`), cached under `data/narration-cache/`; `GET /narrations/{id}/audio` streams it.

## Still deferred

- Rebuilding/pruning the graph when a document is deleted (design-doc.md §7.5) — delete only removes the row + file; AGE vertices for deleted courses are left orphaned (harmless: every query filters by `course_id`).
- Model-mediated entity merges / embedding-similarity resolution (§8.7) — resolution is exact normalized-name/alias match only.
- Auth/user accounts — local single-user MVP by design.

`.env` is gitignored (fixed this session — it previously wasn't, despite design-doc.md §16.1 requiring it). Never commit it; commit `.env.example` when adding a new setting.
