-- ─── Required extensions ────────────────────────────────────────────────────
-- pgcrypto: pgp_sym_encrypt for BYOK API keys at rest.
-- vector:   pgvector embeddings for AI semantic search.
-- pg_trgm:  trigram index for project/file fuzzy search.
--
-- File ordering note: docker-compose mounts this as
-- /docker-entrypoint-initdb.d/01-init.sql and 02-roles.sh as
-- /docker-entrypoint-initdb.d/02-roles.sh. The postgres entrypoint runs
-- them alphabetically, so extensions land before 02-roles.sh grants on
-- objects that depend on them.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Runtime role separation (doable_app) lives in 02-roles.sh, which reads
-- DOABLE_APP_PASSWORD from env and is therefore not safe to inline here.
