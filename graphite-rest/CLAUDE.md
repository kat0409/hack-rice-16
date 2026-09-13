# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `graphite-rest/` (uses `uv`, Python pinned to 3.12 via repo-root `.python-version`):

```bash
uv sync                                    # install/update deps from pyproject.toml + uv.lock
uv run uvicorn app.main:app --reload       # run the API — http://127.0.0.1:8000
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

Copy repo-root `.env.example` to `.env` before running against a real database (`DATABASE_URL`, `ELEVENLABS_API_KEY`, etc. — see `app/config.py` for every field and its default). Without a `.env`/reachable Postgres, the app **still boots**: `/health` reports `{"status":"degraded","database":"down"}` and DB-backed routes return `503 DB_UNAVAILABLE` instead of crashing. That's intentional graceful-degradation behavior (useful in sandboxes with no Docker access) — don't treat it as a bug to silently "fix" by making startup fail hard.

No test suite exists yet.

## The contract is design-doc.md, not this code

`../design-doc.md` §11 ("API contract") is the authoritative, explicitly-locked spec for routes, request/response shapes, and error format. §7.2 has the exact relational table schemas (cross-check against `../graphite-db/init/*.sql` if they ever seem to diverge — the SQL files are ground truth over the prose). §16.1/§16.2 cover secrets and local exposure rules. `../architecture-mental-model.md` explains the bigger hybrid Postgres+pgvector+Apache AGE design this API is one piece of. Before adding or changing an endpoint, check whether design-doc.md already specifies its shape — don't invent a new one that conflicts with it.

Known discrepancy: `docs/graphite_ui_frontend_build_spec.md` types graph nodes with an entity type enum that doesn't match design-doc.md §7.2's `entity_type` values (e.g. `PROCESS` vs `PROCEDURE`). design-doc.md wins; this API emits `PROCEDURE`.

## Architecture

`app/` (actual app lives here; repo-root-convention `main.py` just re-exports `app.main:app` for ASGI servers):

- `main.py` — `create_app()`: CORS (open to the Vite dev origins in `config.py`), a request-id middleware (`X-Request-ID` header, also used in error bodies), `register_exception_handlers`, `/health`, and mounts every router under one `APIRouter(prefix="/api/v1")`.
- `config.py` — `pydantic-settings` `Settings`, loaded from real env vars first, then `.env` at the repo root as fallback. Every field (DB URL, upload limits, ElevenLabs key/voice/model id, CORS origins, host/port) lives here — check it before assuming a value or adding a new one.
- `db.py` — asyncpg pool lifecycle (`connect`/`disconnect`/`get_pool`/`is_healthy`), created at startup in `main.py`'s lifespan. Connection failure at startup logs a warning and continues rather than raising.
- `errors.py` — **always** raise `AppError(code, message, status_code, retryable, details)` from route/service code for a well-formed error; don't hand-roll `HTTPException` bodies. A handler is also registered for plain `HTTPException`, validation errors, and any uncaught `Exception`, so every error response — including bugs — comes back as the design-doc.md §11.6 envelope `{"error": {code, message, retryable, request_id, details}}` and never leaks a traceback or internal detail to the client.
- `files.py` — upload validation shared by the documents and audio routers: extension allowlist (`ALLOWED_EXTENSIONS`), size limits, filename sanitization, sha256 hashing, and building the on-disk path under `UPLOAD_DIR`. `local_path` is stored in the DB but must never be serialized into an API response (design-doc.md §11.1).
- `pagination.py` — opaque cursor encode/decode for the `(created_at, id)` keyset pagination used by list endpoints.
- `schemas.py` — Pydantic request/response models. Field names are **snake_case**, matching design-doc.md's DTOs exactly (`source_count`, `relation_type`, etc.) — do not camelCase these to match the frontend's TypeScript types; that conversion belongs at the frontend's fetch boundary, not here.
- `routers/` — one thin `APIRouter` per resource:
  - `courses.py` — create/list/get; exposes `require_course(course_id, db)`, used by every other router to 404 early on an unknown course.
  - `documents.py` — multipart upload (multi-file in one request; each file independently validated/deduped/inserted, partial success is normal — response has both `uploaded` and `rejected` lists), list (paginated), delete. Insert of the `documents` row and its paired `jobs` row (`job_type='INGEST_DOCUMENT'`, `status='QUEUED'`) happens in one transaction via `db.acquire()` + `conn.transaction()`. Nothing ever consumes these jobs — see "Deferred scope" below.
  - `jobs.py` — poll a single job's status/stage.
  - `graph.py` — returns the design-doc.md §11.3 graph DTO shape honestly: real (currently near-empty) node data from `knowledge_entities`, edges always `[]` with a TODO, since edge topology lives in Apache AGE and nothing writes to AGE yet.
  - `audio.py` — `POST /api/v1/courses/{course_id}/audio-transcriptions`: multipart audio → `services/elevenlabs.py` → transcript text back to the caller (design-doc.md §10.4 "voice input" — the typed/transcribed text must stay editable client-side, this endpoint's only job is producing it). `persist_as_document=true` (query param) additionally saves the transcript as a `documents` row so it can flow through the same ingestion status pipeline as an uploaded `.txt` — this is an interpretation beyond the literal spec, flagged in the code, not a spec requirement.
- `services/elevenlabs.py` — isolated ElevenLabs Speech-to-Text client (`httpx`, `xi-api-key` header). Default model id is `scribe_v2` (`Settings.elevenlabs_stt_model_id`), confirmed against live ElevenLabs docs — design-doc.md/older assumptions may say `scribe_v1`; that's stale, not a bug here. Missing `ELEVENLABS_API_KEY` → clean `503 TRANSCRIPTION_UNAVAILABLE`, never a crash.

## Deferred scope — don't build these unprompted

These are explicitly out of scope for the current implementation and marked with `TODO(design-doc.md §...)` comments in the code, not silently missing:

- The parse → chunk → embed → extract-entities → resolve → write-to-AGE pipeline (design-doc.md §8.5–8.9, `architecture-mental-model.md` §6). Documents intentionally sit at `status='UPLOADED'` forever with no worker to advance them.
- Rebuilding/pruning the graph when a document is deleted (design-doc.md §7.5, §11.2 "schedule rebuild") — the delete endpoint only removes the document row + file today.
- `study-sessions` / `study-steps` / `study-artifacts` / narration endpoints — these are "Person 2" ownership per design-doc.md §12 and are not implemented at all (including ElevenLabs **narration**, §10.3, which is text-to-speech and is a different feature from the transcription endpoint that does exist).
- Auth/user accounts — this is a local single-user MVP by design.

`.env` is gitignored (fixed this session — it previously wasn't, despite design-doc.md §16.1 requiring it). Never commit it; commit `.env.example` when adding a new setting.
