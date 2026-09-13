"""Planner tests (design-doc.md §18.1: edge direction, cycles, ordering, budget).

These guard the claims the product makes to a judge: that the order is derived
from the graph, that it respects prerequisites, that it fits the stated time, and
that anything dropped is reported rather than hidden.
"""

from __future__ import annotations

import uuid

import pytest

from graphite.graph_repository import create_entity, create_relationship
from graphite.planner import (
    BASE_MINUTES,
    Goal,
    build_plan,
    build_planning_dag,
    find_cycles,
    persist_plan,
    resolve_cycles,
    topological_order,
)

A, B, C = (uuid.UUID(int=i) for i in (1, 2, 3))


def _edge(source, target, relation, confidence=0.9, status="ACTIVE"):
    return {
        "id": uuid.uuid4(),
        "source": source,
        "target": target,
        "relation_type": relation,
        "confidence": confidence,
        "status": status,
        "rationale": None,
        "evidence": [],
    }


class TestPlanningDirection:
    def test_requires_is_reversed_into_study_order(self):
        # A REQUIRES B means B is studied first, so the planning edge is B -> A.
        dag = build_planning_dag([_edge(A, B, "REQUIRES")])
        assert dag == {B: {A}}

    def test_derived_from_is_reversed_too(self):
        assert build_planning_dag([_edge(A, B, "DERIVED_FROM")]) == {B: {A}}

    def test_next_keeps_its_direction(self):
        # NEXT already points the way the student travels.
        assert build_planning_dag([_edge(A, B, "NEXT")]) == {A: {B}}

    def test_soft_relations_create_no_ordering(self):
        # §7.4: RELATED_TO is a retrieval aid and must never imply precedence.
        soft = [_edge(A, B, r) for r in ("RELATED_TO", "PART_OF", "CONTRASTS_WITH",
                                          "APPLIED_IN", "EXAMPLE_OF")]
        assert build_planning_dag(soft) == {}

    def test_inactive_edges_are_ignored(self):
        assert build_planning_dag([_edge(A, B, "REQUIRES", status="SUPPRESSED")]) == {}


class TestCycles:
    def test_no_cycle_in_a_chain(self):
        assert find_cycles({A: {B}, B: {C}}) == []

    def test_detects_a_three_node_cycle(self):
        cycles = find_cycles({A: {B}, B: {C}, C: {A}})
        assert len(cycles) == 1
        assert set(cycles[0]) == {A, B, C}

    def test_suppresses_the_lowest_confidence_edge(self):
        edges = [
            _edge(A, B, "REQUIRES", confidence=0.9),
            _edge(B, C, "REQUIRES", confidence=0.2),  # the weakest link
            _edge(C, A, "REQUIRES", confidence=0.8),
        ]
        dag = build_planning_dag(edges)
        suppressed = resolve_cycles(dag, edges)

        assert len(suppressed) == 1
        assert suppressed[0]["confidence"] == pytest.approx(0.2)
        # The cycle must actually be gone, not merely reported.
        assert find_cycles(dag) == []

    def test_resolution_terminates_on_mutual_requirement(self):
        edges = [_edge(A, B, "REQUIRES", 0.5), _edge(B, A, "REQUIRES", 0.4)]
        dag = build_planning_dag(edges)
        resolve_cycles(dag, edges)
        assert find_cycles(dag) == []


class TestOrdering:
    def test_prerequisites_come_first(self):
        order = topological_order({C: {B}, B: {A}}, [A, B, C], {}, {})
        assert order.index(C) < order.index(B) < order.index(A)

    def test_priority_breaks_ties_among_eligible_nodes(self):
        order = topological_order({}, [A, B, C], {A: 0.1, B: 0.9, C: 0.5}, {})
        assert order == [B, C, A]

    def test_next_chain_stays_contiguous(self):
        """A procedure's steps must not be interleaved with unrelated material."""
        s1, s2, s3 = (uuid.UUID(int=i) for i in (10, 11, 12))
        other = uuid.UUID(int=13)
        order = topological_order(
            successors={s1: {s2}, s2: {s3}},
            nodes=[s1, s2, s3, other],
            # `other` outranks the steps, and would be interleaved without the
            # NEXT follow-on rule.
            priorities={s1: 0.9, s2: 0.1, s3: 0.1, other: 0.5},
            next_edges={s1: {s2}, s2: {s3}},
        )
        assert order == [s1, s2, s3, other]


class TestGoal:
    def test_extracts_weakness_terms_ignoring_filler(self):
        goal = Goal("exam", 60, weakness_text="I am weak at recursion")
        assert goal.weakness_terms == {"recursion"}


# --------------------------------------------------------------------------
# End-to-end against a real graph
# --------------------------------------------------------------------------


@pytest.fixture
def course_graph(conn, course_id):
    """The demo course's shape: a prerequisite chain, a procedure, an outlier."""
    ids = {}
    ids["indexing"] = create_entity(conn, course_id, "Array Indexing", "CONCEPT",
                                    "Constant-time access.", importance=0.6)
    ids["sorted"] = create_entity(conn, course_id, "Sorted Ordering", "CONCEPT",
                                  "Non-decreasing order.", importance=0.7)
    ids["recursion"] = create_entity(conn, course_id, "Recursion", "CONCEPT",
                                     "Calls itself.", importance=0.8)
    ids["binary_search"] = create_entity(conn, course_id, "Binary Search", "PROCEDURE",
                                         "Halve a sorted range.", importance=0.95)
    ids["trees"] = create_entity(conn, course_id, "Trees", "CONCEPT",
                                 "Hierarchical nodes.", importance=0.75)
    ids["hash"] = create_entity(conn, course_id, "Hash Tables", "CONCEPT",
                                "Unit 4 material.", importance=0.3)

    create_relationship(conn, course_id, ids["binary_search"], ids["sorted"],
                        "REQUIRES", confidence=0.95)
    create_relationship(conn, course_id, ids["sorted"], ids["indexing"],
                        "REQUIRES", confidence=0.9)
    create_relationship(conn, course_id, ids["trees"], ids["recursion"],
                        "REQUIRES", confidence=0.92)
    conn.commit()
    return ids


class TestEndToEnd:
    def test_prerequisites_precede_their_dependents(self, conn, course_id, course_graph):
        plan = build_plan(conn, course_id, Goal("binary search on a sorted array", 120))
        order = [s.entity_id for s in plan.steps]

        assert course_graph["binary_search"] in order
        assert order.index(course_graph["indexing"]) < order.index(course_graph["sorted"])
        assert order.index(course_graph["sorted"]) < order.index(
            course_graph["binary_search"]
        )

    def test_never_exceeds_the_time_budget(self, conn, course_id, course_graph):
        for budget in (5, 15, 30, 60, 240):
            plan = build_plan(conn, course_id, Goal("searching and trees", budget))
            assert plan.allocated_minutes <= budget, f"overran at budget={budget}"

    def test_tiny_budget_still_returns_something_to_do(
        self, conn, course_id, course_graph
    ):
        """"You have 10 minutes" must not produce an empty route."""
        plan = build_plan(conn, course_id, Goal("binary search", 10))
        assert plan.steps
        assert plan.allocated_minutes <= 10

    def test_dropped_topics_are_reported_not_hidden(self, conn, course_id, course_graph):
        plan = build_plan(conn, course_id, Goal("searching and trees", 15))
        assert plan.omitted
        assert all(o["reason"] for o in plan.omitted)
        assert "left out" in plan.explanation

    def test_weakness_is_reviewed_and_explained(self, conn, course_id, course_graph):
        plan = build_plan(
            conn, course_id,
            Goal("trees and recursion", 120, weakness_text="I struggle with recursion"),
        )
        recursion = next(
            s for s in plan.steps if s.entity_id == course_graph["recursion"]
        )
        assert recursion.activity_type == "REVIEW"
        assert "weakness" in recursion.reason

    def test_goal_targets_survive_budget_pressure(self, conn, course_id, course_graph):
        """Under pressure, drop supporting material before the actual goal.

        Goal targets are usually leaves in the planning DAG, so a naive
        drop-the-leaves rule discards what the student asked for and keeps its
        prerequisites — the exact inversion of what they wanted.
        """
        plan = build_plan(conn, course_id, Goal("binary search", 40))
        names = [s.name for s in plan.steps]

        assert "Binary Search" in names, f"goal target was dropped: {names}"

    def test_budget_pressure_does_not_mark_everything_review(
        self, conn, course_id, course_graph
    ):
        """A student cannot "review" material they have never seen.

        REVIEW is a legitimate budget lever (§9.6), but if trimming downgrades
        every step the activity type stops carrying information.
        """
        plan = build_plan(conn, course_id, Goal("searching and trees", 45))
        activities = {s.activity_type for s in plan.steps}
        assert "LEARN" in activities, f"all steps downgraded: {activities}"

    def test_every_step_explains_itself(self, conn, course_id, course_graph):
        plan = build_plan(conn, course_id, Goal("binary search", 120))
        assert plan.steps
        assert all(s.reason.startswith("Included because") for s in plan.steps)

    def test_steps_have_minimum_useful_duration(self, conn, course_id, course_graph):
        plan = build_plan(conn, course_id, Goal("binary search", 120))
        assert all(s.allocated_minutes >= 5 for s in plan.steps)
        assert all(s.allocated_minutes <= max(BASE_MINUTES.values()) + 10
                   for s in plan.steps)

    def test_positions_are_sequential(self, conn, course_id, course_graph):
        plan = build_plan(conn, course_id, Goal("binary search", 120))
        assert [s.position for s in plan.steps] == list(range(1, len(plan.steps) + 1))

    def test_unmatched_goal_degrades_with_guidance(self, conn, course_id):
        # Empty course: no targets at all (§20.5 NO_GOAL_MATCH).
        plan = build_plan(conn, course_id, Goal("quantum chromodynamics", 60))
        assert plan.steps == []
        assert "No course material matched" in plan.explanation

    def test_plan_is_deterministic(self, conn, course_id, course_graph):
        goal = Goal("binary search on a sorted array", 90)
        first = [s.entity_id for s in build_plan(conn, course_id, goal).steps]
        second = [s.entity_id for s in build_plan(conn, course_id, goal).steps]
        assert first == second


class TestPersistence:
    def test_session_and_steps_are_saved(self, conn, course_id, course_graph):
        goal = Goal("binary search", 90, weakness_text="sorted ordering")
        plan = build_plan(conn, course_id, goal)
        session_id = persist_plan(conn, course_id, goal, plan)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, available_minutes, planner_version "
                "FROM study_sessions WHERE id = %s",
                (session_id,),
            )
            assert cur.fetchone() == ("READY", 90, "planner-v1")

            cur.execute(
                "SELECT position, allocated_minutes, activity_type, reason "
                "FROM study_steps WHERE session_id = %s ORDER BY position",
                (session_id,),
            )
            rows = cur.fetchall()

        assert len(rows) == len(plan.steps)
        assert sum(r[1] for r in rows) <= 90
        assert all(r[3] for r in rows)
