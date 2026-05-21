-- ─── Required extensions ────────────────────────────────────────────────────
-- pgcrypto: pgp_sym_encrypt for BYOK API keys at rest.
-- vector:   pgvector embeddings for AI semantic search.
-- pg_trgm:  trigram index for project/file fuzzy search.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Role separation (optional, recommended for multi-tenant installs) ──────
-- The default DATABASE_URL connects as the `doable` role created by the
-- postgres image's entrypoint — that role is the database owner and has
-- full DDL. For a tighter blast radius on a compromise of the api container,
-- switch the runtime to `doable_app` (no CREATEROLE / no CREATEDB / no
-- superuser) and keep the owner role only for migrations.
--
-- To migrate: (1) set DOABLE_APP_PASSWORD in your .env, (2) re-run the
-- statements below by hand against an existing DB, (3) flip the api's
-- DATABASE_URL to use doable_app while leaving the migrate service on the
-- owner role. We do NOT do this automatically because (a) the migrate
-- service still needs DDL to apply schema_migrations and (b) some apps in
-- the wild may depend on the connection identity matching the role name.
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doable_app') THEN
--     EXECUTE 'CREATE ROLE doable_app LOGIN PASSWORD ' || quote_literal(current_setting('doable.app_password', true));
--     GRANT CONNECT ON DATABASE doable TO doable_app;
--     GRANT USAGE ON SCHEMA public TO doable_app;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doable_app;
--     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO doable_app;
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doable_app;
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO doable_app;
--   END IF;
-- END$$;
