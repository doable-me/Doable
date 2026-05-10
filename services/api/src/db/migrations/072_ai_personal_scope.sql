-- 072_ai_personal_scope.sql
-- Personal-scope AI accounts and providers.
--
-- Until now `github_copilot_accounts` and `ai_providers` were workspace-scoped
-- only. Anyone in the workspace could list every account's github_login and
-- every provider's label. Non-admins couldn't add their own — they could only
-- pick from the admin-curated pool. The `user_ai_preferences` row a member
-- saved as a "personal override" was just a SELECTOR over that shared pool.
--
-- This migration introduces real per-user scoping while keeping the existing
-- workspace pool untouched (every existing row is backfilled to scope =
-- 'workspace'). Members can now add accounts/providers that only they can
-- see and use.
--
-- Layered enforcement:
--   - Partial UNIQUE indexes prevent duplicates within each scope.
--   - CHECK constraints make scope and owner_user_id consistent.
--   - Triggers stop workspace_ai_settings (workspace defaults / suggestion /
--     enforced) from pointing at a personal row, and stop
--     user_ai_preferences from referencing another user's personal row.
--   - RLS policies (defense-in-depth, only fires for routes that go through
--     the withRls() middleware): workspace rows visible to workspace
--     members and mutable by admins; personal rows visible/mutable only by
--     the owning user.

-- ─── 1. enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ai_account_scope AS ENUM ('workspace', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. columns ─────────────────────────────────────────────
ALTER TABLE github_copilot_accounts
  ADD COLUMN IF NOT EXISTS scope ai_account_scope NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS scope ai_account_scope NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- ─── 3. consistency CHECKs ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE github_copilot_accounts
    ADD CONSTRAINT gca_scope_owner_consistent
      CHECK ((scope = 'user'      AND owner_user_id IS NOT NULL)
          OR (scope = 'workspace' AND owner_user_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ai_providers
    ADD CONSTRAINT aip_scope_owner_consistent
      CHECK ((scope = 'user'      AND owner_user_id IS NOT NULL)
          OR (scope = 'workspace' AND owner_user_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. uniqueness ──────────────────────────────────────────
-- Replace the workspace-wide UNIQUE (workspace_id, github_login) with a
-- partial unique that only applies to scope='workspace'. Personal copies
-- get their own partial unique scoped to (workspace_id, owner_user_id,
-- github_login) — the same person can't connect the same login twice in
-- the same workspace, but two different users can each add the same
-- personal login to the same workspace.
ALTER TABLE github_copilot_accounts
  DROP CONSTRAINT IF EXISTS github_copilot_accounts_workspace_id_github_login_key;

CREATE UNIQUE INDEX IF NOT EXISTS gca_workspace_login_unique
  ON github_copilot_accounts (workspace_id, github_login)
  WHERE scope = 'workspace';

CREATE UNIQUE INDEX IF NOT EXISTS gca_user_login_unique
  ON github_copilot_accounts (workspace_id, owner_user_id, github_login)
  WHERE scope = 'user';

-- Helpful indexes for personal lookups.
CREATE INDEX IF NOT EXISTS idx_gca_owner_user
  ON github_copilot_accounts(owner_user_id) WHERE scope = 'user';
CREATE INDEX IF NOT EXISTS idx_aip_owner_user
  ON ai_providers(owner_user_id) WHERE scope = 'user';

-- ─── 5. workspace_ai_settings cannot reference a personal row ──
-- The workspace's own defaults / suggestion defaults / enforced choice all
-- target everyone in the workspace. They MUST point at a workspace-scoped
-- row, otherwise selecting a personal row as the workspace default would
-- leak access to that token across users.
CREATE OR REPLACE FUNCTION enforce_workspace_default_scope() RETURNS trigger AS $$
DECLARE acct_scope ai_account_scope; prov_scope ai_account_scope;
BEGIN
  -- Default
  IF NEW.default_copilot_account_id IS NOT NULL THEN
    SELECT scope INTO acct_scope FROM github_copilot_accounts WHERE id = NEW.default_copilot_account_id;
    IF acct_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.default_copilot_account_id must reference a workspace-scoped account, not a personal one';
    END IF;
  END IF;
  IF NEW.default_provider_id IS NOT NULL THEN
    SELECT scope INTO prov_scope FROM ai_providers WHERE id = NEW.default_provider_id;
    IF prov_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.default_provider_id must reference a workspace-scoped provider, not a personal one';
    END IF;
  END IF;
  -- Suggestion
  IF NEW.suggestion_copilot_account_id IS NOT NULL THEN
    SELECT scope INTO acct_scope FROM github_copilot_accounts WHERE id = NEW.suggestion_copilot_account_id;
    IF acct_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.suggestion_copilot_account_id must reference a workspace-scoped account, not a personal one';
    END IF;
  END IF;
  IF NEW.suggestion_provider_id IS NOT NULL THEN
    SELECT scope INTO prov_scope FROM ai_providers WHERE id = NEW.suggestion_provider_id;
    IF prov_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.suggestion_provider_id must reference a workspace-scoped provider, not a personal one';
    END IF;
  END IF;
  -- Enforced
  IF NEW.enforced_copilot_account_id IS NOT NULL THEN
    SELECT scope INTO acct_scope FROM github_copilot_accounts WHERE id = NEW.enforced_copilot_account_id;
    IF acct_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.enforced_copilot_account_id must reference a workspace-scoped account, not a personal one';
    END IF;
  END IF;
  IF NEW.enforced_provider_id IS NOT NULL THEN
    SELECT scope INTO prov_scope FROM ai_providers WHERE id = NEW.enforced_provider_id;
    IF prov_scope = 'user' THEN
      RAISE EXCEPTION 'workspace_ai_settings.enforced_provider_id must reference a workspace-scoped provider, not a personal one';
    END IF;
  END IF;
  RETURN NEW;
END$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_was_default_scope ON workspace_ai_settings;
CREATE TRIGGER trg_was_default_scope
  BEFORE INSERT OR UPDATE ON workspace_ai_settings
  FOR EACH ROW EXECUTE FUNCTION enforce_workspace_default_scope();

-- ─── 6. user_ai_preferences row may only reference its owner's personal rows ──
CREATE OR REPLACE FUNCTION enforce_uap_account_ownership() RETURNS trigger AS $$
DECLARE
  acct_scope ai_account_scope; acct_owner uuid;
  prov_scope ai_account_scope; prov_owner uuid;
  s_acct_scope ai_account_scope; s_acct_owner uuid;
  s_prov_scope ai_account_scope; s_prov_owner uuid;
BEGIN
  IF NEW.copilot_account_id IS NOT NULL THEN
    SELECT scope, owner_user_id INTO acct_scope, acct_owner
    FROM github_copilot_accounts WHERE id = NEW.copilot_account_id;
    IF acct_scope = 'user' AND acct_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'user_ai_preferences cannot reference another user''s personal copilot account';
    END IF;
  END IF;
  IF NEW.provider_id IS NOT NULL THEN
    SELECT scope, owner_user_id INTO prov_scope, prov_owner
    FROM ai_providers WHERE id = NEW.provider_id;
    IF prov_scope = 'user' AND prov_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'user_ai_preferences cannot reference another user''s personal provider';
    END IF;
  END IF;
  IF NEW.suggestion_copilot_account_id IS NOT NULL THEN
    SELECT scope, owner_user_id INTO s_acct_scope, s_acct_owner
    FROM github_copilot_accounts WHERE id = NEW.suggestion_copilot_account_id;
    IF s_acct_scope = 'user' AND s_acct_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'user_ai_preferences.suggestion_copilot_account_id cannot reference another user''s personal copilot account';
    END IF;
  END IF;
  IF NEW.suggestion_provider_id IS NOT NULL THEN
    SELECT scope, owner_user_id INTO s_prov_scope, s_prov_owner
    FROM ai_providers WHERE id = NEW.suggestion_provider_id;
    IF s_prov_scope = 'user' AND s_prov_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'user_ai_preferences.suggestion_provider_id cannot reference another user''s personal provider';
    END IF;
  END IF;
  RETURN NEW;
END$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uap_account_ownership ON user_ai_preferences;
CREATE TRIGGER trg_uap_account_ownership
  BEFORE INSERT OR UPDATE ON user_ai_preferences
  FOR EACH ROW EXECUTE FUNCTION enforce_uap_account_ownership();

-- ─── 7. RLS — defense in depth ──────────────────────────────
-- Style mirrors 045/071: permissive when doable_current_user_id() is unset
-- (so migrations / background jobs / WS service that don't go through the
-- withRls() middleware are not blocked).

ALTER TABLE github_copilot_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_copilot_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gca_scope_visibility ON github_copilot_accounts;
CREATE POLICY gca_scope_visibility ON github_copilot_accounts
  USING (
    doable_current_user_id() IS NULL
    OR (
      scope = 'workspace'
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = github_copilot_accounts.workspace_id
          AND wm.user_id = doable_current_user_id()
      )
    )
    OR (scope = 'user' AND owner_user_id = doable_current_user_id())
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR (
      scope = 'workspace'
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = github_copilot_accounts.workspace_id
          AND wm.user_id = doable_current_user_id()
          AND wm.role IN ('owner', 'admin')
      )
    )
    OR (
      scope = 'user'
      AND owner_user_id = doable_current_user_id()
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = github_copilot_accounts.workspace_id
          AND wm.user_id = doable_current_user_id()
      )
    )
  );

-- Replace the broad workspace_member policy on ai_providers with the same
-- scope-aware shape. ENABLE/FORCE RLS here so this migration is
-- self-contained: don't assume 071_rls_phase2 has run.
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_providers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_providers_workspace_member ON ai_providers;
DROP POLICY IF EXISTS ai_providers_scope_visibility ON ai_providers;
CREATE POLICY ai_providers_scope_visibility ON ai_providers
  USING (
    doable_current_user_id() IS NULL
    OR (
      scope = 'workspace'
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = ai_providers.workspace_id
          AND wm.user_id = doable_current_user_id()
      )
    )
    OR (scope = 'user' AND owner_user_id = doable_current_user_id())
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR (
      scope = 'workspace'
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = ai_providers.workspace_id
          AND wm.user_id = doable_current_user_id()
          AND wm.role IN ('owner', 'admin')
      )
    )
    OR (
      scope = 'user'
      AND owner_user_id = doable_current_user_id()
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = ai_providers.workspace_id
          AND wm.user_id = doable_current_user_id()
      )
    )
  );
