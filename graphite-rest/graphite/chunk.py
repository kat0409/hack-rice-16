"""Group parsed blocks into embeddable chunks (design-doc.md §8.4).

Semantic boundaries come first, token targets second. §8.4 is explicit: "never
combine unrelated pages solely to hit a target size" — so blocks only merge when
they share a section, and the resulting chunk records the page span it covers.

Chunks are the evidence unit for the whole product: every entity and relationship
the LLM extracts must cite one, so a chunk that spans unrelated material makes
its citations useless.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from graphite.config import settings
from graphite.parse import Block


@dataclass
class Chunk:
    text: str
    token_count: int
    page_start: int | None = None
    page_end: int | None = None
    section_path: str | None = None
    metadata: dict = field(default_factory=dict)


def estimate_tokens(text: str) -> int:
    """Deliberately approximate, and deliberately conservative.

    §8.3 permits an approximation when no provider tokenizer is available. ~4
    characters per token over-counts for English prose, which is the safe
    direction: it yields slightly smaller chunks rather than prompts that
    overflow the model's context.
    """
    return max(1, len(text) // 4)


def chunk_blocks(blocks: list[Block], *, used_ocr: bool = False) -> list[Chunk]:
    target = settings.chunk_target_tokens
    maximum = settings.chunk_max_tokens

    chunks: list[Chunk] = []
    pending: list[Block] = []

    def flush() -> None:
        if pending:
            chunks.extend(_emit(pending, maximum, used_ocr))
            pending.clear()

    for block in blocks:
        oversized = estimate_tokens(block.text) > maximum
        boundary = pending and not _same_section(pending[-1], block)

        # A section change or an oversized block both end the current run: the
        # first because merging across it would corrupt citations, the second
        # because it needs splitting on its own.
        if boundary or oversized:
            flush()

        if oversized:
            chunks.extend(_split_oversized(block, maximum, used_ocr=used_ocr))
            continue

        pending.append(block)
        if sum(estimate_tokens(b.text) for b in pending) >= target:
            flush()

    flush()
    return chunks


def _same_section(a: Block, b: Block) -> bool:
    """Both a section change and a page change end a chunk.

    The page check is not redundant. A PDF has no headings, so section_path is
    None on every block — without comparing pages, every page in the document
    would merge into one run, which is exactly the "combine unrelated pages
    solely to hit a target size" that §8.4 prohibits. It also keeps citations
    precise: a chunk that spans pages can only ever be cited as a range.
    """
    return a.section_path == b.section_path and a.page == b.page


def _emit(blocks: list[Block], maximum: int, used_ocr: bool = False) -> list[Chunk]:
    text = "\n\n".join(b.text for b in blocks)
    tokens = estimate_tokens(text)
    if tokens > maximum:
        # Individually small blocks can still exceed the cap once joined.
        merged = Block(
            text=text, page=blocks[0].page, section_path=blocks[0].section_path
        )
        return _split_oversized(
            merged, maximum, pages=_page_span(blocks), used_ocr=used_ocr
        )
    start, end = _page_span(blocks)
    return [
        Chunk(
            text=text,
            token_count=tokens,
            page_start=start,
            page_end=end,
            section_path=blocks[0].section_path,
            metadata=_provenance(used_ocr),
        )
    ]


def _page_span(blocks: list[Block]) -> tuple[int | None, int | None]:
    pages = [b.page for b in blocks if b.page is not None]
    return (min(pages), max(pages)) if pages else (None, None)


def _split_oversized(
    block: Block,
    maximum: int,
    pages: tuple[int | None, int | None] | None = None,
    used_ocr: bool = False,
) -> list[Chunk]:
    """Split one block on sentence boundaries, with overlap.

    Overlap is only applied here — within a single semantic block — per §8.4's
    "overlap only when splitting the same semantic block".
    """
    start, end = pages if pages else (block.page, block.page)
    sentences = _split_sentences(block.text)
    overlap = settings.chunk_overlap_tokens

    chunks: list[Chunk] = []
    current: list[str] = []

    for sentence in sentences:
        candidate = current + [sentence]
        if current and estimate_tokens(" ".join(candidate)) > maximum:
            chunks.append(_make(current, start, end, block.section_path, used_ocr))
            current = _tail(current, overlap) + [sentence]
        else:
            current = candidate

    if current:
        chunks.append(_make(current, start, end, block.section_path, used_ocr))
    return chunks


def _make(
    parts: list[str],
    start: int | None,
    end: int | None,
    section: str | None,
    used_ocr: bool = False,
) -> Chunk:
    text = " ".join(parts).strip()
    return Chunk(
        text=text,
        token_count=estimate_tokens(text),
        page_start=start,
        page_end=end,
        section_path=section,
        metadata=_provenance(used_ocr),
    )


def _tail(sentences: list[str], overlap_tokens: int) -> list[str]:
    """Trailing sentences worth roughly `overlap_tokens`, to carry context forward."""
    kept: list[str] = []
    total = 0
    for sentence in reversed(sentences):
        if total >= overlap_tokens:
            break
        kept.insert(0, sentence)
        total += estimate_tokens(sentence)
    return kept


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p for p in (s.strip() for s in parts) if p] or [text]


def _provenance(used_ocr: bool = False) -> dict:
    """§8.4: chunk parameters are written into metadata so a bad run is debuggable."""
    return {
        "chunk_target_tokens": settings.chunk_target_tokens,
        "chunk_max_tokens": settings.chunk_max_tokens,
        "chunk_overlap_tokens": settings.chunk_overlap_tokens,
        "token_estimator": "chars/4",
        "ocr": used_ocr,
    }
