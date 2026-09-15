from __future__ import annotations

import logging
import threading
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from graphite import db
from graphite.config import get_settings
from app.errors import register_exception_handlers
from app.routers import (
    artifacts,
    audio,
    courses,
    documents,
    graph,
    jobs,
    narration,
    study_sessions,
    tutor,
)
from app.services.local_voice import warm_up as warm_up_voice

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("graphite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.upload_dir_path.mkdir(parents=True, exist_ok=True)
    db.connect()
    if db.get_pool() is None:
        logger.warning(
            "Starting without a database connection — DB-backed routes will "
            "return 503 DB_UNAVAILABLE until Postgres is reachable "
            "(`make db-up` from the repo root)."
        )
    # Best-effort preload of the local voice models on a daemon thread so the
    # first real transcription/narration request doesn't pay for it. Never
    # blocks or fails startup — same "boot degraded, don't crash" rule as the
    # database connection above.
    threading.Thread(target=warm_up_voice, args=(settings,), daemon=True).start()
    yield
    db.disconnect()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="graphite API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        db_ok = db.is_healthy()
        return {
            "status": "ok" if db_ok else "degraded",
            "database": "up" if db_ok else "down",
        }

    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(courses.router)
    api_v1.include_router(documents.router)
    api_v1.include_router(jobs.router)
    api_v1.include_router(graph.router)
    api_v1.include_router(audio.router)
    api_v1.include_router(study_sessions.router)
    api_v1.include_router(artifacts.router)
    api_v1.include_router(narration.router)
    api_v1.include_router(tutor.router)
    app.include_router(api_v1)

    return app


app = create_app()
