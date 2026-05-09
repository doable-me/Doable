# 10 — PostgreSQL hardening

Status: **doc-only — diffs not yet applied to `setup-v3/setup-server-v3.sh`**.
Owner: platform / setup-server.
Cross-refs: `01-env-secrets.md` (.env perms), `02-services-as-root.md` (run-as user),
`secureIntegrationsPRD/07-security-findings.md`.

This document audits the postgres security posture installed by
`setup-v3/setup-server-v3.sh` (Phase 4, lines 199–245) and proposes a layered
remediation plan ordered by impact-to-effort ratio. Nothing here has been
applied — the diffs below are the exact patches a follow-up commit should
make against the post-rename path `setup-v3/setup-server-v3.sh`.

---

## 1. Current state

What the v3 installer does today (Phase 4 / lines 199–245):

| Item | Value |
|------|-------|
| Postgres version | 16 (`postgresql-16` from Ubuntu archive) |
| `listen_addresses` | rewritten to `'localhost'` in `postgresql.conf`, service restarted |
| Password generation | `openssl rand -hex 32` on first install (64 hex chars) |
| Password file | `/etc/doable/.db_pass`, mode `0600`, owner `root:root`, parent dir `0700` |
| Idempotent reuse | reruns reuse the same password; if the role exists, password is re-synced via `ALTER USER` |
| Role | single role `doable` |
| Role privileges | `WITH PASSWORD '<hex>' CREATEDB` |
| Database | `doable`, owner `doable` |
| Extensions | `pgcrypto`, `vector`, `pg_trgm` (created as superuser, idempotent) |
| Auth method | whatever Ubuntu's stock `pg_hba.conf` provides for PostgreSQL 16 — typically `peer` for `local`, `scram-sha-256` for `host 127.0.0.1/32` and `::1/128` |
| Connection string | `DATABASE_URL=postgres://doable:<hex>@localhost:5432/doable` baked into `/opt/doable/.env` (mode `0600`, owner `doable:doable`) |
| Used by | API (DML), migrations (DDL) — same role for both |
| Public exposure | none — UFW denies inbound, no Cloudflare Tunnel ingress to 5432 |

Compared to the legacy `setup-server.sh`, v3 is already a clear upgrade —
legacy defaults `DB_PASS` to the literal string `doable` (line 76, 99–100)
and prompts the operator interactively. v3 always randomizes.

---

## 2. Findings (severity-ranked)

### F1. **MEDIUM** — `CREATEDB` privilege on the runtime role is excessive
Line 233:

```bash
sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"
```

The API never calls `CREATE DATABASE` at runtime. `CREATEDB` is needed only
during initial setup (and even there, only because `setup-server.sh` does
not run `CREATE DATABASE` as superuser… except it does, on line 238). So
`CREATEDB` is dead weight. A SQL injection or compromised role could spin
up arbitrary databases — noisy, but real privilege creep.

### F2. **MEDIUM** — Single role for migrations (DDL) and runtime (DML)
The same `doable` role runs `migrate.ts` (which executes `CREATE TABLE`,
`ALTER TABLE`, `CREATE INDEX`, etc.) and the live API (which only needs
`SELECT/INSERT/UPDATE/DELETE`). A SQL injection in any runtime endpoint
inherits full DDL on the schema — including `DROP TABLE users CASCADE`.

Industry baseline is to split into:
- **`doable_admin`** — owner of all objects, used only by `migrate.ts` /
  `pnpm migrate` / one-off psql sessions.
- **`doable`** — `LOGIN` only, with `SELECT/INSERT/UPDATE/DELETE` granted
  by `doable_admin` after each migration.

### F3. **LOW** — Plain-text password on disk
`/etc/doable/.db_pass` and the embedded copy in `/opt/doable/.env` both
contain the password in clear. With `0600 root:root` and `0600 doable:doable`
respectively — and the `setpriv` self-check at line 662 confirming sandbox
UID 10001 cannot read it — this is **industry-standard** for an unattended
deploy. Realistic threat model says the upgrade is **peer auth via Unix
socket**, which removes the password from the connection path entirely on
the loopback (the only path we use).

Trade-off: peer auth requires
1. a `pg_hba.conf` entry,
2. the API process to run as the `doable` OS user (already true in v3),
3. updating `DATABASE_URL` to the socket form (no password component).

`migrate.ts` either also runs as the `doable` (or `doable_admin`) OS user
and uses peer, or keeps password auth for the brief admin-role connection.

### F4. **LOW** — No read-only role for analytics / observability
A future "platform admin" view, ad-hoc reporting query, or OpenTelemetry
metric scraper would today have to log in as `doable` and inherit DML.
Adding a `doable_readonly` role with only `SELECT` is cheap insurance.

### F5. **LOW** — Manual password rotation only
Rotating `/etc/doable/.db_pass` requires
1. `ALTER USER doable PASSWORD '<new>'`,
2. rewriting `DATABASE_URL` in `/opt/doable/.env`,
3. restarting all three doable services.

The auto-rotation flow is under construction in `doable-cli admin`. Until
that ships, operators must rotate by hand. Lowest priority.

---

## 3. Recommended changes

Diffs are unified-format against `setup-v3/setup-server-v3.sh`. Apply
in order — each step is independently shippable.

### 3a. Revoke `CREATEDB` (smallest change, biggest win)

Removes dead privilege on every fresh install AND idempotently strips it
from existing installs on rerun. **No data migration cost. No connection
string change. Zero operator action.**

```diff
--- a/setup-v3/setup-server-v3.sh
+++ b/setup-v3/setup-server-v3.sh
@@ -230,11 +230,17 @@ DB_PASS="$(cat "${DB_PASS_FILE}")"

 # Idempotent role + database creation.
 sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1 \
-  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"
+  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}';"
 # Always sync the password to the random value (in case rerun and previous runs left a default).
 sudo -u postgres psql -c "ALTER USER doable WITH PASSWORD '${DB_PASS}';" >/dev/null
+# Revoke CREATEDB on rerun in case a prior install of this script granted it.
+# The runtime API never creates databases; the script itself uses the postgres
+# superuser for the one-time CREATE DATABASE below.
+sudo -u postgres psql -c "ALTER USER doable NOCREATEDB;" >/dev/null

 sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='doable'" | grep -q 1 \
   || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable;"
```

**Why this is safe on rerun:** the script's own `CREATE DATABASE doable
OWNER doable` (line 238) is run as the `postgres` superuser, not as
`doable`, so removing `CREATEDB` from `doable` has no effect on the
installer's own behaviour.

---

### 3b. Split `doable_admin` (DDL) from `doable` (DML)

Heavier change — touches both the installer and `services/api/src/db/migrate.ts`.

#### 3b.i. Installer changes

```diff
--- a/setup-v3/setup-server-v3.sh
+++ b/setup-v3/setup-server-v3.sh
@@ -218,16 +218,33 @@ else
   warn "Could not locate postgresql.conf — verify listen_addresses manually."
 fi

-# Random DB password, persisted to a 600 file readable only by root for the
-# .env render step below. Re-runs reuse the same password to keep the DB usable.
+# Two random DB passwords, persisted to 600 files readable only by root.
+# .db_pass        — runtime role (doable, DML only)
+# .db_admin_pass  — admin role  (doable_admin, DDL only, used by migrate.ts)
 DB_PASS_FILE="/etc/doable/.db_pass"
+DB_ADMIN_PASS_FILE="/etc/doable/.db_admin_pass"
 install -d -o root -g root -m 0700 "$(dirname "${DB_PASS_FILE}")"
 if [ ! -s "${DB_PASS_FILE}" ]; then
   umask 077
   openssl rand -hex 32 > "${DB_PASS_FILE}"
   chmod 0600 "${DB_PASS_FILE}"
 fi
+if [ ! -s "${DB_ADMIN_PASS_FILE}" ]; then
+  umask 077
+  openssl rand -hex 32 > "${DB_ADMIN_PASS_FILE}"
+  chmod 0600 "${DB_ADMIN_PASS_FILE}"
+fi
 DB_PASS="$(cat "${DB_PASS_FILE}")"
+DB_ADMIN_PASS="$(cat "${DB_ADMIN_PASS_FILE}")"

-# Idempotent role + database creation.
+# Idempotent role + database creation.
+#
+# Two roles:
+#   doable_admin — owns the database; used by migrate.ts (DDL).
+#   doable       — runtime DML only; granted by doable_admin after each migration.
+sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='doable_admin'" | grep -q 1 \
+  || sudo -u postgres psql -c "CREATE USER doable_admin WITH PASSWORD '${DB_ADMIN_PASS}';"
+sudo -u postgres psql -c "ALTER USER doable_admin WITH PASSWORD '${DB_ADMIN_PASS}';" >/dev/null
+
 sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1 \
-  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"
-# Always sync the password to the random value (in case rerun and previous runs left a default).
+  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}';"
 sudo -u postgres psql -c "ALTER USER doable WITH PASSWORD '${DB_PASS}';" >/dev/null
+sudo -u postgres psql -c "ALTER USER doable NOCREATEDB;" >/dev/null

 sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='doable'" | grep -q 1 \
-  || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable;"
+  || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable_admin;"

 # Extensions (require superuser).
 for ext in pgcrypto vector pg_trgm; do
   sudo -u postgres psql -d doable -c "CREATE EXTENSION IF NOT EXISTS ${ext};" >/dev/null 2>&1 || true
 done
+
+# Default-grant DML on all current and future tables to the runtime role.
+# After each migration, migrate.ts must explicitly re-run grants for new
+# tables (the ALTER DEFAULT PRIVILEGES below covers tables created BY
+# doable_admin only).
+sudo -u postgres psql -d doable <<'GRANTSQL'
+GRANT CONNECT ON DATABASE doable TO doable;
+GRANT USAGE ON SCHEMA public TO doable;
+GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doable;
+GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO doable;
+ALTER DEFAULT PRIVILEGES FOR ROLE doable_admin IN SCHEMA public
+  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doable;
+ALTER DEFAULT PRIVILEGES FOR ROLE doable_admin IN SCHEMA public
+  GRANT USAGE, SELECT ON SEQUENCES TO doable;
+GRANTSQL
```

And in the `.env` render block, add a separate `DATABASE_URL_ADMIN`:

```diff
--- a/setup-v3/setup-server-v3.sh
+++ b/setup-v3/setup-server-v3.sh
@@ -528,6 +528,9 @@ ENVEOF
 # Database
 DATABASE_URL=postgres://doable:${DB_PASS}@localhost:5432/doable
+# Admin URL — used ONLY by services/api/src/db/migrate.ts.
+# Do NOT use DATABASE_URL_ADMIN at runtime. The API process must use DATABASE_URL.
+DATABASE_URL_ADMIN=postgres://doable_admin:${DB_ADMIN_PASS}@localhost:5432/doable
 DATABASE_POOL_SIZE=20
```

#### 3b.ii. `services/api/src/db/migrate.ts` change (sketch — not part of this diff)

```ts
const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_ADMIN required for migrations');
const pool = new Pool({ connectionString: url });
```

The fallback to `DATABASE_URL` keeps dev (local Postgres without the split)
working unchanged.

#### 3b.iii. Cost: existing tables are owned by `doable`, not `doable_admin`

This is the catch. On a server already deployed with the single-role
schema, every table is owned by `doable`. After the split, `doable_admin`
cannot `ALTER TABLE` them. Two remediations:

**Option A (clean):** drop and reinstantiate from migrations. Only viable
on fresh installs / non-production envs.

**Option B (in-place):**

```sql
-- Run as postgres superuser on the existing live db:
REASSIGN OWNED BY doable TO doable_admin;
-- Then re-grant DML to the runtime role (covered by the GRANTSQL block above).
```

The `REASSIGN OWNED` approach is documented and idempotent. Document this
clearly in the operator checklist (Section 5 below).

---

### 3c. Switch to peer auth on the Unix socket

Strictly the strongest auth posture for a single-host deploy: the kernel
authenticates the connecting OS user, no password ever touches the wire,
no password in `.env`.

#### 3c.i. `pg_hba.conf` change

Find via `find /etc/postgresql -name pg_hba.conf`. The default Ubuntu PG16
file already has a `local all all peer` line, but the `doable` role needs
its own explicit entry to map. Add:

```
# servertodo/10 — peer auth for the Doable runtime + admin roles.
local   doable          doable                                  peer
local   doable          doable_admin                            peer
# Keep the host entries for any tooling that connects via TCP loopback
# (eg. tunnelled psql from a laptop):
host    doable          doable          127.0.0.1/32            scram-sha-256
host    doable          doable          ::1/128                 scram-sha-256
host    doable          doable_admin    127.0.0.1/32            scram-sha-256
host    doable          doable_admin    ::1/128                 scram-sha-256
```

For peer auth to map, **the OS user MUST equal the postgres role name**.
The v3 installer already creates an OS user `doable` (line 137), so that
half is free. For `doable_admin`, either:
- create a matching OS user (cheap, but adds another system account), OR
- only let `doable_admin` use TCP+password (the `host` entry above) and
  leave migrations using password auth.

The pragmatic recommendation is the second: peer for the hot runtime
path, password for the rare DDL path. That keeps the security win where
it matters (every API request) without inventing a new OS user.

#### 3c.ii. Installer diff

```diff
--- a/setup-v3/setup-server-v3.sh
+++ b/setup-v3/setup-server-v3.sh
@@ -218,6 +218,29 @@ else
   warn "Could not locate postgresql.conf — verify listen_addresses manually."
 fi

+# servertodo/10 — peer auth for the doable runtime role on the Unix socket.
+PG_HBA="$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1 || true)"
+if [ -n "${PG_HBA}" ]; then
+  if ! grep -qE '^local[[:space:]]+doable[[:space:]]+doable[[:space:]]+peer' "${PG_HBA}"; then
+    # Insert before the catch-all 'local all all' line.
+    sed -i '/^local[[:space:]]\+all[[:space:]]\+all/i\
+# servertodo/10 — Doable peer auth\
+local   doable          doable                                  peer\
+local   doable          doable_admin                            peer
+' "${PG_HBA}"
+    systemctl reload postgresql
+    ok "pg_hba.conf: added peer-auth entries for doable / doable_admin"
+  else
+    ok "pg_hba.conf: peer-auth entries already present"
+  fi
+else
+  warn "Could not locate pg_hba.conf — verify peer auth manually."
+fi
+
```

And in the `.env` render block:

```diff
--- a/setup-v3/setup-server-v3.sh
+++ b/setup-v3/setup-server-v3.sh
@@ -528,8 +528,11 @@ ENVEOF
-# Database
-DATABASE_URL=postgres://doable:${DB_PASS}@localhost:5432/doable
+# Database — peer auth via Unix socket (no password on the wire/in env).
+# The API runs as the OS user 'doable', which postgres trusts via pg_hba.conf
+# 'local doable doable peer'. See servertodo/10-postgres-hardening.md.
+DATABASE_URL=postgres:///doable?host=/var/run/postgresql
+# Admin URL keeps password auth (used only by services/api/src/db/migrate.ts).
+DATABASE_URL_ADMIN=postgres://doable_admin:${DB_ADMIN_PASS}@localhost:5432/doable
 DATABASE_POOL_SIZE=20
```

`/var/run/postgresql` is the standard Ubuntu socket directory. node-postgres
parses the `host=...` query parameter as the socket dir.

#### 3c.iii. Trade-offs (be honest)

- **Pro:** the runtime password is no longer in `.env` at all. Even a
  read-`.env` exfil yields nothing connectable to postgres.
- **Pro:** migrating between hosts is cleaner (no per-host secret on the
  hot path).
- **Con:** breaks dev environments where the Doable API runs on macOS or
  Windows or doesn't run as OS user `doable`. The server-side installer
  is the only place where peer is universally safe — keep
  `DATABASE_URL=postgres://doable:<pw>@localhost:5432/doable` as the
  documented dev default in `apps/web/.env.example` etc.
- **Con:** any out-of-process tool that wanted to connect as `doable`
  (one-off psql session, a metrics exporter) must run as the `doable`
  OS user (`sudo -u doable psql doable`). Document this clearly.
- **Con:** if `migrate.ts` is ever invoked on the server NOT as the
  `doable_admin` OS user, the TCP+password fallback is what saves it.
  Don't remove the `host ... scram-sha-256` lines.

---

### 3d. Add a read-only role (optional, low cost)

After the migrations land, grant a `doable_readonly` role for ad-hoc
queries / future observability:

```diff
+sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='doable_readonly'" | grep -q 1 \
+  || sudo -u postgres psql -c "CREATE ROLE doable_readonly NOLOGIN;"
+sudo -u postgres psql -d doable <<'GRANTSQL'
+GRANT CONNECT ON DATABASE doable TO doable_readonly;
+GRANT USAGE ON SCHEMA public TO doable_readonly;
+GRANT SELECT ON ALL TABLES IN SCHEMA public TO doable_readonly;
+ALTER DEFAULT PRIVILEGES FOR ROLE doable_admin IN SCHEMA public
+  GRANT SELECT ON TABLES TO doable_readonly;
+GRANTSQL
```

Then operators create per-purpose login roles that `INHERIT` from
`doable_readonly` — for example `analytics_jane LOGIN PASSWORD '…'
INHERIT`. No change needed to the runtime API.

---

## 4. What's already deployed safely

Don't disturb what's already working — the v3 installer gets these right:

- `0600 root:root` on `/etc/doable/.db_pass` (line 227)
- `0600 doable:doable` on `/opt/doable/.env` (line 646)
- `listen_addresses = 'localhost'` enforced + service restarted (lines 207–214)
- 64-hex-char random password per install (line 226)
- Sandbox UID 10001 verified to be unable to read `.env` at install time
  (lines 658–665) — this transitively protects the embedded password
- No public 5432 — UFW + Cloudflare Tunnel ensure the only external entry
  point is HTTPS to Caddy

These do not need changes from this document.

---

## 5. What the operator should do TODAY (existing install)

For an environment already running the current v3 installer (single
`doable` role with `CREATEDB`), here is the no-downtime fix sequence.
Run via `doable admin --remote` once the upcoming SQL escape hatch ships,
or via direct `psql` until then.

### 5.1. Drop `CREATEDB` (zero risk, do this first)

```bash
sudo -u postgres psql -c "ALTER USER doable NOCREATEDB;"
```

Verify:
```bash
sudo -u postgres psql -c "SELECT rolname, rolcreatedb FROM pg_roles WHERE rolname='doable';"
# rolcreatedb should be 'f'
```

No service restart needed. Privilege change applies to new connections.

### 5.2. (Future) Rotate the password

Once `doable-cli admin --remote rotate-db-password` ships, use it. Until
then, the manual sequence is:

```bash
NEW_PASS=$(openssl rand -hex 32)
sudo -u postgres psql -c "ALTER USER doable WITH PASSWORD '${NEW_PASS}';"
echo "${NEW_PASS}" | sudo tee /etc/doable/.db_pass >/dev/null
sudo chmod 0600 /etc/doable/.db_pass
sudo sed -i "s|^DATABASE_URL=postgres://doable:[^@]*@|DATABASE_URL=postgres://doable:${NEW_PASS}@|" /opt/doable/.env
sudo systemctl restart doable-api doable-web doable-ws
```

### 5.3. (Future) Split into doable_admin

Plan a maintenance window. On the live database:

```sql
CREATE USER doable_admin WITH PASSWORD '<new-random-hex>';
REASSIGN OWNED BY doable TO doable_admin;
-- doable now has zero ownership; re-grant DML:
GRANT CONNECT ON DATABASE doable TO doable;
GRANT USAGE ON SCHEMA public TO doable;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doable;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO doable;
ALTER DEFAULT PRIVILEGES FOR ROLE doable_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doable;
ALTER DEFAULT PRIVILEGES FOR ROLE doable_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO doable;
```

Then add `DATABASE_URL_ADMIN` to `/opt/doable/.env`, point `migrate.ts` at
it, and verify `pnpm migrate` still applies cleanly.

### 5.4. (Future) Switch to peer auth

Hardest of the four to do live without a brief outage. Plan:

1. Add the peer-auth lines to `pg_hba.conf` (see 3c.i).
2. `systemctl reload postgresql` (does NOT drop existing connections).
3. Update `DATABASE_URL` in `/opt/doable/.env` to
   `postgres:///doable?host=/var/run/postgresql`.
4. `systemctl restart doable-api doable-web doable-ws` (drops connections,
   reconnects via socket peer).
5. Smoke test: `curl -s http://127.0.0.1:4000/health` and a real auth flow.

If anything goes wrong, revert step 3 (the password is still valid — the
only thing that changed is which auth method the URL requests).

---

## 6. Out of scope for this document

- TLS to postgres (`hostssl`) — pointless on the loopback path; only
  matters if 5432 is ever cross-host, which it shouldn't be.
- pgbouncer / connection pooling at the DB layer — orthogonal performance
  work, not security.
- Row-level security policies — application-layer authz is the right
  layer for tenant isolation in Doable today.
- Backup encryption — covered separately (`servertodo/` does not yet have
  a backup hardening doc; track separately if/when it lands).
