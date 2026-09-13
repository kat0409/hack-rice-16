"""Pydantic request/response models.

Field names follow design-doc.md's snake_case DTOs (§11.3-11.6), which is the
authoritative contract for this Python backend — the frontend's camelCase
TypeScript types (e.g. `sourceCount`) are a separate serialization concern for
the frontend to adapt to, not something this backend contorts itself to match.
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class CourseOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class CourseListOut(BaseModel):
    items: list[CourseOut]
    next_cursor: str | None = None


class DocumentOut(BaseModel):
    """Never includes `local_path` — design-doc.md §11.1: "Never return local
    filesystem paths."""

    id: uuid.UUID
    course_id: uuid.UUID
    filename: str
    mime_type: str
    sha256: str
    status: str
    error_code: str | None
    error_message: str | None
    page_count: int | None
    created_at: datetime.datetime


class DocumentListOut(BaseModel):
    items: list[DocumentOut]
    next_cursor: str | None = None


class JobOut(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    document_id: uuid.UUID | None
    job_type: str
    status: str
    stage: str | None
    attempts: int
    payload: dict[str, Any]
    error: dict[str, Any] | None
    created_at: datetime.datetime
    completed_at: datetime.datetime | None


class DocumentUploadResult(BaseModel):
    document: DocumentOut
    job: JobOut


class DocumentUploadResponse(BaseModel):
    uploaded: list[DocumentUploadResult]
    rejected: list[dict[str, Any]] = Field(default_factory=list)


class GraphNodeOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    description: str
    importance: float
    confidence: float
    aliases: list[str]
    source_count: int


class GraphEvidenceOut(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    label: str
    excerpt: str


class GraphEdgeOut(BaseModel):
    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID
    relation_type: str
    confidence: float
    rationale: str | None
    evidence: list[GraphEvidenceOut]


class GraphResponse(BaseModel):
    course_id: uuid.UUID
    graph_version: str | None
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class TranscriptionResponse(BaseModel):
    """§10.4 voice input: the backend's job is only to produce editable text —
    the frontend decides what happens with it next."""

    text: str
    language_code: str | None = None
    document_id: uuid.UUID | None = None


# --- Study sessions (design-doc.md §11.4-11.5) ---------------------------


class StudySessionCreate(BaseModel):
    goal_text: str
    available_minutes: int = Field(ge=1, le=24 * 60)
    weakness_text: str | None = None


class StudyStepOut(BaseModel):
    id: uuid.UUID | None = None
    position: int
    knowledge_entity_id: uuid.UUID
    entity_name: str
    entity_type: str
    allocated_minutes: int
    activity_type: str
    reason: str
    priority_score: float
    status: str = "TODO"
    citations: list[GraphEvidenceOut] = []


class StudyStepPatch(BaseModel):
    status: Literal["TODO", "ACTIVE", "COMPLETE", "SKIPPED"]


class StudySessionSummaryOut(BaseModel):
    id: uuid.UUID
    goal_text: str
    available_minutes: int
    created_at: datetime.datetime


class StudySessionListOut(BaseModel):
    items: list[StudySessionSummaryOut]


class ArtifactOut(BaseModel):
    id: uuid.UUID
    study_step_id: uuid.UUID
    artifact_type: str
    content: dict[str, Any]
    citations: list[GraphEvidenceOut] = []
    created_at: datetime.datetime


class ArtifactListOut(BaseModel):
    items: list[ArtifactOut]


class OmittedEntityOut(BaseModel):
    knowledge_entity_id: uuid.UUID
    name: str
    reason: str


class StudySessionOut(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    status: str
    goal_text: str
    available_minutes: int
    allocated_minutes: int
    explanation: str
    steps: list[StudyStepOut]
    omitted_entities: list[OmittedEntityOut] = []


class TutorTurnIn(BaseModel):
    role: Literal["user", "tutor"]
    text: str = Field(min_length=1, max_length=4000)


class TutorTurnCreate(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[TutorTurnIn] = Field(default_factory=list, max_length=12)


class TutorConceptOut(BaseModel):
    id: uuid.UUID
    name: str


class TutorTurnOut(BaseModel):
    answer_text: str
    citations: list[GraphEvidenceOut]
    concepts: list[TutorConceptOut]
    audio_id: str | None = None
    audio_error: str | None = None
