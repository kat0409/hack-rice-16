#!/bin/bash
# Substitutes EMBEDDING_DIMENSIONS into 10_schema.sql.template and runs the result.
#
# design-doc.md §8.5 requires the embedding model and dimension to be "chosen...
# before creating the production migration" and treats a dimension mismatch as a
# P0 failure mode (§17: "pgvector dimension mismatch... Freeze model/dimension and
# validate startup config"). Rather than hard-coding a number that would silently
# go stale, the dimension is a required environment variable so it fails loudly at
# init time instead of quietly at first insert.
set -euo pipefail

: "${EMBEDDING_DIMENSIONS:?EMBEDDING_DIMENSIONS must be set (see .env.example) — this is the P0 risk in design-doc.md §17 (\"pgvector dimension mismatch\"); refusing to guess a value.}"

if ! [[ "${EMBEDDING_DIMENSIONS}" =~ ^[0-9]+$ ]]; then
    echo "EMBEDDING_DIMENSIONS must be a positive integer, got: ${EMBEDDING_DIMENSIONS}" >&2
    exit 1
fi

TEMPLATE_DIR="$(dirname "${BASH_SOURCE[0]}")"

sed "s/__EMBEDDING_DIMENSIONS__/${EMBEDDING_DIMENSIONS}/g" \
    "${TEMPLATE_DIR}/10_schema.sql.template" \
    | psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}"
