"""Local embeddings via fastembed (design-doc.md §8.5).

Runs entirely on this machine: ONNX, no torch, no API key, no network at
inference time. That keeps embeddings inside the local-first boundary of §8.11 —
chunk text is never sent anywhere to be vectorized.

The model is loaded lazily and once. First use downloads the ONNX weights
(~130 MB) into the fastembed cache; every later run is offline.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache

from graphite.config import settings


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=settings.embedding_model)


def embedding_version() -> str:
    """Identifies what produced a vector, so §8.5's re-embed skip is safe.

    Text hash alone is not a sufficient cache key: the same text embedded by a
    different model is a different vector, and mixing them silently corrupts
    similarity search.
    """
    return f"{settings.embedding_model}@{settings.embedding_dimensions}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch, preserving input order."""
    if not texts:
        return []

    vectors = [list(map(float, v)) for v in _model().embed(texts)]

    width = len(vectors[0])
    if width != settings.embedding_dimensions:
        raise RuntimeError(
            f"{settings.embedding_model} produced {width}-dim vectors but "
            f"EMBEDDING_DIMENSIONS is {settings.embedding_dimensions}. The database "
            f"columns are vector({settings.embedding_dimensions}) and cannot accept "
            f"these. Fix EMBEDDING_DIMENSIONS and run `make db-reset`."
        )
    return vectors
