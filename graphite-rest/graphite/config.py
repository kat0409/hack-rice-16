"""The single source of configuration for both the API and the engine.

Reads the environment variables in design-doc.md §16.1. Process environment
wins; a repo-root `.env` (copied from `.env.example`, gitignored per §16.1) is
the fallback so `uv run` behaves the same way `make db-up` does.

This lives in `graphite/` rather than `app/` deliberately: `app/` is the HTTP
surface and `graphite/` is the engine beneath it, so the dependency runs
app -> graphite. Putting shared settings in the web layer would make the
ingestion and planning code import FastAPI to read a database URL.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# graphite-rest/graphite/config.py -> graphite-rest/graphite -> graphite-rest -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path("graphite-rest") / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://graphite:graphite@localhost:5432/graphite"

    # --- Extraction model -------------------------------------------------
    # Gemini is the single external model provider (design-doc.md §6.6: "The
    # model provider is accessed through one internal adapter").
    gemini_api_key: str | None = None
    # Pinned from what the account actually serves rather than hardcoded, and
    # recorded in job metadata for reproducibility (§15.4).
    gemini_model: str | None = None

    # --- Embeddings -------------------------------------------------------
    # Run locally via fastembed: no API key, no network at inference, so chunk
    # text never leaves the machine (§8.11).
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    # Must equal the vector(N) width the database was created with. The column
    # width is fixed at container init, so a mismatch is only recoverable with
    # `make db-reset`, never a migration (§17, "pgvector dimension mismatch").
    # graphite.db.verify_embedding_dimensions() checks this against the live
    # database rather than trusting it.
    embedding_dimensions: int = 384

    # --- Chunking ---------------------------------------------------------
    # §8.4 requires these to be configuration, and to be recorded in ingestion
    # metadata so a bad chunking run is debuggable after the fact.
    chunk_target_tokens: int = 700
    chunk_max_tokens: int = 1000
    chunk_overlap_tokens: int = 100

    # --- Voice ------------------------------------------------------------
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    # Not in the original .env.example list; the STT model id is small and
    # deployment-specific enough to be worth overriding without a code change.
    # "scribe_v2" is current; older docs saying "scribe_v1" are stale.
    elevenlabs_stt_model_id: str = "scribe_v2"

    # --- Uploads ----------------------------------------------------------
    upload_dir: str = "./data/uploads"
    # §8.2: "Set a conservative file-size limit in configuration." The doc gives
    # no number; 50MB comfortably covers lecture PDFs and is env-overridable.
    max_upload_mb: int = 50

    # --- Local exposure (§16.2) -------------------------------------------
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    @property
    def upload_dir_path(self) -> Path:
        """Anchor a relative UPLOAD_DIR to the repo, not the current directory.

        `.env` ships `UPLOAD_DIR=./data/uploads`. Left relative, uploaded files
        land wherever the process happened to start, so `documents.local_path`
        would point at a file the API later cannot find.
        """
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (REPO_ROOT / path).resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level handle for engine code; `get_settings()` is the same instance.
settings = get_settings()
