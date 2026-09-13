from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends

from app.deps import get_db
from app.routers.courses import require_course
from app.schemas import GraphNodeOut, GraphResponse

router = APIRouter(tags=["graph"])


@router.get("/courses/{course_id}/graph", response_model=GraphResponse)
async def get_course_graph(
    course_id: uuid.UUID, db: asyncpg.Pool = Depends(get_db)
) -> GraphResponse:
    """design-doc.md §11.3 graph DTO. Real query against `knowledge_entities`
    for nodes (empty today since no worker has ever written to it — see
    architecture-mental-model.md §6). Edges are intentionally always `[]`:
    §7.2/§7.3 place relationship topology (source/target) canonically in
    Apache AGE, and the LLM entity-extraction -> AGE graph-write pipeline
    (design-doc.md §8.5-8.9, architecture-mental-model.md §6) is out of scope
    for this pass. TODO: once that pipeline exists, hydrate edges with a
    `cypher('graphite', ...)` traversal joined against `graph_relationships`
    (confidence/rationale/status) and `relationship_evidence`, exactly as
    architecture-mental-model.md §7 "Goal/read flow" describes."""
    await require_course(course_id, db)

    rows = await db.fetch(
        """
        SELECT
            e.id, e.canonical_name, e.entity_type, e.description,
            e.importance, e.confidence, e.aliases,
            COUNT(DISTINCT ev.chunk_id) AS source_count
        FROM knowledge_entities e
        LEFT JOIN entity_evidence ev ON ev.entity_id = e.id
        WHERE e.course_id = $1
        GROUP BY e.id
        ORDER BY e.importance DESC, e.canonical_name ASC
        """,
        course_id,
    )

    nodes = [
        GraphNodeOut(
            id=r["id"],
            name=r["canonical_name"],
            type=r["entity_type"],
            description=r["description"],
            importance=r["importance"],
            confidence=r["confidence"],
            aliases=list(r["aliases"] or []),
            source_count=r["source_count"],
        )
        for r in rows
    ]

    # No graph version has ever been published for a course with no processed
    # entities; `None` is the honest value rather than a fabricated timestamp.
    graph_version = None
    if nodes:
        graph_version = await db.fetchval(
            """
            SELECT graph_version FROM graph_relationships
            WHERE course_id = $1
            ORDER BY created_at DESC LIMIT 1
            """,
            course_id,
        )

    return GraphResponse(
        course_id=course_id,
        graph_version=graph_version,
        nodes=nodes,
        edges=[],
    )
