"""Spoken Q&A over one subject's notes (design-doc.md §10.2 grounding rules).

A question is embedded locally, matched against every chunk in the course, and
answered only from those chunks. The model cites chunks by id; ids are mapped
back to real rows here, so an invented citation or concept id is dropped rather
than trusted. Answers are written to be read aloud.
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal

from pydantic import BaseModel, ValidationError

from graphite.artifacts import GROUNDING, _citation, _render
from graphite.embed import embed_texts
from graphite.graph_repository import hydrate
from graphite.model_adapter import ModelUnavailable, get_adapter
from graphite.planner import Goal, _terms, _vector_literal, select_targets

logger = logging.getLogger("graphite")

PROMPT_VERSION = "tutor-v1"
NEAREST_CHUNKS = 12
CANDIDATE_CHUNKS = 40
MAX_CONTEXT_CHARS = 12000
MAX_HISTORY_TURNS = 6
RELATED_CONCEPTS = 5

NOT_COVERED = (
    "Your notes for this subject don't cover that yet. Try asking about something "
    "in your uploaded sources, or add notes on this topic first."
)


class TutorError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class Turn(BaseModel):
    role: Literal["user", "tutor"]
    text: str


class TutorAnswer(BaseModel):
    answer_text: str
    citation_chunk_refs: list[str]
    related_concept_refs: list[str]


SYSTEM_PROMPT = f"""You are a voice study tutor answering a student's spoken \
question about their own notes. Source chunks are delimited as \
<chunk id="cN"> ... </chunk>; related concepts from their knowledge graph are \
listed with ids kN.
{GROUNDING}
- answer_text: answer the question directly in a friendly, conversational tone, \
as it will be read aloud by a text-to-speech voice. Plain sentences only: no \
markdown, headings, bullet points, code, or chunk ids. At most about 120 words.
- If the chunks only partly answer the question, answer that part and say what \
the notes don't cover.
- Use the conversation so far to resolve follow-ups like "why?" or "what about \
the other one?".
- citation_chunk_refs: every chunk id you drew from.
- related_concept_refs: the concept ids (kN) your answer is about, if any.
Return only JSON matching the schema."""


def _retrieve_chunks(conn, course_id: uuid.UUID, question: str, question_vector: str) -> list[dict]:
    """Hybrid retrieval: vector candidates plus heading/keyword matches, re-ranked.

    Markdown chunks are small and their section heading lives in section_path,
    not in the chunk text, so a chunk under "VPC Gateway Endpoint" may never say
    those words. Pure vector ranking misses it; matching question terms against
    the heading as well as the text recovers it.
    """
    terms = sorted(t for t in _terms(question) if len(t) >= 3)
    patterns = [f"%{t}%" for t in terms]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.text, c.document_id, c.page_start, d.filename, c.section_path,
                   c.embedding <=> %s::vector AS distance
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.course_id = %s AND c.embedding IS NOT NULL
            ORDER BY distance
            LIMIT %s
            """,
            (question_vector, course_id, CANDIDATE_CHUNKS),
        )
        rows = {r[0]: r for r in cur.fetchall()}
        if patterns:
            cur.execute(
                """
                SELECT c.id, c.text, c.document_id, c.page_start, d.filename, c.section_path,
                       c.embedding <=> %s::vector AS distance
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE d.course_id = %s AND c.embedding IS NOT NULL
                  AND coalesce(c.section_path, '') || ' ' || c.text ILIKE ANY(%s)
                ORDER BY distance
                LIMIT %s
                """,
                (question_vector, course_id, patterns, CANDIDATE_CHUNKS),
            )
            for r in cur.fetchall():
                rows.setdefault(r[0], r)

    def score(row) -> float:
        heading_terms = _terms(row[5] or "")
        text_terms = _terms(row[1])
        heading = len(set(terms) & heading_terms) / len(terms) if terms else 0.0
        body = len(set(terms) & text_terms) / len(terms) if terms else 0.0
        return (1 - float(row[6])) + 0.6 * heading + 0.2 * body

    ranked = sorted(rows.values(), key=score, reverse=True)[:NEAREST_CHUNKS]

    chunks: list[dict] = []
    total = 0
    for i, (chunk_id, text, document_id, page_start, filename, section_path, _) in enumerate(ranked, 1):
        if total + len(text) > MAX_CONTEXT_CHARS and chunks:
            break
        total += len(text)
        label = filename + (f", p. {page_start}" if page_start else "")
        chunks.append(
            {
                "id": chunk_id,
                "ref": f"c{i}",
                "text": text,
                "section": section_path or "",
                "document_id": document_id,
                "label": label,
            }
        )
    return chunks


def _render_with_sections(chunks: list[dict]) -> str:
    return _render(
        [{**c, "text": f"[Section: {c['section']}]\n{c['text']}" if c["section"] else c["text"]} for c in chunks]
    )


def _related_concepts(conn, course_id: uuid.UUID, question: str) -> list[dict]:
    scored = select_targets(
        conn, course_id, Goal(goal_text=question, available_minutes=1), limit=RELATED_CONCEPTS
    )
    ranked = sorted(scored, key=lambda eid: scored[eid], reverse=True)[:RELATED_CONCEPTS]
    if not ranked:
        return []
    by_id = {e["id"]: e for e in hydrate(conn, ranked)}
    concepts = []
    for i, entity_id in enumerate((eid for eid in ranked if eid in by_id), 1):
        entity = by_id[entity_id]
        concepts.append(
            {
                "ref": f"k{i}",
                "id": str(entity["id"]),
                "name": entity["name"],
                "type": entity["type"],
                "description": entity.get("description") or "",
            }
        )
    return concepts


def _user_prompt(question: str, history: list[Turn], chunks: list[dict], concepts: list[dict]) -> str:
    parts = []
    recent = history[-MAX_HISTORY_TURNS:]
    if recent:
        lines = "\n".join(f"{'Student' if t.role == 'user' else 'Tutor'}: {t.text}" for t in recent)
        parts.append(f"Conversation so far:\n{lines}")
    if concepts:
        lines = "\n".join(f"{c['ref']} | {c['name']} ({c['type']}): {c['description'][:160]}" for c in concepts)
        parts.append(f"Related concepts:\n{lines}")
    parts.append(f"Source chunks:\n{_render_with_sections(chunks)}")
    parts.append(f"Student's question: {question}")
    return "\n\n".join(parts)


def _call(adapter, user: str) -> tuple[TutorAnswer, str]:
    prompt = user
    last_error = ""
    for _ in range(2):
        try:
            result = adapter.generate([prompt], system=SYSTEM_PROMPT, json_schema=TutorAnswer)
        except ModelUnavailable as exc:
            raise TutorError("MODEL_UNAVAILABLE", str(exc)) from exc
        try:
            return TutorAnswer.model_validate_json(result.text), result.model
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)
            prompt = (
                f"{user}\n\nYour previous output was invalid for the schema: "
                f"{last_error[:800]}\nReturn only corrected JSON."
            )
    raise TutorError("MODEL_SCHEMA_INVALID", f"Model output did not match the schema: {last_error[:300]}")


def answer_question(
    conn,
    course_id: uuid.UUID,
    question: str,
    history: list[Turn] | None = None,
    *,
    adapter=None,
) -> dict:
    question = question.strip()
    question_vector = _vector_literal(embed_texts([question])[0])
    chunks = _retrieve_chunks(conn, course_id, question, question_vector)
    if not chunks:
        return {
            "answer_text": NOT_COVERED,
            "citations": [],
            "concepts": [],
            "metadata": {"prompt_version": PROMPT_VERSION, "model": None, "grounded": False},
        }

    concepts = _related_concepts(conn, course_id, question)
    adapter = adapter or get_adapter()
    answer, model = _call(adapter, _user_prompt(question, history or [], chunks, concepts))

    by_ref = {c["ref"]: c for c in chunks}
    citations, seen_chunks = [], set()
    for ref in answer.citation_chunk_refs:
        chunk = by_ref.get(ref.strip())
        if chunk and chunk["id"] not in seen_chunks:
            seen_chunks.add(chunk["id"])
            citations.append(_citation(chunk))

    concept_by_ref = {c["ref"]: c for c in concepts}
    related, seen_concepts = [], set()
    for ref in answer.related_concept_refs:
        concept = concept_by_ref.get(ref.strip())
        if concept and concept["id"] not in seen_concepts:
            seen_concepts.add(concept["id"])
            related.append({"id": concept["id"], "name": concept["name"]})

    return {
        "answer_text": answer.answer_text.strip(),
        "citations": citations,
        "concepts": related,
        "metadata": {"prompt_version": PROMPT_VERSION, "model": model, "grounded": True},
    }
