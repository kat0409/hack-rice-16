-- Access-path indexes kept separate from 10_schema.sql.template so vector-index
-- build parameters (m, ef_construction) can be retuned without touching table DDL.
--
-- design-doc.md §7.2 (chunks): "HNSW cosine index on `embedding` after the model
-- and dimension are locked". Built here unconditionally on container init because
-- this scaffolding assumes the dimension is already locked via EMBEDDING_DIMENSIONS
-- (see 10_run_schema.sh) — if the team is still iterating on the embedding model,
-- consider dropping these two CREATE INDEX statements until that is frozen, since
-- an HNSW index over the wrong dimension/model means a full rebuild, not a tweak.
--
-- Pinned explicitly for the same reason as 10_schema.sql.template: this session's
-- default search_path would otherwise resolve "$user" to the "graphite" AGE graph
-- schema (see 01_age_graph.sql) whenever POSTGRES_USER matches the graph name.
SET search_path = public;

CREATE INDEX idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_knowledge_entities_embedding_hnsw
    ON knowledge_entities USING hnsw (embedding vector_cosine_ops);

-- Full-text GIN index backing chunks.text_search (see comment in
-- 10_schema.sql.template) for the lexical term in design-doc.md §9.2's hybrid
-- retrieval score.
CREATE INDEX idx_chunks_text_search_gin
    ON chunks USING GIN (text_search);
