-- Create the single shared Apache AGE graph for the entire application.
--
-- design-doc.md §7.3 is explicit: "Create one AGE graph for the application, such
-- as `graphite`, and include `course_id` on every vertex... Do not create one AGE
-- graph per course in the MVP." architecture-mental-model.md §11 lists
-- per-course-graph isolation as an explicitly open question for later — this
-- script locks in the single-shared-graph MVP decision. Revisit deliberately if
-- that changes; it is not a drop-in migration (AGE has no built-in graph rename
-- across a differently-partitioned topology).

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'graphite') THEN
        PERFORM create_graph('graphite');
    END IF;
END
$$;
