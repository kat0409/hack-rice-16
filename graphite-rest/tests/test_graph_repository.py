"""GraphRepository tests against real Postgres + AGE (design-doc.md §18.1).

The graph is the product's differentiator, so these assert the invariants that
make it trustworthy rather than merely present: writes land in both stores under
one UUID, endpoints are validated, traversal direction is correct, suppressed
topology is excluded, and reconciliation actually notices drift.
"""

from __future__ import annotations

import uuid

import pytest

from graphite.graph_repository import (
    GraphError,
    create_entity,
    create_relationship,
    expand_prerequisite_subgraph,
    fetch_course_graph,
    hydrate,
    normalize_name,
    parse_agtype,
    reconcile,
)


@pytest.fixture
def chain(conn, course_id):
    """Binary Search REQUIRES Sorted Ordering REQUIRES Array Indexing.

    Mirrors the demo notes, plus one unrelated concept that must never be pulled
    into a search-focused route.
    """
    ids = {
        "binary_search": create_entity(
            conn, course_id, "Binary Search", "PROCEDURE",
            "Halves a sorted range.", importance=0.9,
        ),
        "sorted": create_entity(
            conn, course_id, "Sorted Ordering", "CONCEPT",
            "Elements in non-decreasing order.", importance=0.7,
        ),
        "indexing": create_entity(
            conn, course_id, "Array Indexing", "CONCEPT",
            "Constant-time access by position.", importance=0.6,
        ),
        "hash": create_entity(
            conn, course_id, "Hash Tables", "CONCEPT",
            "Average O(1) lookup, unrelated to searching a sorted array.",
            importance=0.4,
        ),
    }
    create_relationship(conn, course_id, ids["binary_search"], ids["sorted"], "REQUIRES",
                        confidence=0.95)
    create_relationship(conn, course_id, ids["sorted"], ids["indexing"], "REQUIRES",
                        confidence=0.85)
    conn.commit()
    return ids


class TestDualWrite:
    def test_entity_lands_in_both_stores_under_one_uuid(self, conn, course_id):
        entity_id = create_entity(
            conn, course_id, "Recursion", "CONCEPT", "Calls itself."
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT canonical_name FROM knowledge_entities WHERE id = %s",
                (entity_id,),
            )
            assert cur.fetchone()[0] == "Recursion"

        assert reconcile(conn, course_id) == []

    def test_rollback_removes_both_sides(self, conn, course_id):
        entity_id = create_entity(conn, course_id, "Doomed", "CONCEPT", "x")
        conn.rollback()

        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM knowledge_entities WHERE id = %s", (entity_id,))
            assert cur.fetchone() is None
        # The AGE vertex must be gone too, or the graph keeps an orphan forever.
        assert reconcile(conn, course_id) == []

    def test_name_with_quotes_is_not_a_cypher_injection(self, conn, course_id):
        nasty = 'O\'Brien\'s "Theorem" \\ end'
        entity_id = create_entity(conn, course_id, nasty, "CONCEPT", "x")
        conn.commit()

        assert hydrate(conn, [entity_id])[0]["name"] == nasty
        assert reconcile(conn, course_id) == []


class TestValidation:
    def test_unknown_entity_type_is_rejected(self, conn, course_id):
        with pytest.raises(GraphError, match="Unknown entity_type"):
            create_entity(conn, course_id, "X", "NOT_A_TYPE", "x")

    def test_uncontrolled_relation_type_is_rejected(self, conn, course_id, chain):
        with pytest.raises(GraphError, match="controlled vocabulary"):
            create_relationship(
                conn, course_id, chain["binary_search"], chain["sorted"], "KIND_OF"
            )

    def test_self_loop_is_rejected(self, conn, course_id, chain):
        with pytest.raises(GraphError, match="Self-loop"):
            create_relationship(
                conn, course_id, chain["sorted"], chain["sorted"], "REQUIRES"
            )

    def test_endpoint_from_another_course_is_rejected(self, conn, course_id, chain):
        with pytest.raises(GraphError, match="Endpoints not in course"):
            create_relationship(
                conn, course_id, chain["sorted"], uuid.uuid4(), "REQUIRES"
            )

    def test_has_step_must_target_a_procedure_step(self, conn, course_id, chain):
        with pytest.raises(GraphError, match="HAS_STEP target"):
            create_relationship(
                conn, course_id, chain["binary_search"], chain["sorted"], "HAS_STEP"
            )


class TestTraversal:
    def test_finds_transitive_prerequisites(self, conn, course_id, chain):
        result = expand_prerequisite_subgraph(
            conn, course_id, [chain["binary_search"]]
        )

        # Two hops out: Binary Search -> Sorted Ordering -> Array Indexing.
        assert set(result.entity_ids) >= {
            chain["binary_search"],
            chain["sorted"],
            chain["indexing"],
        }

    def test_excludes_unrelated_concepts(self, conn, course_id, chain):
        result = expand_prerequisite_subgraph(
            conn, course_id, [chain["binary_search"]]
        )
        assert chain["hash"] not in result.entity_ids

    def test_direction_is_not_symmetric(self, conn, course_id, chain):
        """A REQUIRES B pulls in B, never the other way around.

        Inverting this is the single easiest way to produce a confidently wrong
        study order, and nothing else in the stack would catch it.
        """
        downstream = expand_prerequisite_subgraph(conn, course_id, [chain["indexing"]])
        assert chain["binary_search"] not in downstream.entity_ids

    def test_depth_limit_is_respected(self, conn, course_id, chain):
        shallow = expand_prerequisite_subgraph(
            conn, course_id, [chain["binary_search"]], max_depth=1
        )
        assert chain["sorted"] in shallow.entity_ids
        assert chain["indexing"] not in shallow.entity_ids

    def test_suppressed_edges_are_not_traversed(self, conn, course_id, chain):
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE graph_relationships SET status='SUPPRESSED' "
                "WHERE relation_type='REQUIRES' AND course_id=%s",
                (course_id,),
            )
        # AGE carries its own copy of status, which is what traversal filters on.
        from graphite.graph_repository import _cypher

        with conn.cursor() as cur:
            _cypher(
                cur,
                "MATCH ()-[r:REQUIRES]->() WHERE r.course_id = $cid "
                "SET r.status = 'SUPPRESSED' RETURN r",
                {"cid": str(course_id)},
                columns="r agtype",
            )
        conn.commit()

        result = expand_prerequisite_subgraph(conn, course_id, [chain["binary_search"]])
        assert chain["sorted"] not in result.entity_ids

    def test_empty_seeds_return_nothing(self, conn, course_id, chain):
        assert expand_prerequisite_subgraph(conn, course_id, []).entity_ids == []


class TestProcedures:
    def test_selecting_one_step_pulls_in_the_whole_procedure(self, conn, course_id):
        procedure = create_entity(
            conn, course_id, "Binary Search", "PROCEDURE", "The method."
        )
        steps = [
            create_entity(
                conn, course_id, name, "PROCEDURE_STEP", name,
                identity_scope_id=procedure,
            )
            for name in ("Choose midpoint", "Compare target", "Keep one half")
        ]
        for step in steps:
            create_relationship(conn, course_id, procedure, step, "HAS_STEP")
        create_relationship(conn, course_id, steps[0], steps[1], "NEXT")
        create_relationship(conn, course_id, steps[1], steps[2], "NEXT")
        conn.commit()

        # Showing step 2 alone would be useless to a student (§9.3).
        result = expand_prerequisite_subgraph(conn, course_id, [steps[1]])
        assert set(result.entity_ids) >= {procedure, *steps}


class TestGraphDto:
    def test_returns_nodes_and_edges_with_endpoints(self, conn, course_id, chain):
        graph = fetch_course_graph(conn, course_id)

        assert len(graph["nodes"]) == 4
        assert len(graph["edges"]) == 2

        edge = next(
            e for e in graph["edges"] if e["source"] == chain["binary_search"]
        )
        assert edge["target"] == chain["sorted"]
        assert edge["relation_type"] == "REQUIRES"
        assert edge["confidence"] == pytest.approx(0.95)

    def test_hydrate_never_leaks_age_internal_ids(self, conn, course_id, chain):
        node = hydrate(conn, [chain["sorted"]])[0]
        assert "graphid" not in node and "id" in node


class TestReconciliation:
    def test_clean_graph_reports_no_problems(self, conn, course_id, chain):
        assert reconcile(conn, course_id) == []

    def test_detects_a_registry_row_with_no_vertex(self, conn, course_id, chain):
        orphan = uuid.uuid4()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO knowledge_entities
                    (id, course_id, canonical_name, normalized_name, description,
                     entity_type)
                VALUES (%s,%s,'Ghost','ghost','no vertex','CONCEPT')
                """,
                (orphan, course_id),
            )
        conn.commit()

        problems = reconcile(conn, course_id)
        assert any(str(orphan) in p and "no AGE vertex" in p for p in problems)

    def test_detects_confidence_drift(self, conn, course_id, chain):
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE graph_relationships SET confidence = 0.11 WHERE course_id = %s",
                (course_id,),
            )
        conn.commit()

        problems = reconcile(conn, course_id)
        assert any("confidence drift" in p for p in problems)


class TestHelpers:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Binary Search", "binary search"),
            ("binary-search", "binary search"),
            ("  Binary   Search  ", "binary search"),
        ],
    )
    def test_normalize_name_folds_variants(self, raw, expected):
        assert normalize_name(raw) == expected

    def test_parse_agtype_strips_the_type_suffix(self):
        assert parse_agtype('{"a": 1}::vertex') == {"a": 1}
        assert parse_agtype('"plain"') == "plain"
