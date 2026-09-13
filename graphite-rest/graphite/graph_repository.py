"""The only module permitted to issue Cypher (design-doc.md §7.3, invariant 5).

Two stores, one truth. Relational tables own stable UUIDs, text, embeddings,
evidence and state; Apache AGE owns topology — which entity connects to which.
They are bridged by application-generated UUIDs, because Postgres cannot put a
foreign key on an AGE vertex property (architecture-mental-model.md §4).

That bridge is only safe if writes to both sides share one transaction, so none
of the write functions here commit. The caller owns the transaction boundary and
a failure on either side rolls back both (§7.3, invariant 6).

Cypher labels cannot be parameterized, so every label is looked up from a fixed
whitelist below and never interpolated from caller input. All *values* go through
bound parameters.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

# AGE vertex label per relational entity_type (§7.3).
ENTITY_LABELS = {
    "CONCEPT": "Concept",
    "SKILL": "Skill",
    "FORMULA": "Formula",
    "PROCEDURE": "Procedure",
    "PROCEDURE_STEP": "ProcedureStep",
    "EXAMPLE": "Example",
}

# The controlled vocabulary (§7.4). The model may never invent an edge label.
RELATION_TYPES = frozenset(
    {
        "REQUIRES",
        "PART_OF",
        "EXAMPLE_OF",
        "CONTRASTS_WITH",
        "APPLIED_IN",
        "DERIVED_FROM",
        "RELATED_TO",
        "HAS_STEP",
        "NEXT",
        "PRODUCES",
    }
)

# Edges that force ordering in a study route (§7.4). RELATED_TO and friends
# affect relevance only and must never create precedence.
HARD_PRECEDENCE = frozenset({"REQUIRES", "DERIVED_FROM", "NEXT"})

# Edges walked outward from a goal to discover what must be learned first (§9.3).
PREREQUISITE_EDGES = ("REQUIRES", "DERIVED_FROM")


class GraphError(Exception):
    pass


@dataclass
class SubgraphResult:
    entity_ids: list[uuid.UUID] = field(default_factory=list)
    relationship_ids: list[uuid.UUID] = field(default_factory=list)


def parse_agtype(value):
    """AGE returns agtype, which is JSON with a ``::vertex``/``::edge`` suffix."""
    if value is None:
        return None
    if isinstance(value, (dict, list, int, float)):
        return value
    text = str(value)
    for suffix in ("::vertex", "::edge", "::path"):
        if text.endswith(suffix):
            text = text[: -len(suffix)]
            break
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _cypher(cur, query: str, params: dict | None = None, columns: str = "result agtype"):
    """Run Cypher.

    The third argument to cypher() must be a genuine bound parameter — AGE
    rejects a literal there with "third argument of cypher function must be a
    parameter", which is why params are always passed via %s.
    """
    cur.execute(
        f"SELECT * FROM cypher('graphite', $${query}$$, %s) AS ({columns})",
        (json.dumps(params or {}),),
    )
    return cur.fetchall()


# --------------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------------


def create_entity(
    conn,
    course_id: uuid.UUID,
    canonical_name: str,
    entity_type: str,
    description: str,
    *,
    normalized_name: str | None = None,
    aliases: list[str] | None = None,
    importance: float = 0.5,
    confidence: float = 0.5,
    identity_scope_id: uuid.UUID | None = None,
    embedding: list[float] | None = None,
) -> uuid.UUID:
    """Write the registry row and the AGE vertex under one pre-generated UUID."""
    if entity_type not in ENTITY_LABELS:
        raise GraphError(f"Unknown entity_type {entity_type!r}")

    entity_id = uuid.uuid4()  # invariant 1: generate before writing either store
    label = ENTITY_LABELS[entity_type]
    vector = "[" + ",".join(repr(v) for v in embedding) + "]" if embedding else None

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO knowledge_entities
                (id, course_id, canonical_name, normalized_name, identity_scope_id,
                 description, entity_type, importance, confidence, aliases, embedding)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)
            """,
            (
                entity_id,
                course_id,
                canonical_name,
                normalized_name or normalize_name(canonical_name),
                identity_scope_id,
                description,
                entity_type,
                importance,
                confidence,
                aliases or [],
                vector,
            ),
        )
        _cypher(
            cur,
            f"CREATE (v:{label} {{entity_id: $entity_id, course_id: $course_id, "
            f"name: $name}}) RETURN v",
            {
                "entity_id": str(entity_id),
                "course_id": str(course_id),
                "name": canonical_name,
            },
            columns="v agtype",
        )
    return entity_id


def create_relationship(
    conn,
    course_id: uuid.UUID,
    source_entity_id: uuid.UUID,
    target_entity_id: uuid.UUID,
    relation_type: str,
    *,
    confidence: float = 0.5,
    rationale: str | None = None,
    status: str = "ACTIVE",
    graph_version: str = "v1",
) -> uuid.UUID:
    """Write the registry row and the AGE edge under one pre-generated UUID.

    Endpoints are validated against knowledge_entities first: a Postgres foreign
    key cannot reach into AGE, so this check is the only thing standing between
    a typo and an edge pointing at a vertex that does not exist (§7.2).
    """
    if relation_type not in RELATION_TYPES:
        raise GraphError(f"{relation_type!r} is not in the controlled vocabulary")
    if source_entity_id == target_entity_id:
        raise GraphError("Self-loops are rejected by default (§8.9)")

    relationship_id = uuid.uuid4()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, entity_type FROM knowledge_entities
            WHERE id = ANY(%s) AND course_id = %s
            """,
            ([source_entity_id, target_entity_id], course_id),
        )
        found = {row[0]: row[1] for row in cur.fetchall()}
        missing = {source_entity_id, target_entity_id} - set(found)
        if missing:
            raise GraphError(
                f"Endpoints not in course {course_id}: "
                f"{', '.join(str(m) for m in missing)}"
            )

        # §8.9: HAS_STEP must point at an actual step, or procedures silently
        # acquire members that are not steps.
        if relation_type == "HAS_STEP" and found[target_entity_id] != "PROCEDURE_STEP":
            raise GraphError(
                f"HAS_STEP target must be PROCEDURE_STEP, got {found[target_entity_id]}"
            )

        cur.execute(
            """
            INSERT INTO graph_relationships
                (id, course_id, relation_type, confidence, rationale, status, graph_version)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                relationship_id,
                course_id,
                relation_type,
                confidence,
                rationale,
                status,
                graph_version,
            ),
        )
        rows = _cypher(
            cur,
            f"MATCH (s), (t) WHERE s.entity_id = $src AND t.entity_id = $tgt "
            f"CREATE (s)-[r:{relation_type} {{relationship_id: $rid, course_id: $cid, "
            f"status: $status, confidence: $confidence, graph_version: $gv}}]->(t) "
            f"RETURN r",
            {
                "src": str(source_entity_id),
                "tgt": str(target_entity_id),
                "rid": str(relationship_id),
                "cid": str(course_id),
                "status": status,
                "confidence": confidence,
                "gv": graph_version,
            },
            columns="r agtype",
        )
        if not rows:
            raise GraphError(
                "AGE vertices missing for one or both endpoints — the relational "
                "registry and the graph have drifted apart."
            )
    return relationship_id


def add_entity_evidence(
    conn, entity_id: uuid.UUID, chunk_id: uuid.UUID, excerpt: str, support_score: float
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO entity_evidence (entity_id, chunk_id, excerpt, support_score)
            VALUES (%s,%s,%s,%s)
            """,
            (entity_id, chunk_id, excerpt[:2000], support_score),
        )


def add_relationship_evidence(
    conn,
    relationship_id: uuid.UUID,
    chunk_id: uuid.UUID,
    excerpt: str,
    support_score: float,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO relationship_evidence
                (relationship_id, chunk_id, excerpt, support_score)
            VALUES (%s,%s,%s,%s)
            """,
            (relationship_id, chunk_id, excerpt[:2000], support_score),
        )


def extend_aliases(conn, entity_id: uuid.UUID, aliases: list[str]) -> None:
    if not aliases:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE knowledge_entities
               SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || %s::text[])),
                   updated_at = now()
             WHERE id = %s
            """,
            (aliases, entity_id),
        )


def normalize_name(name: str) -> str:
    """Normalization anchor for entity resolution (§8.7)."""
    return " ".join(name.lower().replace("-", " ").split())


def fetch_edge_keys(conn, course_id: uuid.UUID) -> dict[tuple[str, str, str], uuid.UUID]:
    """Every edge in a course as (source_id, target_id, type) -> relationship_id."""
    with conn.cursor() as cur:
        rows = _cypher(
            cur,
            "MATCH (a)-[r]->(b) WHERE r.course_id = $cid "
            "RETURN a.entity_id, b.entity_id, type(r), r.relationship_id",
            {"cid": str(course_id)},
            columns="src agtype, tgt agtype, rel agtype, rid agtype",
        )
    return {
        (parse_agtype(src), parse_agtype(tgt), parse_agtype(rel)): uuid.UUID(parse_agtype(rid))
        for src, tgt, rel, rid in rows
    }


# --------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------


def expand_prerequisite_subgraph(
    conn,
    course_id: uuid.UUID,
    seed_entity_ids: list[uuid.UUID],
    *,
    max_depth: int = 3,
    node_cap: int = 50,
) -> SubgraphResult:
    """Walk backward from goal targets to everything they depend on (§9.3).

    Direction matters and is easy to invert: ``A REQUIRES B`` means A needs B, so
    prerequisites are found by following REQUIRES *outward* from the seeds.
    Turning that into study order is a separate step the planner owns (§9.4).

    Suppressed and REVIEW edges are excluded here so unverified topology can
    never silently shape a route.
    """
    if not seed_entity_ids:
        return SubgraphResult()

    seeds = [str(s) for s in seed_entity_ids]
    reached: set[str] = set(seeds)

    with conn.cursor() as cur:
        # Breadth-first, one hop per round, rather than a variable-length pattern.
        # AGE 1.5.0 rejects both `-[:A|B*1..n]->` (alternation inside a
        # variable-length pattern) and `ALL(e IN r WHERE ...)`, which is how this
        # would normally be expressed in one query. Stepping manually also makes
        # the depth limit exact and the intermediate frontier inspectable.
        frontier = list(seeds)
        for _ in range(max_depth):
            if not frontier:
                break
            rows = _cypher(
                cur,
                "MATCH (s)-[r]->(p) "
                "WHERE s.entity_id IN $frontier AND s.course_id = $cid "
                "AND r.status = 'ACTIVE' "
                "RETURN type(r), p.entity_id",
                {"frontier": frontier, "cid": str(course_id)},
                columns="relation_type agtype, entity_id agtype",
            )
            discovered = {
                str(parse_agtype(entity_id))
                for relation_type, entity_id in rows
                if str(parse_agtype(relation_type)) in PREREQUISITE_EDGES
            }
            frontier = sorted(discovered - reached)
            reached.update(discovered)

        # A procedure is only useful whole: showing "Compare target" without the
        # surrounding steps is useless to a student (§9.3). Two passes are
        # required — the first finds the parent procedure of anything reached,
        # the second pulls in that procedure's *other* steps, which were not in
        # `reached` when the first query ran.
        rows = _cypher(
            cur,
            "MATCH (p:Procedure)-[h:HAS_STEP]->(s:ProcedureStep) "
            "WHERE p.course_id = $cid AND h.status = 'ACTIVE' "
            "AND (p.entity_id IN $reached OR s.entity_id IN $reached) "
            "RETURN DISTINCT p.entity_id",
            {"reached": sorted(reached), "cid": str(course_id)},
            columns="procedure_id agtype",
        )
        procedures = [str(parse_agtype(r[0])) for r in rows]

        if procedures:
            reached.update(procedures)
            rows = _cypher(
                cur,
                "MATCH (p:Procedure)-[h:HAS_STEP]->(s:ProcedureStep) "
                "WHERE p.entity_id IN $procedures AND h.status = 'ACTIVE' "
                "RETURN s.entity_id",
                {"procedures": procedures},
                columns="step_id agtype",
            )
            reached.update(str(parse_agtype(r[0])) for r in rows)

        entity_ids = _cap(conn, course_id, reached, node_cap)

        # Every ACTIVE edge whose endpoints both survived the cap.
        rows = _cypher(
            cur,
            "MATCH (a)-[r]->(b) "
            "WHERE a.entity_id IN $ids AND b.entity_id IN $ids "
            "AND r.status = 'ACTIVE' "
            "RETURN DISTINCT r.relationship_id",
            {"ids": [str(e) for e in entity_ids]},
            columns="relationship_id agtype",
        )
        relationship_ids = [uuid.UUID(str(parse_agtype(r[0]))) for r in rows]

    return SubgraphResult(entity_ids=entity_ids, relationship_ids=relationship_ids)


def _cap(conn, course_id: uuid.UUID, reached: set[str], node_cap: int) -> list[uuid.UUID]:
    """Trim to the most important entities, keeping the graph legible (§9.3)."""
    ids = [uuid.UUID(r) for r in reached if r]
    if len(ids) <= node_cap:
        return ids
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM knowledge_entities
            WHERE id = ANY(%s) AND course_id = %s
            ORDER BY importance DESC, confidence DESC
            LIMIT %s
            """,
            (ids, course_id, node_cap),
        )
        return [row[0] for row in cur.fetchall()]


def hydrate(conn, entity_ids: list[uuid.UUID]) -> list[dict]:
    """Attach relational metadata and citations by application UUID.

    Never joins through AGE's internal graphid (§7.3, invariant 4) — that value
    is storage detail and must not escape this module.
    """
    if not entity_ids:
        return []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.canonical_name, e.entity_type, e.description,
                   e.importance, e.confidence, e.aliases, e.identity_scope_id,
                   COALESCE(json_agg(
                       json_build_object('chunk_id', ev.chunk_id,
                                         'document_id', c.document_id,
                                         'label', d.filename
                                                  || COALESCE(', p. ' || c.page_start::text, ''),
                                         'excerpt', ev.excerpt,
                                         'support_score', ev.support_score)
                       ORDER BY ev.support_score DESC
                   ) FILTER (WHERE ev.entity_id IS NOT NULL), '[]') AS evidence
            FROM knowledge_entities e
            LEFT JOIN entity_evidence ev ON ev.entity_id = e.id
            LEFT JOIN chunks c ON c.id = ev.chunk_id
            LEFT JOIN documents d ON d.id = c.document_id
            WHERE e.id = ANY(%s)
            GROUP BY e.id
            ORDER BY e.importance DESC
            """,
            (entity_ids,),
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "type": r[2],
                "description": r[3],
                "importance": r[4],
                "confidence": r[5],
                "aliases": r[6],
                "identity_scope_id": r[7],
                "evidence": r[8],
                "source_count": len(r[8]),
            }
            for r in cur.fetchall()
        ]


def fetch_edges(conn, relationship_ids: list[uuid.UUID]) -> list[dict]:
    """Registry rows plus endpoints read from AGE, with evidence attached."""
    if not relationship_ids:
        return []

    with conn.cursor() as cur:
        rows = _cypher(
            cur,
            "MATCH (a)-[r]->(b) WHERE r.relationship_id IN $ids "
            "RETURN r.relationship_id, a.entity_id, b.entity_id",
            {"ids": [str(r) for r in relationship_ids]},
            columns="rid agtype, src agtype, tgt agtype",
        )
        endpoints = {
            str(parse_agtype(rid)): (str(parse_agtype(src)), str(parse_agtype(tgt)))
            for rid, src, tgt in rows
        }

        # Evidence carries document_id and a human-readable source label so the
        # UI can say "Lecture 4, p. 7" rather than echoing a UUID (§11.3).
        cur.execute(
            """
            SELECT gr.id, gr.relation_type, gr.confidence, gr.rationale, gr.status,
                   COALESCE(json_agg(
                       json_build_object(
                           'chunk_id', re.chunk_id,
                           'document_id', c.document_id,
                           'label', d.filename
                                    || COALESCE(', p. ' || c.page_start::text, ''),
                           'excerpt', re.excerpt)
                   ) FILTER (WHERE re.relationship_id IS NOT NULL), '[]')
            FROM graph_relationships gr
            LEFT JOIN relationship_evidence re ON re.relationship_id = gr.id
            LEFT JOIN chunks c ON c.id = re.chunk_id
            LEFT JOIN documents d ON d.id = c.document_id
            WHERE gr.id = ANY(%s)
            GROUP BY gr.id
            """,
            (relationship_ids,),
        )
        edges = []
        for rid, relation_type, confidence, rationale, status, evidence in cur.fetchall():
            source, target = endpoints.get(str(rid), (None, None))
            edges.append(
                {
                    "id": rid,
                    "source": uuid.UUID(source) if source else None,
                    "target": uuid.UUID(target) if target else None,
                    "relation_type": relation_type,
                    "confidence": confidence,
                    "rationale": rationale,
                    "status": status,
                    "evidence": evidence,
                }
            )
    return edges


def fetch_course_graph(conn, course_id: uuid.UUID) -> dict:
    """The whole course graph as the §11.3 DTO."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM knowledge_entities WHERE course_id = %s", (course_id,)
        )
        entity_ids = [r[0] for r in cur.fetchall()]
        cur.execute(
            "SELECT id FROM graph_relationships WHERE course_id = %s AND status = 'ACTIVE'",
            (course_id,),
        )
        relationship_ids = [r[0] for r in cur.fetchall()]

    return {
        "course_id": course_id,
        "nodes": hydrate(conn, entity_ids),
        "edges": fetch_edges(conn, relationship_ids),
    }


# --------------------------------------------------------------------------
# Reconciliation (§8.9)
# --------------------------------------------------------------------------


def reconcile(conn, course_id: uuid.UUID) -> list[str]:
    """Report every disagreement between the registries and AGE.

    Postgres cannot enforce the UUID bridge with a constraint, so drift is
    possible in principle and invisible in practice — a missing vertex just
    makes an entity quietly untraversable. An empty list means consistent.
    """
    problems: list[str] = []

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, entity_type FROM knowledge_entities WHERE course_id = %s",
            (course_id,),
        )
        registry_entities = {str(r[0]): r[1] for r in cur.fetchall()}

        rows = _cypher(
            cur,
            "MATCH (v) WHERE v.course_id = $cid RETURN v.entity_id",
            {"cid": str(course_id)},
            columns="entity_id agtype",
        )
        graph_entities = {str(parse_agtype(r[0])) for r in rows}

        for orphan in registry_entities.keys() - graph_entities:
            problems.append(f"entity {orphan} has a registry row but no AGE vertex")
        for orphan in graph_entities - registry_entities.keys():
            problems.append(f"entity {orphan} has an AGE vertex but no registry row")

        cur.execute(
            "SELECT id, status, confidence FROM graph_relationships WHERE course_id = %s",
            (course_id,),
        )
        registry_edges = {str(r[0]): (r[1], r[2]) for r in cur.fetchall()}

        rows = _cypher(
            cur,
            "MATCH ()-[r]->() WHERE r.course_id = $cid "
            "RETURN r.relationship_id, r.status, r.confidence",
            {"cid": str(course_id)},
            columns="rid agtype, status agtype, confidence agtype",
        )
        graph_edges = {
            str(parse_agtype(rid)): (parse_agtype(status), parse_agtype(conf))
            for rid, status, conf in rows
        }

        for orphan in registry_edges.keys() - graph_edges.keys():
            problems.append(f"relationship {orphan} has a registry row but no AGE edge")
        for orphan in graph_edges.keys() - registry_edges.keys():
            problems.append(f"relationship {orphan} has an AGE edge but no registry row")

        # The AGE copies are query projections; the registry is canonical (§7.1).
        for rid in registry_edges.keys() & graph_edges.keys():
            reg_status, reg_conf = registry_edges[rid]
            age_status, age_conf = graph_edges[rid]
            if reg_status != age_status:
                problems.append(
                    f"relationship {rid} status drift: registry={reg_status} age={age_status}"
                )
            if abs(float(reg_conf) - float(age_conf)) > 1e-6:
                problems.append(
                    f"relationship {rid} confidence drift: registry={reg_conf} age={age_conf}"
                )

    return problems
