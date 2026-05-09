# Enterprise readiness — what's left before selling to a Fortune 500

**Date:** 2026-05-09. Companion to `11-security-claims-audit.md` (security posture) and `10-postgres-hardening.md` (DB hardening). This doc captures the GAP between today's Doable install and what an enterprise procurement team will demand.

**Use this as:** the canonical "what's left" list for prioritization, contract-scoping, and answering "is Doable enterprise-ready?" honestly.

---

## TL;DR

Three bars, three answers:

| Bar | Verdict | Effort to reach it |
|---|---|---|
| **SMB pilot** (one company, internal tooling, one op on-call) | ✅ ready today | 0 — ship it |
| **Mid-market** (100-500 person co. self-hosting, contract attached) | ⚠️ ready with backups + monitoring + CORS fix + 2FA | 2-3 weeks |
| **Regulated enterprise** (SOC 2 / ISO 27001 / HIPAA / GDPR audit) | ❌ multiple gaps would fail audit | 3-6 months |
| **Multi-tenant SaaS at scale** (thousands of orgs per host) | ❌ architecture is single-tenant by design | rebuild scope |

---

## What's solid (would pass audit as-is)

| Control | Where |
|---|---|
| TLS everywhere (Cloudflare Universal SSL) | Cloudflare Tunnel; no public ports beyond SSH |
| Argon2id password hashing | `services/api/src/auth/*.ts` |
| `pgp_sym_encrypt` for BYOK keys / OAuth tokens / env vars / SMTP creds | migrations 009, 026, 036, 044, 049 |
| 0600 file perms + dedicated unprivileged OS user | `setup-v3/setup-server-v3.sh` Phase 1 + 4 |
| Per-install random `JWT_SECRET` / `ENCRYPTION_KEY` / `DB_PASS` (64-hex via `openssl rand`) | Phase 4 + .env render |
| UFW + nft egress jail + Squid allowlist (sandboxed builds can't exfiltrate) | Phase 5 + 7 + 8 |
| systemd hardening directives | Phase 11 |
| Partial RLS on 7 sensitive multi-tenant tables | migration 045 |
| Per-API-key allowlists (origins + tools) | `auto-api-key.ts`, `connector-proxy.ts` |
| CREATEDB privilege revoked from runtime DB role | setup-v3 commit `ae17c6b` |

---

## Yellow flags (adequate but improvable; don't block deployment)

| Item | Why it's yellow | Effort to upgrade |
|---|---|---|
| RLS gap on `workspace_members`, `ai_providers`, `credit_balances`, `project_api_keys` | App-layer authz only; defense-in-depth missing | 1 day (write migration + add `SET LOCAL` calls) |
| DB password on runtime path | Available behind `DOABLE_PG_PEER_AUTH=1`; default off | small (flip env var on new installs; manual `pg_hba.conf` for existing) |
| `ENCRYPTION_KEY` plain-text in `.env` | Standard envelope-encryption trade-off; KMS-backed would be the upgrade | high (KMS / TPM integration) |
| CORS middleware reflects any Origin | Real bug from staging audit; not exploited | small fix in middleware |
| Per-project sandbox UID drop disabled | Fail-closed because chown needs root + API runs unprivileged | medium (sudoers NOPASSWD chown rule + dev-server-start patch) |
| Session timeout / forced re-auth | JWT 15min access tokens exist; refresh-token revocation table exists; no policy-driven enforcement | small |
| Audit-log integrity | `audit_events` exists; no tamper-evident chain, no SIEM export | medium |

---

## Red flags (would block enterprise audit / procurement)

These are NOT hardening niceties. Each one independently would fail a security review at a regulated buyer.

### Tier 1 — table stakes, deal-breakers

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| R1 | **No HA / failover** — single Postgres, single API, single host | One disk / kernel panic = total outage. SLA impossible. **See "HA: not just a Postgres config" section below.** | 2-3 months full / 3-4 weeks cheap-and-cheerful |
| R2 | **No automated backups documented or scripted** | RPO/RTO undefined. SOC 2 CC7.5 requires evidence of restore tests. | 3-5 days |
| R3 | **No SSO / SAML 2.0** for end users | Enterprise IT requires SAML federation with Okta / Azure AD / Ping. Username+password + GitHub OAuth ≠ enterprise. | 2-3 weeks |
| R4 | **No 2FA / MFA** anywhere, including platform admins | Standard control. NIST 800-63B requires multi-factor for any privileged account. | 1-2 weeks (TOTP) |
| R5 | **No third-party penetration test** | Required for most enterprise procurement. | 4-6 weeks elapsed (test + remediation cycle); $15-50k vendor cost |
| R6 | **No SOC 2 / ISO 27001 evidence collection** | Buyers ask "show me the report." | 6-12 months for SOC 2 Type II |

### Tier 2 — observability + ops gaps

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| R7 | **No observability stack** — xray is local-only, no metrics / alerts / SLOs | Can't detect outages before customers do. No on-call possible. | 1-2 weeks (Prometheus + Grafana + Alertmanager + node_exporter + postgres_exporter) |
| R8 | **No incident response runbook** | First page of any vendor security questionnaire. | 1 week |
| R9 | **No zero-downtime deploys** — `systemctl restart doable.service` kicks platform offline ~10s | Maintenance windows required for every upgrade. | 1-2 weeks (rolling deploy via blue/green or per-service restart) |
| R10 | **No load testing / capacity planning published** | Procurement asks "how many concurrent users?" Today's answer is "we don't know." | 1 week (k6 / Locust setup + report) |

### Tier 3 — legal / compliance

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| R11 | **No DPA (Data Processing Agreement)** template | GDPR Article 28 requires it before any EU enterprise can sign. | 2-3 weeks (legal cost) |
| R12 | **No published privacy policy / data-residency claims** | Drives buyer decisions. | 1 week |
| R13 | **No audit log retention policy** | SOC 2 CC7.2: log integrity + retention required. | small (retention is mostly policy) |
| R14 | **No vendor security questionnaire response template** | Every enterprise sends a 200-question CAIQ / SIG / custom — answering each from scratch wastes weeks per deal. | 1-2 weeks (one-time) |

---

## HA — why it's not just a Postgres config

A common misconception worth addressing head-on: **Postgres replication is configurable; HA is not.**

### What Postgres alone gives you

`wal_level=replica` + `archive_mode=on` + a replica with `recovery_conf` → primary streams WAL to replica. ✅ **This part is just config.**

### What Postgres alone does NOT give you

| Layer | What's needed | Why Postgres alone can't |
|---|---|---|
| **Automatic failover** | External orchestrator: Patroni, repmgr, pg_auto_failover, Stolon — or managed Postgres (RDS / Neon / Supabase / Crunchy) | Postgres has no built-in leader election. |
| **Consensus / split-brain prevention** | Patroni needs etcd / Consul / ZooKeeper to decide which node is primary | Without consensus, two nodes can both think they're primary → corruption. |
| **Connection routing** | HAProxy / pgbouncer with failover scripts / virtual IP / managed-Postgres DNS | Clients have a fixed connection string — they don't know the primary moved. |
| **Sync vs async trade-off** | Decision: zero data loss (sync) but writes block on replica ack vs fast (async) but possible data loss on failover | Capacity-planning, not a config switch. |
| **App reconnection logic** | postgres-js needs reconnect-on-failover; in-flight transactions retried with idempotency keys | App code needs review. |

### What Doable specifically needs (beyond Postgres HA)

Postgres going HA without these is like adding a backup engine to a single-engine plane — the plane still falls if the cabin pressurization fails:

| Component | SPOF today | HA path |
|---|---|---|
| **API process** | one `tsx watch` instance | 2+ behind LB; JWT-only sessions OK; CORS / cookie config multi-host-compatible |
| **WebSocket service** | one process; Yjs y-doc state in memory | sticky sessions OR shared Yjs persistence backend (Redis / Postgres). Today's in-memory state loses on failover. |
| **Caddy** (publish hosting) | local `/sites/` dir | move publish artifacts to S3 / NFS, or run Caddy on every node |
| **Cloudflare Tunnel** | one cloudflared per host | run multiple replicas of same tunnel ID — Cloudflare load-balances. **This layer IS HA-friendly already**, just deploy multiple. |
| **Per-project dev sandboxes** | local UIDs, local disk, local TCP | sticky routing on `<env>-<slug>.doable.me` OR move to k8s pods (architecture change) |
| **`/opt/doable/.env` secrets** | per-host file | secrets store (Vault / AWS Secrets Manager / `consul-template`) before multi-host |

### Realistic effort

| Path | Time | Trade-off |
|---|---|---|
| **Managed Postgres (RDS / Neon / Supabase / Crunchy)** | 1-2 weeks | Solves Postgres HA entirely; ongoing $$; app layer still needs work |
| **Patroni + etcd + HAProxy on own infra** | 4-6 weeks | Full control; significant ops; on-call rotation needed |
| **Multi-host API + WS** (separate from Postgres path) | 3-4 weeks | LB + shared Yjs state |
| **Shared publish storage** | 1-2 weeks | Caddy becomes stateless |
| **Sandbox pinning + node-loss recovery** | 2-3 weeks (sticky routing) OR 6+ weeks (move to k8s) | Biggest unknown |
| **Full Doable HA** | **2-3 months** focused / **1-1.5 months** with managed Postgres | — |

### Cheap-and-cheerful version (~3 weeks)

For 80% of the value, do these in order:
1. Daily off-host Postgres backup with restore test (3 days)
2. Managed Postgres OR Patroni-on-2-nodes (1-2 weeks)
3. 2 API hosts + 2 WS hosts behind a load balancer (1 week)
4. 2 cloudflared replicas (a few hours — already supported)
5. Don't tackle sandbox-pinning yet; pin every project to a single host via sticky routing on the publish hostname

This doesn't solve zero-downtime upgrades or sandbox-node-loss. But it covers the most likely failure modes (host dies, disk fills, kernel panic) and gives you an SLA-able platform.

---

## Recommended order of operations

If you're targeting a regulated enterprise pilot in 90 days, do these in order:

### Days 0-7 (operational table stakes)
1. R2 — automated daily off-host backups with weekly restore test
2. R7 — Prometheus + Grafana + Alertmanager + alerts on: Postgres up, API health, WS health, disk %, load
3. CORS middleware fix (yellow flag, but small + immediate)
4. R8 — incident response runbook draft

### Days 7-21 (security controls)
5. R4 — TOTP 2FA for platform admins (and end users by feature flag)
6. R3 — SAML 2.0 (use a library — `@node-saml/passport-saml` or similar)
7. RLS gaps closed on the 4 yellow-flag tables
8. Flip `DOABLE_PG_PEER_AUTH=1` on new installs

### Days 21-45 (HA, the cheap version)
9. Move to managed Postgres (the "1-2 weeks" path)
10. 2x API + 2x WS behind LB
11. Sticky routing for publish hostnames
12. R9 — rolling restart (stop one, restart, then the other)

### Days 45-90 (compliance evidence)
13. R5 — third-party pen test scheduled + remediation
14. R11 — DPA template drafted (with legal)
15. R12 — privacy policy + data residency
16. R14 — CAIQ / SIG response template

### Beyond 90 (long-tail)
17. R6 — SOC 2 Type II audit (6-12 months elapsed)
18. KMS-backed `ENCRYPTION_KEY` (lower priority once peer auth + backups + obs are in place)
19. Full sandbox HA / k8s migration (only if you hit single-host capacity limits)

---

## What an operator should tell their security reviewer

> Doable today is appropriate for SMB internal-tooling and mid-market self-hosted deployments. We have real security controls (TLS, encrypted-at-rest creds, Argon2 passwords, RLS on sensitive tables, hardened systemd, network isolation via Cloudflare Tunnel + nft egress jail). We do not yet have HA, automated backups, SAML SSO, 2FA, or a third-party pen-test report — these are on the roadmap with concrete sequencing and effort estimates in `servertodo/12-enterprise-readiness.md`. We're transparent about the gaps so you can make an informed decision; don't ask us to claim SOC 2 readiness because we're not there yet, and we'd rather earn your trust by closing gaps in public than by spinning marketing around them.

---

## Where to verify any of this yourself

| Claim | Where to check |
|---|---|
| HA / replication setup | `setup-v3/setup-server-v3.sh` Phase 4 — single-node config; replica setup is undocumented because not built. |
| Backups | `cron -l` on the server — empty for Doable. No `pg_dump` schedule shipped. |
| Observability | `ss -tlnp \| grep -E '(9090\|3030)'` on the server — no Prometheus / Grafana ports listening. |
| 2FA | `grep -r "totp\|2fa\|mfa" services/api/src/auth/` — empty. |
| SAML | `grep -r "saml" services/api/src/auth/ packages/` — empty. |
| Audit log retention | `psql doable -c "SELECT min(created_at), max(created_at), count(*) FROM audit_events;"` — no retention rule. |

`doable admin` (the new CLI) gives you the live ops view without SSH-and-grep, but it doesn't paper over what's not built — it surfaces what IS built and the rest is gaps.
