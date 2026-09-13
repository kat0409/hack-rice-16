"""Chunking tests (design-doc.md §18.1).

The rule these protect is §8.4's "never combine unrelated pages solely to hit a
target size". A chunk is the evidence unit for every entity and relationship the
LLM extracts, so a chunk spanning two unrelated sections makes its own citations
wrong — the failure is silent and only shows up as nonsense evidence in the UI.
"""

from __future__ import annotations

from graphite.chunk import chunk_blocks, estimate_tokens
from graphite.config import settings
from graphite.parse import Block


def _long(tokens: int, word: str = "recursion") -> str:
    """Text of roughly `tokens` estimated tokens (the estimator is chars/4)."""
    return " ".join([word] * ((tokens * 4) // (len(word) + 1) + 1))


class TestSectionBoundaries:
    def test_never_merges_across_sections(self):
        blocks = [
            Block(text="alpha", section_path="L > A"),
            Block(text="beta", section_path="L > B"),
        ]
        chunks = chunk_blocks(blocks)
        assert len(chunks) == 2
        assert {c.section_path for c in chunks} == {"L > A", "L > B"}

    def test_merges_small_blocks_within_one_section(self):
        blocks = [Block(text=f"sentence {i}", section_path="L > A") for i in range(3)]
        chunks = chunk_blocks(blocks)
        assert len(chunks) == 1
        assert "sentence 0" in chunks[0].text and "sentence 2" in chunks[0].text


class TestOversizedSplitting:
    def test_splits_a_block_that_exceeds_the_cap(self):
        text = ". ".join(_long(200) for _ in range(10))
        chunks = chunk_blocks([Block(text=text, section_path="S")])

        assert len(chunks) > 1
        assert all(c.token_count <= settings.chunk_max_tokens for c in chunks)

    def test_split_chunks_keep_their_section_and_page(self):
        text = ". ".join(_long(200) for _ in range(8))
        chunks = chunk_blocks([Block(text=text, page=7, section_path="S")])

        assert len(chunks) > 1
        assert all(c.section_path == "S" for c in chunks)
        assert all(c.page_start == 7 and c.page_end == 7 for c in chunks)

    def test_consecutive_split_chunks_overlap(self):
        # Distinct sentences so overlap is detectable rather than coincidental.
        sentences = [f"Sentence number {i} about {_long(120)}." for i in range(12)]
        chunks = chunk_blocks([Block(text=" ".join(sentences), section_path="S")])

        assert len(chunks) > 1
        tail = chunks[0].text.split(".")[-2].strip()
        assert tail and tail in chunks[1].text


class TestPageSpans:
    def test_never_merges_across_pages(self):
        # A PDF has no headings, so section_path is None everywhere. Pages must
        # still act as boundaries or the whole document collapses into one run
        # and every citation becomes a vague range (§8.4).
        blocks = [Block(text=f"p{i}", page=i, section_path=None) for i in (3, 4, 5)]
        chunks = chunk_blocks(blocks)

        assert len(chunks) == 3
        assert [c.page_start for c in chunks] == [3, 4, 5]

    def test_merges_within_a_single_page(self):
        blocks = [Block(text=f"para {i}", page=3, section_path=None) for i in range(3)]
        chunks = chunk_blocks(blocks)

        assert len(chunks) == 1
        assert (chunks[0].page_start, chunks[0].page_end) == (3, 3)

    def test_pages_are_none_for_sourceless_formats(self):
        chunks = chunk_blocks([Block(text="markdown has no pages")])
        assert chunks[0].page_start is None and chunks[0].page_end is None


class TestMetadata:
    def test_records_chunking_parameters_for_debuggability(self):
        # §8.4 requires the parameters be written into ingestion metadata.
        meta = chunk_blocks([Block(text="x")])[0].metadata
        assert meta["chunk_max_tokens"] == settings.chunk_max_tokens
        assert meta["token_estimator"] == "chars/4"


class TestEstimator:
    def test_is_never_zero(self):
        assert estimate_tokens("") >= 1

    def test_grows_with_length(self):
        assert estimate_tokens("a" * 400) > estimate_tokens("a" * 40)


def test_empty_input_produces_no_chunks():
    assert chunk_blocks([]) == []
