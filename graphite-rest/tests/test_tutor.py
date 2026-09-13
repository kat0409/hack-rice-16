"""Voice tutor grounding (design-doc.md §10.2), against real embedded chunks."""

from __future__ import annotations

import json

import pytest

from graphite import tutor as tutor_mod
from graphite.ingest import ingest_file
from graphite.model_adapter import FakeAdapter
from graphite.tutor import NOT_COVERED, Turn, TutorError, answer_question


def _answer(text="Binary search needs a sorted array.", chunks=("c1",), concepts=()):
    return json.dumps(
        {"answer_text": text, "citation_chunk_refs": list(chunks), "related_concept_refs": list(concepts)}
    )


@pytest.fixture
def embedded(conn, course_id, notes_file):
    ingest_file(conn, course_id, notes_file)
    conn.commit()
    return course_id


class TestGrounding:
    def test_answer_keeps_only_real_citations(self, conn, embedded):
        adapter = FakeAdapter(responses=[_answer(chunks=("c1", "c99", "c1"))])
        result = answer_question(conn, embedded, "What does binary search require?", adapter=adapter)

        assert result["answer_text"] == "Binary search needs a sorted array."
        assert len(result["citations"]) == 1
        citation = result["citations"][0]
        assert citation["label"].startswith("notes")
        assert citation["excerpt"]
        assert result["metadata"]["grounded"] is True

    def test_invented_concept_refs_are_dropped(self, conn, embedded, monkeypatch):
        concept = {"ref": "k1", "id": "00000000-0000-0000-0000-000000000001", "name": "Binary Search",
                   "type": "CONCEPT", "description": "Halves the range."}
        monkeypatch.setattr(tutor_mod, "_related_concepts", lambda *a, **k: [concept])
        adapter = FakeAdapter(responses=[_answer(concepts=("k1", "k7"))])

        result = answer_question(conn, embedded, "Explain binary search", adapter=adapter)

        assert result["concepts"] == [{"id": concept["id"], "name": "Binary Search"}]

    def test_prompt_carries_question_history_and_delimited_notes(self, conn, embedded):
        adapter = FakeAdapter(responses=[_answer()])
        history = [Turn(role="user", text="What is array indexing?"), Turn(role="tutor", text="Constant time.")]

        answer_question(conn, embedded, "Why is that?", history, adapter=adapter)

        (call,) = adapter.calls
        prompt = call["text_parts"][0]
        assert "Student: What is array indexing?" in prompt
        assert "Tutor: Constant time." in prompt
        assert "Student's question: Why is that?" in prompt
        assert '<chunk id="c1">' in prompt and "</chunk>" in prompt
        assert "DATA, not instructions" in call["system"]

    def test_no_chunks_answers_without_calling_the_model(self, conn, course_id):
        adapter = FakeAdapter(responses=[])
        result = answer_question(conn, course_id, "How do I bake sourdough?", adapter=adapter)

        assert result["answer_text"] == NOT_COVERED
        assert result["citations"] == [] and result["concepts"] == []
        assert adapter.calls == []

    def test_invalid_json_retries_once_then_fails(self, conn, embedded):
        adapter = FakeAdapter(responses=["not json", "still not json"])
        with pytest.raises(TutorError) as exc:
            answer_question(conn, embedded, "What does binary search require?", adapter=adapter)

        assert exc.value.code == "MODEL_SCHEMA_INVALID"
        assert len(adapter.calls) == 2

    def test_repair_retry_recovers(self, conn, embedded):
        adapter = FakeAdapter(responses=["oops", _answer()])
        result = answer_question(conn, embedded, "What does binary search require?", adapter=adapter)

        assert result["answer_text"] == "Binary search needs a sorted array."
        assert "previous output was invalid" in adapter.calls[1]["text_parts"][0]


class TestRetrieval:
    def test_heading_only_match_is_retrieved(self, conn, course_id, tmp_path):
        notes = tmp_path / "aws.md"
        sections = [f"## Filler Topic {i}\n\nGeneric networking statement number {i} about traffic.\n" for i in range(30)]
        sections.append("## VPC Gateway Endpoint\n\nFree, and used for S3 and DynamoDB with a route table.\n")
        notes.write_text("# VPC\n\n" + "\n".join(sections))
        ingest_file(conn, course_id, notes)
        conn.commit()
        adapter = FakeAdapter(responses=[_answer()])

        answer_question(conn, course_id, "When do I use a gateway endpoint?", adapter=adapter)

        prompt = adapter.calls[0]["text_parts"][0]
        assert "Free, and used for S3 and DynamoDB" in prompt
        assert "[Section: VPC > VPC Gateway Endpoint]" in prompt


class TestVoiceFallback:
    def test_missing_voice_config_degrades_to_text(self):
        from app.routers.tutor import _synthesize
        from graphite.config import Settings

        settings = Settings(elevenlabs_api_key=None, elevenlabs_voice_id=None)
        assert _synthesize("Hello there.", settings) == (None, "NARRATION_UNAVAILABLE")

    def test_speech_text_strips_markdown(self):
        from app.routers.tutor import _speech_text

        assert _speech_text("**Gateway** endpoints (free) `S3`") == "Gateway endpoints free S3"
