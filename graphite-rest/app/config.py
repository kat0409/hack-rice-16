"""Application configuration.

Reads the environment variables documented in design-doc.md §16.1 ("Expected
environment variables"). Values come from the process environment first;
a `.env` file at the repo root (copied from `.env.example`, gitignored per
§16.1 "Commit `.env.example`, never `.env`") is loaded as a fallback so
`uv run` works the same way `make db-up` does from the repo root.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# graphite-rest/app/config.py -> graphite-rest/app -> graphite-rest -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", Path("graphite-rest") / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://graphite:graphite@localhost:5432/graphite"

    model_api_key: str | None = None
    model_chat_model: str | None = None
    model_embedding_model: str | None = None
    embedding_dimensions: int = 1536

    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    # Not in the original .env.example list; STT model id is small and
    # deployment-specific enough to be worth overriding without a code change.
    # Defaults to "scribe_v2" (ElevenLabs' current recommended STT model as of
    # this writing) rather than the older "scribe_v1" — see the transcription
    # service module for the source of that assumption.
    elevenlabs_stt_model_id: str = "scribe_v2"

    upload_dir: str = "./data/uploads"
    # design-doc.md §8.2: "Set a conservative file-size limit in configuration."
    # No specific number is given in the doc; 50MB is a reasonable default for
    # lecture-note PDFs/DOCX/MD/TXT and is overridable via env.
    max_upload_mb: int = 50

    # design-doc.md §16.2: "Bind to 127.0.0.1 by default." / "Permit CORS only
    # from the configured local frontend origin."
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
        path = Path(self.upload_dir)
        if not path.is_absolute():
            path = _REPO_ROOT / path
        return path

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
