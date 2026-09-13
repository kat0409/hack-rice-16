.PHONY: db-up db-down db-logs db-psql db-reset

db-up:
	docker compose up -d --build db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

# session_preload_libraries='age' and the database-level search_path are both set
# by graphite-db/init/00_extensions.sql, so this shell already has AGE loaded and
# ag_catalog on the search path — run cypher('graphite', $$ ... $$) directly.
db-psql:
	docker compose exec db psql -U $${POSTGRES_USER:-graphite} -d $${POSTGRES_DB:-graphite}

# Destroys the data volume and re-runs every init script from scratch. Confirms
# before deleting, since this discards all local course/graph data.
db-reset:
	@printf 'This will DELETE the graphite_pgdata volume and all local data. Continue? [y/N] ' && read ans && [ "$$ans" = y ]
	docker compose down -v
	docker compose up -d --build db
