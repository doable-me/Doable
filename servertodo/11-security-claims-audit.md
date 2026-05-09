# Security claims — what's actually true (audit)

**Date:** 2026-05-09. Compiled in response to the question "no credentials in plain text on the server, DB has RLS, creds are encrypted — right?" The honest answer is **partially**, broken down below. This doc is the canonical reference; update it any time the model changes.

---

## TL;DR (3 lines)

1. **Plain-text on the server:** YES, the DB password and `ENCRYPTION_KEY` live plain-text in `0600`-mode files. That's the protection model, not a regression.
2. **RLS:** YES on **7 tables** (the most sensitive multi-tenant tables). Permissive fallback when the session variable is unset means RLS is defense-in-depth, not a hard gate. Many tables aren't covered.
3. **Encryption-at-rest in DB:** YES for BYOK/OAuth/SMTP/env-var creds via `pgp_sym_encrypt(value, ENCRYPTION_KEY)`. User passwords are Argon2id-hashed (not encrypted, correct choice). The `ENCRYPTION_KEY` itself is plain-text in `.env` (point #1 above).

---

## 1. Plain-text on disk — what's there and why

### What's plain-text

| Path | Mode | Owner | Contents (plain-text) |
|---|---|---|---|
| `/etc/doable/.db_pass` | `0600` | `root:root` | postgres password (hex) |
| `/etc/doable/.db_pass_admin` | `0600` | `root:root` | (only when `DOABLE_PG_ROLE_SPLIT=1`) `doable_admin` postgres password |
| `/opt/doable/.env` | `0600` | `doable:doable` | `DATABASE_URL=postgres://doable:<hex>@localhost:5432/doable` (full creds), `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`, `PROJECT_JWT_SECRET`, OAuth client secrets (GitHub/Google/Supabase), Stripe key, Resend key, Anthropic/OpenAI/etc keys when the operator pastes them at install |

### Why this is the model (not a bug)

These are the **innermost** secrets — the API process needs them at boot to:
- Authenticate to Postgres
- Sign/verify JWTs
- Decrypt every other secret stored in the DB
- Sign internal API↔WS calls

There's no envelope to wrap them in. Encrypting `.env` just shifts the problem to "where do I keep the decryption key for `.env`?" — and the answer there is always either (a) another plain-text file, (b) a hardware key (HSM/TPM, overkill), or (c) operator types it at every restart (operationally hostile). 

The protection model is: **OS-level access control**. `0600` + dedicated `doable` user means anyone reading these files already has root or local DB superuser, at which point credentials are the smallest of your problems.

### The real upgrade — peer auth

The single concrete fix that materially shrinks attack surface: **eliminate the postgres password from the runtime path** by switching to peer auth on the Unix socket. Postgres trusts the OS uid mapping (`doable` OS user → `doable` DB role) without any password exchange.

Status:
- Available behind `DOABLE_PG_PEER_AUTH=1` env var in `setup-v3/setup-server-v3.sh` (Phase 4, applied via `servertodo/10` diff 3c, committed `ae17c6b`).
- **Off by default** — turning it on requires `pg_hba.conf` change + Postgres reload + .env rewrite to `postgres:///doable?host=/var/run/postgresql`.
- Doesn't eliminate `.db_pass` entirely — `migrate.ts` still uses password auth for the admin role unless 3b is also enabled and a parallel peer rule is added for `doable_admin`.

### What we explicitly do NOT do

- Encrypt `.env` at rest (cargo cult — see above).
- Use TPM/HSM for `ENCRYPTION_KEY` (overkill for current scale, real upgrade for compliance-driven environments).
- Vault/KMS for runtime secret retrieval (worth doing once we hit ~10+ servers; today the operational cost outweighs the security gain).

---

## 2. Row-Level Security — what's protected and what isn't

### Migration: `services/api/src/db/migrations/045_row_level_security.sql`

7 tables have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`:

| Table | Policy | Notes |
|---|---|---|
| `users` | row visible if `id = doable_current_user_id()` | strictest; users see only themselves |
| `projects` | row visible if user is workspace member OR project public | join-based |
| `ai_sessions` | row visible if owner = current user OR public-shared | |
| `ai_messages` | row visible if message's session is visible | inherited via session |
| `integration_connections` | row visible if user owns the connection | OAuth tokens for connectors |
| `github_connections` | row visible if user owns the connection | personal GitHub tokens |
| `refresh_tokens` | row visible if user owns the token | |

### How it works

App calls `SET LOCAL "doable.current_user_id" = '<uuid>'` per-transaction. Policies match against `doable_current_user_id()`. **Critical caveat:**

```sql
-- When no user context is set (NULL), allow all — this covers migrations,
-- background jobs, internal API calls from WS, etc.
CREATE POLICY users_self ON users
  USING (
    doable_current_user_id() IS NULL  -- ← permissive fallback
    OR id = doable_current_user_id()
  )
```

Translation: **a code path that forgets to call `SET LOCAL` bypasses RLS entirely.** That's deliberate (migrations, background jobs, the WS service all need un-scoped access), but it means RLS is a defense-in-depth layer riding on top of application authz, not a primary gate. The primary gate remains `requireProjectAccess` middleware + workspace-membership checks at the route layer.

### What's NOT covered by RLS today

These tables have multi-tenant data but no RLS — protection relies entirely on app-layer authz:

- `workspaces`, `workspace_members` — workspace metadata + membership
- `ai_providers` — BYOK provider configs (encrypted_api_key still encrypted at rest)
- `workspace_ai_settings`, `user_ai_preferences` — AI defaults
- `project_api_keys` — per-project API keys for published apps (allowed_origins/allowed_tools)
- `mode_tools` — admin tool config
- `credit_balances`, `credit_transactions`, `credit_usage_log` — billing data
- `feature_flags`, `user_feature_overrides`
- `audit_events`, `activity_events` — audit logs (intentionally globally readable for platform admins)
- `connectors`, `marketplace_listings`, `marketplace_installs` — platform-managed
- `email_config` — platform-admin-managed SMTP config
- All migration / system tables

### Recommended follow-up (not blocking)

Adding RLS to `workspace_members`, `ai_providers`, `credit_balances`, and `project_api_keys` would close the remaining cross-tenant SQL-injection windows. Estimated effort: 1 day. Not currently scheduled.

---

## 3. Encryption-at-rest in the DB

### Scheme: pgcrypto's `pgp_sym_encrypt` + `pgp_sym_decrypt`

The `ENCRYPTION_KEY` is a 64-hex-char value generated at install (`openssl rand -hex 32`) and lives in `/opt/doable/.env`. The API process loads it at boot via `services/api/src/lib/secrets.ts::ENCRYPTION_KEY`. All encrypt/decrypt happens server-side in Postgres via the pgcrypto extension.

### What's encrypted

| Table.Column | Migration | What it stores |
|---|---|---|
| `settings.encrypted_value` | 001 | platform-admin-managed secrets (SMTP creds historically; now superseded by `email_config`) |
| `copilot_accounts.encrypted_token` | 009 | GitHub Copilot subscription tokens for platform-admins |
| `ai_providers.encrypted_api_key` | 009 | BYOK AI provider API keys (the MiniMax/OpenAI/Anthropic keys you paste in Settings) |
| `ai_providers.encrypted_bearer_token` | 009 | Bearer-token auth for OAuth-style provider proxies |
| `integration_connections.encrypted_value` | 026 | OAuth tokens for connector integrations (Slack, Gmail, Notion, etc.) |
| `env_vars.encrypted_value` | 036 | per-project environment variables the operator sets |
| `github_connections.encrypted_token` | 044 | per-user GitHub OAuth access tokens |
| `email_config.encrypted_*` | 049 | SMTP / Resend / Google email provider creds |

Code call sites (encryption layer): `packages/db/src/queries/ai-settings-providers.ts`, `connectors.ts`, `env-vars.ts`, `github.ts`. All wrap `pgp_sym_encrypt(value, ENCRYPTION_KEY)` and the decrypt counterpart.

### What's hashed (not encrypted) — correct choice

| Table.Column | Algorithm |
|---|---|
| `users.password_hash` | Argon2id (via `argon2` npm package) |
| `project_api_keys.key_hash` | bcrypt-style (key prefix stored separately for lookup) |

Hashing is the right primitive here — we never need to recover the original value, only verify it.

### Threat model

| Compromise | Impact |
|---|---|
| **Postgres dump leaks** (e.g. backup stolen, replica exfiltrated) | All `encrypted_*` columns stay safe (attacker has ciphertext only). Unrelated columns leak as-is. |
| **`/opt/doable/.env` read** (e.g. server SSH'd, `doable` OS user compromised) | Everything decryptable — the attacker has both `ENCRYPTION_KEY` and DB password. |
| **`/etc/doable/.db_pass` read** (root compromise) | DB password leaked but `ENCRYPTION_KEY` is in a different file the attacker may or may not have. |

This is the standard envelope-encryption trade-off: encryption-at-rest in the DB only buys you protection from DB-only compromise, not full-host compromise. To upgrade: peer auth (eliminates DB password) + KMS-backed `ENCRYPTION_KEY` (eliminates the master key from disk). Both are non-trivial; neither is currently scheduled.

---

## 4. Other security knobs already in place

| Knob | State | Where |
|---|---|---|
| Postgres `listen_addresses = 'localhost'` | ✓ | enforced by setup-v3 |
| UFW: deny all inbound except SSH | ✓ | setup-v3 Phase 5 |
| nft egress jail (UID 10001-65000 routed through Squid) | ✓ | setup-v3 Phase 8 |
| Squid allowlist on outbound (npm/pypi/github/CDNs/AI providers) | ✓ | setup-v3 Phase 7 |
| systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `RestrictAddressFamilies`, `SystemCallFilter` | ✓ | setup-v3 Phase 11 |
| API runs as unprivileged `doable` OS user (not root) | ✓ | setup-v3 Phase 11 |
| Per-project sandbox UID drop (setpriv) | available | gated `DOABLE_DEV_UID_DISABLED` — disabled by default since API is unprivileged; would re-enable once sudo NOPASSWD chown is wired |
| Cloudflare Tunnel (no public ports beyond SSH) | ✓ | setup-v3 Phase 12 |
| JWT HS256 with 64-hex-char secret | ✓ | issuer = "doable", 15min access tokens |
| Session-revocation table (`refresh_tokens`) | ✓ | RLS-protected |
| CORS_ORIGINS allowlist | partial | env var honored by middleware; **known bug**: middleware reflects any Origin (audit finding from staging 2026-05-08, unfixed) |
| Per-API-key `allowed_origins` + `allowed_tools` | ✓ | enforced in connector-proxy |

---

## 5. Honest gaps (ordered by risk × effort)

| Gap | Risk | Effort to fix | Status |
|---|---|---|---|
| `CORS_ORIGINS` reflection in middleware | MEDIUM | small — fix the middleware to validate Origin against env value | open finding, see `testcases/99-runlog/FINDINGS.md` |
| RLS gap on `ai_providers`, `credit_balances`, `project_api_keys`, `workspace_members` | LOW-MEDIUM | 1 day — write migration, add `SET LOCAL` calls in route handlers | not scheduled |
| Postgres password on runtime path | LOW | small — flip `DOABLE_PG_PEER_AUTH=1` for new installs; for existing, manual `pg_hba.conf` edit | available, not default |
| `doable` role with single grant (DDL+DML) | LOW | medium — flip `DOABLE_PG_ROLE_SPLIT=1` for new installs; for existing, `REASSIGN OWNED` in maintenance window | available, not default |
| `ENCRYPTION_KEY` plain-text in `.env` | LOW (host-compromise = game over anyway) | high — KMS / TPM integration | not scheduled |
| `CREATEDB` privilege on runtime role | resolved | already revoked unconditionally as of `ae17c6b` | ✓ |
| Per-project sandbox UID drop disabled | LOW | medium — sudoers NOPASSWD chown rule + dev-server-start patch | not scheduled |

---

## 6. What an operator should tell their security reviewer

Use this verbatim if asked:

> Doable runs Postgres on loopback only, with the API process as an unprivileged OS user reading credentials from a `0600` `.env` file that only that user can access. Sensitive tables (users, projects, AI sessions/messages, OAuth connections, refresh tokens) have row-level security with per-request user-context. BYOK provider keys, OAuth tokens, project env vars, and SMTP creds are encrypted-at-rest in the DB via pgcrypto's pgp_sym_encrypt with a per-install ENCRYPTION_KEY. User passwords are Argon2id-hashed. External access goes through Cloudflare Tunnel — no public 5432/3000/4000/4001 ports. Outbound from sandboxed build processes is constrained by an nft egress jail + Squid allowlist.
>
> Known limitations: the master `ENCRYPTION_KEY` lives plain-text in the `.env` file alongside other secrets (host-level access ⇒ full compromise; standard envelope-encryption trade-off, not a regression). RLS coverage is partial; some multi-tenant tables (workspace_members, ai_providers, credit_balances) rely on application-layer authz only. CORS middleware has a known Origin-reflection bug under audit. Peer-auth via Unix socket (eliminates the DB password from the runtime path entirely) is available behind `DOABLE_PG_PEER_AUTH=1` but not the default.

---

## 7. Where to verify any of this yourself

| Claim | Where to check |
|---|---|
| File modes | `stat -c "%a %U:%G" /opt/doable/.env /etc/doable/.db_pass` on the server |
| RLS migration | `services/api/src/db/migrations/045_row_level_security.sql` |
| Encrypted columns | `services/api/src/db/migrations/{009,026,036,044,049}*.sql` |
| Encryption code | `packages/db/src/queries/{ai-settings-providers,connectors,env-vars,github}.ts` |
| Hashing code | `services/api/src/auth/*.ts` (Argon2 calls) |
| Postgres listen | `sudo grep listen_addresses /etc/postgresql/16/main/postgresql.conf` |
| nft egress | `sudo nft list ruleset` (or via `doable admin` → Server Config → nft sub-view) |
| Cloudflare Tunnel | `sudo cat /etc/cloudflared/config.yml` (or via Server Config → Cloudflared sub-view) |

`doable admin` (the all-in-one CLI from this session) surfaces most of these in the Server Config screen for live inspection without SSH-and-grep.
