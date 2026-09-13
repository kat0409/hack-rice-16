from __future__ import annotations

import uuid

import psycopg
from fastapi import APIRouter, Depends, status

from app.deps import get_db
from app.errors import AppError
from app.routers.courses import _row, _rows, require_course
from app.schemas import (
    GraphEvidenceOut,
    OmittedEntityOut,
    StudySessionCreate,
    StudySessionListOut,
    StudySessionOut,
    StudySessionSummaryOut,
    StudyStepOut,
    StudyStepPatch,
)
from graphite.graph_repository import hydrate
from graphite.planner import Goal, build_plan, persist_plan

router = APIRouter(tags=["study-sessions"])


def _citations_from(evidence: list[dict] | None) -> list[GraphEvidenceOut]:
    """Only evidence that resolves to a real document is shown to the student."""
    return [
        GraphEvidenceOut(
            chunk_id=ev["chunk_id"],
            document_id=ev["document_id"],
            label=ev.get("label") or "",
            excerpt=ev.get("excerpt") or "",
        )
        for ev in (evidence or [])
        if ev.get("document_id")
    ]


def _citations(step) -> list[GraphEvidenceOut]:
    return _citations_from(step.evidence)


@router.post(
    "/courses/{course_id}/study-sessions",
    response_model=StudySessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_study_session(
    course_id: uuid.UUID,
    body: StudySessionCreate,
    db: psycopg.Connection = Depends(get_db),
) -> StudySessionOut:
    """Turn a goal into an ordered, time-boxed, cited route (§11.4 -> §11.5).

    The ordering is computed by deterministic graph traversal, not by asking a
    model for a plan (§0.2 principle 2). A model may later explain or enrich a
    route, but it cannot reorder one.
    """
    require_course(course_id, db)

    goal = Goal(
        goal_text=body.goal_text,
        available_minutes=body.available_minutes,
        weakness_text=body.weakness_text,
    )
    plan = build_plan(db, course_id, goal)

    if not plan.steps:
        # §20.5 NO_GOAL_MATCH: tell the student how to widen the goal rather
        # than returning an empty route with no explanation.
        raise AppError(
            code="NO_GOAL_MATCH",
            message=plan.explanation,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            retryable=False,
        )

    session_id = persist_plan(db, course_id, goal, plan)

    step_ids = {
        row["position"]: row["id"]
        for row in _rows(
            db,
            "SELECT id, position FROM study_steps WHERE session_id = %s",
            (session_id,),
        )
    }

    return StudySessionOut(
        id=session_id,
        course_id=course_id,
        status="READY",
        goal_text=goal.goal_text,
        available_minutes=goal.available_minutes,
        allocated_minutes=plan.allocated_minutes,
        explanation=plan.explanation,
        steps=[
            StudyStepOut(
                id=step_ids.get(s.position),
                position=s.position,
                knowledge_entity_id=s.entity_id,
                entity_name=s.name,
                entity_type=s.entity_type,
                allocated_minutes=s.allocated_minutes,
                activity_type=s.activity_type,
                reason=s.reason,
                priority_score=s.priority_score,
                citations=_citations(s),
            )
            for s in plan.steps
        ],
        omitted_entities=[
            OmittedEntityOut(
                knowledge_entity_id=o["knowledge_entity_id"],
                name=o["name"],
                reason=o["reason"],
            )
            for o in plan.omitted
        ],
    )


@router.get("/study-sessions/{session_id}", response_model=StudySessionOut)
def get_study_session(
    session_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> StudySessionOut:
    session = _row(
        db,
        """
        SELECT id, course_id, status, goal_text, available_minutes, explanation
        FROM study_sessions WHERE id = %s
        """,
        (session_id,),
    )
    if session is None:
        raise AppError(
            code="SESSION_NOT_FOUND",
            message=f"No study session with id {session_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    steps = _rows(
        db,
        """
        SELECT s.id, s.position, s.knowledge_entity_id, s.allocated_minutes,
               s.activity_type, s.reason, s.priority_score, s.status,
               e.canonical_name, e.entity_type
        FROM study_steps s
        JOIN knowledge_entities e ON e.id = s.knowledge_entity_id
        WHERE s.session_id = %s
        ORDER BY s.position
        """,
        (session_id,),
    )
    evidence_by_entity = {
        row["id"]: row["evidence"]
        for row in hydrate(db, [s["knowledge_entity_id"] for s in steps])
    }

    return StudySessionOut(
        id=session["id"],
        course_id=session["course_id"],
        status=session["status"],
        goal_text=session["goal_text"],
        available_minutes=session["available_minutes"],
        allocated_minutes=sum(s["allocated_minutes"] for s in steps),
        explanation=session["explanation"] or "",
        steps=[
            StudyStepOut(
                id=s["id"],
                position=s["position"],
                knowledge_entity_id=s["knowledge_entity_id"],
                entity_name=s["canonical_name"],
                entity_type=s["entity_type"],
                allocated_minutes=s["allocated_minutes"],
                activity_type=s["activity_type"],
                reason=s["reason"],
                priority_score=s["priority_score"],
                status=s["status"],
                citations=_citations_from(evidence_by_entity.get(s["knowledge_entity_id"])),
            )
            for s in steps
        ],
    )


@router.get("/courses/{course_id}/study-sessions", response_model=StudySessionListOut)
def list_study_sessions(
    course_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> StudySessionListOut:
    require_course(course_id, db)
    rows = _rows(
        db,
        """
        SELECT id, goal_text, available_minutes, created_at
        FROM study_sessions
        WHERE course_id = %s
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        """,
        (course_id,),
    )
    return StudySessionListOut(items=[StudySessionSummaryOut(**r) for r in rows])


@router.patch("/study-steps/{step_id}", response_model=StudyStepOut)
def patch_study_step(
    step_id: uuid.UUID, body: StudyStepPatch, db: psycopg.Connection = Depends(get_db)
) -> StudyStepOut:
    row = _row(
        db,
        """
        UPDATE study_steps s SET status = %s
        FROM knowledge_entities e
        WHERE s.id = %s AND e.id = s.knowledge_entity_id
        RETURNING s.id, s.position, s.knowledge_entity_id, s.allocated_minutes,
                  s.activity_type, s.reason, s.priority_score, s.status,
                  e.canonical_name, e.entity_type
        """,
        (body.status, step_id),
    )
    if row is None:
        raise AppError(
            code="STEP_NOT_FOUND",
            message=f"No study step with id {step_id}.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return StudyStepOut(
        id=row["id"],
        position=row["position"],
        knowledge_entity_id=row["knowledge_entity_id"],
        entity_name=row["canonical_name"],
        entity_type=row["entity_type"],
        allocated_minutes=row["allocated_minutes"],
        activity_type=row["activity_type"],
        reason=row["reason"],
        priority_score=row["priority_score"],
        status=row["status"],
    )
