from __future__ import annotations

import uuid

import psycopg
from fastapi import APIRouter, Depends

from app.deps import get_db
from app.routers.courses import require_course
from app.schemas import GraphEdgeOut, GraphEvidenceOut, GraphNodeOut, GraphResponse
from graphite.graph_repository import fetch_course_graph

router = APIRouter(tags=["graph"])


@router.get("/courses/{course_id}/graph", response_model=GraphResponse)
def get_course_graph(
    course_id: uuid.UUID, db: psycopg.Connection = Depends(get_db)
) -> GraphResponse:
    """The design-doc.md §11.3 graph DTO, nodes and edges both real.

    Edges used to be hardcoded `[]` because relationship endpoints live
    canonically in Apache AGE (§7.2/§7.3) and the old asyncpg pool pinned
    `search_path = public`, so it could not run Cypher at all. Both halves now
    come from GraphRepository, which is the only module permitted to issue
    Cypher (§7.3 invariant 5) and which hydrates AGE topology with relational
    metadata and evidence by application UUID — never through AGE's internal
    graphid (invariant 4).
    """
    require_course(course_id, db)

    graph = fetch_course_graph(db, course_id)

    nodes = [
        GraphNodeOut(
            id=n["id"],
            name=n["name"],
            type=n["type"],
            description=n["description"],
            importance=n["importance"],
            confidence=n["confidence"],
            aliases=list(n["aliases"] or []),
            source_count=n["source_count"],
        )
        for n in graph["nodes"]
    ]

    edges = [
        GraphEdgeOut(
            id=e["id"],
            source=e["source"],
            target=e["target"],
            relation_type=e["relation_type"],
            confidence=e["confidence"],
            rationale=e["rationale"],
            evidence=[
                GraphEvidenceOut(
                    chunk_id=ev["chunk_id"],
                    document_id=ev["document_id"],
                    label=ev.get("label") or "",
                    excerpt=ev.get("excerpt") or "",
                )
                for ev in (e["evidence"] or [])
                if ev.get("document_id")
            ],
        )
        for e in graph["edges"]
        # An edge whose endpoints are missing from AGE would render as a
        # dangling line; reconcile() reports that condition separately.
        if e["source"] is not None and e["target"] is not None
    ]

    # No graph version has ever been published for a course with no processed
    # entities; None is the honest value rather than a fabricated timestamp.
    graph_version = None
    if nodes:
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT graph_version FROM graph_relationships
                WHERE course_id = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (course_id,),
            )
            row = cur.fetchone()
            graph_version = row[0] if row else None

    return GraphResponse(
        course_id=course_id,
        graph_version=graph_version,
        nodes=nodes,
        edges=edges,
    )
