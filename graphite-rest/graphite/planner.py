"""Turn a goal plus a graph into an ordered, time-boxed study route (§9).

Deterministic by design. §0.2 principle 2 — "graph before generation" — requires
the ordering to come from graph structure, not from asking a model to produce a
plan, so there is no LLM call anywhere in this module. A model may later explain
or enrich a route, but it cannot reorder one.

The pipeline, matching §9.4:

    goal -> targets -> subgraph -> planning DAG -> break cycles
         -> topological sort -> allocate time -> persist

The direction flip in build_planning_dag is the subtlest part and is called out
there: `A REQUIRES B` is a statement about meaning, and the study edge runs the
other way.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field

from graphite.embed import embed_texts
from graphite.graph_repository import (
    HARD_PRECEDENCE,
    expand_prerequisite_subgraph,
    fetch_edges,
    hydrate,
)

PLANNER_VERSION = "planner-v1"

# §9.6: a base duration per entity type, before weakness and dependency bonuses.
BASE_MINUTES = {
    "CONCEPT": 15,
    "SKILL": 20,
    "FORMULA": 10,
    "PROCEDURE": 20,
    "PROCEDURE_STEP": 8,
    "EXAMPLE": 8,
}
MIN_MINUTES = 5

# Edges whose semantic direction is the reverse of their study direction.
# `A REQUIRES B` means B must be studied first (§9.4).
REVERSED_IN_PLANNING = frozenset({"REQUIRES", "DERIVED_FROM"})
# NEXT already points the way the student should travel.
FORWARD_IN_PLANNING = frozenset({"NEXT"})

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "i",
    "am", "is", "are", "my", "me", "at", "it", "this", "that", "weak", "struggle",
    "struggling", "bad", "exam", "test", "tomorrow", "study", "studying", "help",
}


@dataclass
class Goal:
    goal_text: str
    available_minutes: int
    weakness_text: str | None = None

    @property
    def weakness_terms(self) -> set[str]:
        return _terms(self.weakness_text or "")


@dataclass
class PlanStep:
    entity_id: uuid.UUID
    name: str
    entity_type: str
    position: int
    allocated_minutes: int
    activity_type: str
    reason: str
    priority_score: float
    evidence: list = field(default_factory=list)


@dataclass
class Plan:
    steps: list[PlanStep]
    explanation: str
    omitted: list[dict] = field(default_factory=list)
    suppressed_edges: list[dict] = field(default_factory=list)
    subgraph_entity_ids: list[uuid.UUID] = field(default_factory=list)

    @property
    def allocated_minutes(self) -> int:
        return sum(s.allocated_minutes for s in self.steps)


def _terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOPWORDS}


# --------------------------------------------------------------------------
# 1. Target selection (§9.2)
# --------------------------------------------------------------------------


def select_targets(
    conn, course_id: uuid.UUID, goal: Goal, *, limit: int = 8
) -> dict[uuid.UUID, float]:
    """Score entities against the goal and return the best as seeds.

    §9.2 weights entity similarity, supporting-chunk similarity, lexical match,
    importance, and weakness. Where an entity has no embedding yet, its vector
    terms contribute zero and the lexical and importance terms carry the score
    rather than the entity dropping out entirely.
    """
    goal_vector = _vector_literal(embed_texts([goal.goal_text])[0])
    goal_terms = _terms(goal.goal_text)
    weakness_terms = goal.weakness_terms

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.canonical_name, e.aliases, e.importance,
                   CASE WHEN e.embedding IS NULL THEN NULL
                        ELSE 1 - (e.embedding <=> %s::vector) END,
                   (SELECT max(1 - (c.embedding <=> %s::vector))
                      FROM entity_evidence ev
                      JOIN chunks c ON c.id = ev.chunk_id
                     WHERE ev.entity_id = e.id AND c.embedding IS NOT NULL)
            FROM knowledge_entities e
            WHERE e.course_id = %s
            """,
            (goal_vector, goal_vector, course_id),
        )
        rows = cur.fetchall()

    scored: dict[uuid.UUID, float] = {}
    for entity_id, name, aliases, importance, entity_sim, chunk_sim in rows:
        labels = _terms(" ".join([name, *(aliases or [])]))
        lexical = len(goal_terms & labels) / len(labels) if labels else 0.0
        weakness = 1.0 if weakness_terms & labels else 0.0

        score = (
            0.40 * (entity_sim or 0.0)
            + 0.25 * (chunk_sim or 0.0)
            + 0.15 * lexical
            + 0.10 * (importance or 0.0)
            + 0.10 * weakness
        )
        scored[entity_id] = score

    ranked = sorted(scored.items(), key=lambda kv: kv[1], reverse=True)
    # §9.3: weakness-matched entities are kept even at slightly lower relevance.
    top = dict(ranked[:limit])
    for entity_id, score in ranked[limit:]:
        if score > 0 and _is_weakness_match(rows, entity_id, weakness_terms):
            top[entity_id] = score
    return top


def _is_weakness_match(rows, entity_id, weakness_terms) -> bool:
    if not weakness_terms:
        return False
    for row in rows:
        if row[0] == entity_id:
            return bool(weakness_terms & _terms(" ".join([row[1], *(row[2] or [])])))
    return False


def _vector_literal(values) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


# --------------------------------------------------------------------------
# 2. Planning DAG and cycles (§9.4)
# --------------------------------------------------------------------------


def build_planning_dag(edges: list[dict]) -> dict[uuid.UUID, set[uuid.UUID]]:
    """Convert semantic edges into "must be studied before" edges.

    Only hard-precedence relations produce ordering. PART_OF, RELATED_TO and the
    rest affect relevance and grouping but must never silently force an order
    (§7.4) — treating RELATED_TO as precedence would fabricate dependencies the
    sources never claimed.
    """
    successors: dict[uuid.UUID, set[uuid.UUID]] = {}
    for edge in edges:
        relation = edge["relation_type"]
        if relation not in HARD_PRECEDENCE or edge.get("status") != "ACTIVE":
            continue
        source, target = edge["source"], edge["target"]
        if source is None or target is None:
            continue

        if relation in REVERSED_IN_PLANNING:
            # A REQUIRES B  =>  study B, then A.
            first, then = target, source
        else:
            first, then = source, target
        successors.setdefault(first, set()).add(then)
    return successors


def find_cycles(successors: dict[uuid.UUID, set[uuid.UUID]]) -> list[list[uuid.UUID]]:
    """Tarjan's strongly connected components; any component >1 node is a cycle."""
    index: dict[uuid.UUID, int] = {}
    low: dict[uuid.UUID, int] = {}
    on_stack: set[uuid.UUID] = set()
    stack: list[uuid.UUID] = []
    components: list[list[uuid.UUID]] = []
    counter = 0

    nodes = set(successors) | {n for s in successors.values() for n in s}

    def strongconnect(root: uuid.UUID) -> None:
        nonlocal counter
        work = [(root, iter(sorted(successors.get(root, ()), key=str)))]
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)

        while work:
            node, children = work[-1]
            advanced = False
            for child in children:
                if child not in index:
                    index[child] = low[child] = counter
                    counter += 1
                    stack.append(child)
                    on_stack.add(child)
                    work.append((child, iter(sorted(successors.get(child, ()), key=str))))
                    advanced = True
                    break
                if child in on_stack:
                    low[node] = min(low[node], index[child])
            if advanced:
                continue

            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                if len(component) > 1:
                    components.append(component)

    for node in sorted(nodes, key=str):
        if node not in index:
            strongconnect(node)
    return components


def resolve_cycles(
    successors: dict[uuid.UUID, set[uuid.UUID]], edges: list[dict]
) -> list[dict]:
    """Suppress the lowest-confidence edge in each cycle, for this plan only.

    §9.4 step 3. The edge stays in the graph and remains inspectable — it is
    excluded from *ordering*, not deleted, and the suppression is reported in the
    plan explanation so the route never silently hides a contradiction (§17).
    """
    suppressed: list[dict] = []

    for _ in range(len(successors) + 1):
        cycles = find_cycles(successors)
        if not cycles:
            break

        for component in cycles:
            members = set(component)
            candidates = [
                e
                for e in edges
                if e["relation_type"] in HARD_PRECEDENCE
                and e["source"] in members
                and e["target"] in members
            ]
            if not candidates:
                # No registry edge explains it; break it arbitrarily but stably.
                node = sorted(members, key=str)[0]
                successors[node] = {s for s in successors.get(node, set())
                                    if s not in members}
                continue

            weakest = min(candidates, key=lambda e: (e["confidence"] or 0.0, str(e["id"])))
            if weakest["relation_type"] in REVERSED_IN_PLANNING:
                first, then = weakest["target"], weakest["source"]
            else:
                first, then = weakest["source"], weakest["target"]

            if first in successors:
                successors[first].discard(then)
            suppressed.append(
                {
                    "relationship_id": weakest["id"],
                    "relation_type": weakest["relation_type"],
                    "confidence": weakest["confidence"],
                    "reason": "lowest-confidence edge in a prerequisite cycle",
                }
            )
    return suppressed


# --------------------------------------------------------------------------
# 3. Ordering (§9.4-9.5)
# --------------------------------------------------------------------------


def priority_score(
    node: dict, relevance: float, weakness_hit: bool, downstream: int, max_downstream: int
) -> float:
    """§9.5: P = 0.30R + 0.25W + 0.20D + 0.15I + 0.10U."""
    return (
        0.30 * relevance
        + 0.25 * (1.0 if weakness_hit else 0.0)
        + 0.20 * (downstream / max_downstream if max_downstream else 0.0)
        + 0.15 * (node.get("importance") or 0.0)
        + 0.10 * (1.0 - (node.get("confidence") or 0.0))
    )


def _downstream_counts(successors, nodes) -> dict[uuid.UUID, int]:
    """How many entities transitively depend on each node."""
    counts = {}
    for node in nodes:
        seen: set[uuid.UUID] = set()
        stack = list(successors.get(node, ()))
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(successors.get(current, ()))
        counts[node] = len(seen)
    return counts


def topological_order(
    successors: dict[uuid.UUID, set[uuid.UUID]],
    nodes: list[uuid.UUID],
    priorities: dict[uuid.UUID, float],
    next_edges: dict[uuid.UUID, set[uuid.UUID]],
) -> list[uuid.UUID]:
    """Kahn's algorithm; among eligible nodes, highest priority wins.

    Topology decides what *may* come next, priority decides what *should* (§9.5).
    One override: if the previous step's NEXT successor is eligible, it is taken
    immediately, so a procedure's steps stay contiguous rather than being
    interleaved with unrelated material (§9.4).
    """
    node_set = set(nodes)
    indegree = {n: 0 for n in node_set}
    for source, targets in successors.items():
        if source not in node_set:
            continue
        for target in targets:
            if target in node_set:
                indegree[target] += 1

    eligible = {n for n, d in indegree.items() if d == 0}
    order: list[uuid.UUID] = []
    previous: uuid.UUID | None = None

    while eligible:
        follow_on = next_edges.get(previous, set()) & eligible if previous else set()
        pool = follow_on or eligible
        chosen = max(sorted(pool, key=str), key=lambda n: priorities.get(n, 0.0))

        eligible.discard(chosen)
        order.append(chosen)
        previous = chosen

        for target in sorted(successors.get(chosen, ()), key=str):
            if target in indegree:
                indegree[target] -= 1
                if indegree[target] == 0:
                    eligible.add(target)

    # Any node left has a cycle that survived resolution; append it so the
    # student still sees the material rather than it vanishing silently.
    order.extend(sorted(node_set - set(order), key=str))
    return order


# --------------------------------------------------------------------------
# 4. Time allocation (§9.6)
# --------------------------------------------------------------------------


def allocate_time(
    ordered: list[uuid.UUID],
    nodes: dict[uuid.UUID, dict],
    priorities: dict[uuid.UUID, float],
    weakness_hits: set[uuid.UUID],
    downstream: dict[uuid.UUID, int],
    budget: int,
    protected: set[uuid.UUID],
    successors: dict[uuid.UUID, set[uuid.UUID]],
) -> tuple[list[tuple[uuid.UUID, int, str]], list[dict]]:
    """Fit the route to the budget, reporting whatever did not fit.

    §9.6 forbids pretending the full scope fits. The invariant this function must
    never break is `sum(minutes) <= budget`; anything that cannot fit is returned
    as an omission with a reason instead.
    """
    minutes: dict[uuid.UUID, int] = {}
    activity: dict[uuid.UUID, str] = {}

    for entity_id in ordered:
        node = nodes[entity_id]
        base = BASE_MINUTES.get(node["type"], 12)
        if entity_id in weakness_hits:
            base += 5
        if downstream.get(entity_id, 0) >= 2:
            base += 3
        minutes[entity_id] = max(MIN_MINUTES, base)

        if entity_id in weakness_hits:
            activity[entity_id] = "REVIEW"
        elif node["type"] == "EXAMPLE":
            activity[entity_id] = "PRACTICE"
        else:
            activity[entity_id] = "LEARN"

    kept = list(ordered)
    omitted: list[dict] = []

    def total() -> int:
        return sum(minutes[n] for n in kept)

    # Step 1: downgrade LEARN -> REVIEW, but only for genuinely low-priority
    # steps. §9.6 offers this as a budget lever, yet applying it to everything
    # makes the label a lie: a student cannot "review" material they have never
    # seen. Restricting it to the bottom half keeps the activity type meaningful
    # and pushes the remaining savings onto dropping low-value topics instead.
    ranked = sorted(kept, key=lambda n: priorities.get(n, 0.0))
    downgradable = set(ranked[: len(ranked) // 2])
    for entity_id in ranked:
        if total() <= budget:
            break
        if (
            entity_id in downgradable
            and activity[entity_id] == "LEARN"
            and entity_id not in weakness_hits
        ):
            activity[entity_id] = "REVIEW"
            minutes[entity_id] = max(MIN_MINUTES, minutes[entity_id] // 2)

    def leaves(pool: list) -> list:
        """Nodes nothing else in the route still depends on.

        Only these can be dropped; removing a node something kept requires would
        leave the route teaching a prerequisite for material it no longer covers.
        """
        current = set(pool)
        return [n for n in pool if not (successors.get(n, set()) & current)]

    def drop(victim) -> None:
        kept.remove(victim)
        omitted.append(
            {
                "knowledge_entity_id": victim,
                "name": nodes[victim]["name"],
                "reason": "lower priority than the available time permits",
            }
        )

    def shrink() -> None:
        """Trim durations toward the floor, least valuable first."""
        for entity_id in sorted(kept, key=lambda n: priorities.get(n, 0.0)):
            if total() <= budget:
                return
            reducible = minutes[entity_id] - MIN_MINUTES
            if reducible > 0:
                minutes[entity_id] -= min(total() - budget, reducible)

    # Step 2: drop supporting material, examples first (§9.6).
    while total() > budget and len(kept) > 1:
        candidates = [n for n in leaves(kept) if n not in protected]
        if not candidates:
            break
        drop(
            min(
                candidates,
                key=lambda n: (nodes[n]["type"] != "EXAMPLE", priorities.get(n, 0.0)),
            )
        )

    # Step 3: shrink before sacrificing anything the student actually asked for.
    # Goal targets are usually leaves, so dropping by structure alone removes the
    # goal and keeps its prerequisites — useless. Several short steps that reach
    # the destination beat full-length steps that stop short of it.
    shrink()

    # Step 4: only now give up goal material, re-shrinking after each removal.
    while total() > budget and len(kept) > 1:
        candidates = leaves(kept)
        if not candidates:
            break
        drop(min(candidates, key=lambda n: priorities.get(n, 0.0)))
        shrink()

    # A budget below one step's floor still returns that step, clamped, so the
    # sum <= budget invariant holds without producing an empty route.
    if len(kept) == 1 and minutes[kept[0]] > budget:
        minutes[kept[0]] = max(1, budget)

    return [(n, minutes[n], activity[n]) for n in kept], omitted


# --------------------------------------------------------------------------
# 5. Orchestration
# --------------------------------------------------------------------------


def build_plan(conn, course_id: uuid.UUID, goal: Goal) -> Plan:
    targets = select_targets(conn, course_id, goal)
    if not targets:
        return Plan(
            steps=[],
            explanation=(
                "No course material matched this goal. Try naming a unit, chapter, "
                "or concept, or add the relevant sources."
            ),
        )

    subgraph = expand_prerequisite_subgraph(conn, course_id, list(targets))
    nodes = {n["id"]: n for n in hydrate(conn, subgraph.entity_ids)}
    edges = fetch_edges(conn, subgraph.relationship_ids)

    successors = build_planning_dag(edges)
    suppressed = resolve_cycles(successors, edges)

    next_edges = {
        e["source"]: {e["target"]}
        for e in edges
        if e["relation_type"] in FORWARD_IN_PLANNING and e["source"] and e["target"]
    }

    weakness_terms = goal.weakness_terms
    weakness_hits = {
        entity_id
        for entity_id, node in nodes.items()
        if weakness_terms & _terms(" ".join([node["name"], *(node["aliases"] or [])]))
    }

    downstream = _downstream_counts(successors, list(nodes))
    max_downstream = max(downstream.values(), default=0)
    priorities = {
        entity_id: priority_score(
            node,
            relevance=targets.get(entity_id, 0.35),
            weakness_hit=entity_id in weakness_hits,
            downstream=downstream.get(entity_id, 0),
            max_downstream=max_downstream,
        )
        for entity_id, node in nodes.items()
    }

    ordered = topological_order(successors, list(nodes), priorities, next_edges)

    # Protect only what genuinely matches the goal, not everything select_targets
    # returned. On a small course that function may return every entity, and
    # protecting all of them protects none of them.
    best_score = max(targets.values(), default=0.0)
    protected = {
        entity_id
        for entity_id, score in targets.items()
        if best_score > 0 and score >= 0.6 * best_score
    } | weakness_hits

    allocated, omitted = allocate_time(
        ordered, nodes, priorities, weakness_hits, downstream,
        goal.available_minutes, protected, successors,
    )

    steps = [
        PlanStep(
            entity_id=entity_id,
            name=nodes[entity_id]["name"],
            entity_type=nodes[entity_id]["type"],
            position=position,
            allocated_minutes=minutes,
            activity_type=activity,
            reason=_reason(entity_id, nodes, successors, weakness_hits, targets),
            priority_score=round(priorities.get(entity_id, 0.0), 4),
            evidence=nodes[entity_id]["evidence"],
        )
        for position, (entity_id, minutes, activity) in enumerate(allocated, start=1)
    ]

    return Plan(
        steps=steps,
        explanation=_explain(steps, goal, omitted, suppressed),
        omitted=omitted,
        suppressed_edges=suppressed,
        subgraph_entity_ids=list(nodes),
    )


def _reason(entity_id, nodes, successors, weakness_hits, targets) -> str:
    """§9.7: why this is included, and why here."""
    parts: list[str] = []
    if entity_id in weakness_hits:
        parts.append("you named this as a weakness")
    if entity_id in targets:
        parts.append("it is directly part of your stated goal")

    dependents = [
        nodes[s]["name"] for s in sorted(successors.get(entity_id, ()), key=str)
        if s in nodes
    ]
    if dependents:
        shown = ", ".join(dependents[:2])
        parts.append(f"{shown} depend{'s' if len(dependents) == 1 else ''} on it")

    if not parts:
        parts.append("it supports the concepts in your goal")

    sources = nodes[entity_id]["source_count"]
    citation = f" Supported by {sources} source excerpt{'s' if sources != 1 else ''}."
    return ("Included because " + "; ".join(parts) + "." + (citation if sources else ""))


def _explain(steps, goal, omitted, suppressed) -> str:
    if not steps:
        return "No route could be built within the available time."

    total = sum(s.allocated_minutes for s in steps)
    lines = [
        f"{len(steps)} steps totalling {total} of your {goal.available_minutes} "
        f"available minutes. The route starts with {steps[0].name} because "
        f"{steps[0].reason[len('Included because '):].rstrip('.')}."
    ]
    if omitted:
        lines.append(
            f"{len(omitted)} lower-priority topics were left out to fit the time: "
            + ", ".join(o["name"] for o in omitted[:5])
            + "."
        )
    if suppressed:
        lines.append(
            f"{len(suppressed)} prerequisite relationship(s) formed a cycle; the "
            "lowest-confidence edge in each was set aside for ordering and is "
            "still visible in the graph."
        )
    return " ".join(lines)


def persist_plan(conn, course_id: uuid.UUID, goal: Goal, plan: Plan) -> uuid.UUID:
    """Save the route as a versioned session (§7.2)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO study_sessions
                (course_id, goal_text, available_minutes, weakness_text,
                 planner_version, status, explanation)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                course_id,
                goal.goal_text,
                goal.available_minutes,
                goal.weakness_text,
                PLANNER_VERSION,
                "READY" if plan.steps else "FAILED",
                plan.explanation,
            ),
        )
        session_id = cur.fetchone()[0]

        for step in plan.steps:
            cur.execute(
                """
                INSERT INTO study_steps
                    (session_id, knowledge_entity_id, position, allocated_minutes,
                     activity_type, reason, priority_score)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    session_id,
                    step.entity_id,
                    step.position,
                    step.allocated_minutes,
                    step.activity_type,
                    step.reason,
                    step.priority_score,
                ),
            )
    return session_id
