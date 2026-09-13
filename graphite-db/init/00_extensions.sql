-- Enable the two extensions the whole application depends on.
-- Runs once, automatically, the first time the container starts against an empty
-- data volume (docker-entrypoint-initdb.d contract). It does NOT run on later
-- restarts, and it is NOT a migration tool — see graphite-db/README section of the
-- validation report for how this interacts with future schema changes.

-- Explicit rather than relying on the connection default: see the note below
-- about "$user" colliding with AGE's graph-name-as-schema convention.
SET search_path = public;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;

-- Auto-load AGE for every new session on this server. AGE normally requires each
-- session to run `LOAD 'age';` before its first Cypher call; setting this makes
-- that automatic at the server level as a safety net.
--
-- This does NOT remove the requirement in design-doc.md §6.6 that "every API and
-- worker connection initializes AGE (LOAD 'age' and the required search path)
-- through the connection-pool hook" — application code must still do this
-- explicitly and must not rely on server configuration alone, since a future
-- managed/cloud Postgres may not permit ALTER SYSTEM.
ALTER SYSTEM SET session_preload_libraries = 'age';
SELECT pg_reload_conf();

-- Deliberately NOT setting a database-wide default search_path that puts
-- ag_catalog ahead of public: CREATE TABLE without a schema qualifier resolves
-- to the FIRST schema in search_path, so an ag_catalog-first default silently
-- creates every application table inside ag_catalog instead of public (this was
-- caught by actually running this init against a live container while building
-- this scaffolding — verify with \dt before changing this back).
--
-- Every connection that needs Cypher must instead SET search_path = ag_catalog,
-- "$user", public explicitly for that session/transaction, exactly as
-- design-doc.md §6.6 already requires of the API/worker connection-pool hook, and
-- exactly as graphite-db/init/01_age_graph.sql does for its own session below.
