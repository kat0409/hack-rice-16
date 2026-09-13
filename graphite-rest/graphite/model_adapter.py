"""The one adapter for the external model provider (design-doc.md §15.1).

§6.6 requires all model access to go through a single internal adapter, and
§15.1 requires that adapter to provide timeouts, bounded retry, model metadata
logging, and a fake deterministic implementation for tests. Business logic must
never import the provider SDK directly.

`FakeAdapter` exists so every caller — OCR today, extraction next — is testable
offline and in CI without a key or a network.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from functools import lru_cache

from graphite.config import settings

logger = logging.getLogger("graphite")

MAX_ATTEMPTS = 3


class ModelUnavailable(Exception):
    """Raised when the provider cannot complete a request.

    Maps to the MODEL_UNAVAILABLE error code (§11.6). Always retryable from the
    caller's perspective: prior pipeline stages are preserved (§15.5).
    """


@dataclass
class ModelResult:
    text: str
    model: str
    latency_ms: int
    # Provider/model/latency only — never secrets or raw provider payloads (§7.2).
    metadata: dict = field(default_factory=dict)


@dataclass
class Image:
    data: bytes
    mime_type: str = "image/png"


class GeminiAdapter:
    """Thin wrapper over google-genai."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or settings.gemini_api_key
        self._model = model or settings.gemini_model
        if not self.api_key:
            raise ModelUnavailable(
                "GEMINI_API_KEY is not set. Add it to .env "
                "(https://aistudio.google.com/apikey)."
            )
        from google import genai

        self._client = genai.Client(api_key=self.api_key)

    @property
    def model(self) -> str:
        """The configured model, or the best one this key actually serves.

        Discovering beats hardcoding: model ids change, and a stale literal
        fails at request time with an opaque 404. The resolved id is recorded
        in job/artifact metadata for reproducibility (§15.4).
        """
        if not self._model:
            self._model = self._discover_model()
            logger.info("No GEMINI_MODEL configured; using %s", self._model)
        return self._model

    def _discover_model(self) -> str:
        try:
            available = [
                m.name
                for m in self._client.models.list()
                if "generateContent" in (getattr(m, "supported_actions", None) or [])
            ]
        except Exception as exc:
            raise ModelUnavailable(f"Could not list Gemini models: {exc}") from exc

        if not available:
            raise ModelUnavailable(
                "This API key serves no models supporting generateContent."
            )
        # Prefer a flash-tier model: OCR is one call per page, so throughput and
        # cost matter more than peak reasoning for a transcription task.
        for preference in ("flash-lite", "flash", "pro"):
            for name in available:
                if preference in name:
                    return name
        return available[0]

    def generate(
        self,
        parts: list[str | Image],
        *,
        system: str | None = None,
        json_schema: type | None = None,
    ) -> ModelResult:
        from google.genai import types

        contents = [
            types.Part.from_bytes(data=p.data, mime_type=p.mime_type)
            if isinstance(p, Image)
            else p
            for p in parts
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json" if json_schema else None,
            response_schema=json_schema,
        )

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            started = time.monotonic()
            try:
                response = self._client.models.generate_content(
                    model=self.model, contents=contents, config=config
                )
                latency_ms = int((time.monotonic() - started) * 1000)
                return ModelResult(
                    text=response.text or "",
                    model=self.model,
                    latency_ms=latency_ms,
                    metadata={"provider": "gemini", "attempts": attempt},
                )
            except Exception as exc:
                last_error = exc
                if attempt == MAX_ATTEMPTS:
                    break
                # Exponential backoff with jitter, so a rate limit during a
                # multi-page OCR run does not retry in lockstep (§15.1).
                delay = (2 ** (attempt - 1)) + random.uniform(0, 0.5)
                logger.warning(
                    "Gemini attempt %d/%d failed (%s); retrying in %.1fs",
                    attempt, MAX_ATTEMPTS, exc, delay,
                )
                time.sleep(delay)

        raise ModelUnavailable(f"Gemini request failed: {last_error}") from last_error


class FakeAdapter:
    """Deterministic stand-in for tests (§15.1, §12.3 "fake model adapter").

    Returns canned responses so the whole pipeline runs offline. Records every
    call so tests can assert what was actually sent.
    """

    def __init__(self, responses: list[str] | None = None, model: str = "fake-model"):
        self.responses = list(responses or [])
        self.model = model
        self.calls: list[dict] = []

    def generate(
        self,
        parts: list[str | Image],
        *,
        system: str | None = None,
        json_schema: type | None = None,
    ) -> ModelResult:
        self.calls.append(
            {
                "system": system,
                "text_parts": [p for p in parts if isinstance(p, str)],
                "image_count": sum(1 for p in parts if isinstance(p, Image)),
                "json_schema": json_schema,
            }
        )
        text = self.responses.pop(0) if self.responses else ""
        return ModelResult(
            text=text, model=self.model, latency_ms=0, metadata={"provider": "fake"}
        )


@lru_cache(maxsize=1)
def get_adapter() -> GeminiAdapter:
    return GeminiAdapter()
