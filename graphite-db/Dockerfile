# graphite-db — PostgreSQL 16 prepackaged with pgvector and Apache AGE.
#
# One pinned image so every teammate's local database is byte-for-byte the same
# (design-doc.md §6.6: "pgvector and Apache AGE are enabled as PostgreSQL extensions
# in one pinned Docker image"). Both extensions are compiled from source against this
# exact PostgreSQL build rather than mixed from two different prebuilt images, which
# is the failure mode called out in design-doc.md §17 ("AGE/pgvector image
# incompatibility... Pin PostgreSQL and both extension versions").
#
# To upgrade: bump exactly one of the ARGs below, rebuild on a clean machine
# (`docker compose build --no-cache db`), and re-run the full init flow before
# merging. Do not upgrade both extensions in the same change.
FROM postgres:16-bookworm

ARG PGVECTOR_VERSION=v0.8.0
ARG AGE_VERSION=PG16/v1.5.0-rc0

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        git \
        flex \
        bison \
        postgresql-server-dev-16 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pgvector: vector similarity search (cosine/L2/inner-product) for chunk and
# knowledge_entity embeddings.
RUN git clone --branch ${PGVECTOR_VERSION} --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && make -C /tmp/pgvector PG_CONFIG=/usr/bin/pg_config \
    && make -C /tmp/pgvector install PG_CONFIG=/usr/bin/pg_config \
    && rm -rf /tmp/pgvector

# Apache AGE: property-graph engine (Cypher) that stores the knowledge topology.
# The PG16/v1.5.0-rc0 tag is the AGE release branch built specifically against
# PostgreSQL 16; do not substitute a tag built for a different PostgreSQL major
# version even if it appears newer.
RUN git clone --branch "${AGE_VERSION}" --depth 1 https://github.com/apache/age.git /tmp/age \
    && make -C /tmp/age PG_CONFIG=/usr/bin/pg_config \
    && make -C /tmp/age install PG_CONFIG=/usr/bin/pg_config \
    && rm -rf /tmp/age

# Init scripts are bind-mounted from ./init by docker-compose.yml (not COPYed here)
# so schema changes during development don't require an image rebuild. They still
# only run once, against a fresh (empty) data volume — see docker-entrypoint-initdb.d
# semantics in the base postgres image.
