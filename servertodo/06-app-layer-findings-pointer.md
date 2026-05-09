# 06 — App-layer findings (pointer to existing audit)

**Severity:** see linked audit (1 CRIT, 6 MED, 4 LOW, 1 INFO)

tl;dr: The app-layer auth, crypto, and connector-proxy audit already exists at `secureIntegrationsPRD/07-security-findings.md` (12 findings, all Open as of 2026-05-07). This file points there so the host-level docs in `servertodo/` stay focused.

## Where the findings live

- `secureIntegrationsPRD/07-security-findings.md` — 12 findings audited 2026-05-07 by code read. All status: Open.

## Why this is a separate document

- `servertodo/01-05` cover host, process, and sandbox-level concerns: file permissions, service users, browser hardening, egress, dovault spawn wiring.
- `secureIntegrationsPRD/07-security-findings.md` covers app-layer concerns: auth tokens, JWT secrets, connector-proxy CORS, MCP cache fallthrough, allowlist defaults.
- Different fix venues, different reviewers — host fixes touch systemd units and `.env`; app fixes touch route handlers and middleware.
- They compound. Example: Finding 01 in this folder (`.env` world-readable) makes Findings 02 and 03 in the linked audit (PROJECT_JWT_SECRET dev fallback, shared JWT_SECRET) instantly exploitable from inside any sandbox UID. Read both together.

## Highlights to read first

- Finding #1 CRIT — token mint endpoint unauthenticated at `services/api/src/routes/preview-proxy/proxy-handler.ts:158-194`. Blocks public hosted SaaS launch. Anyone reaching the preview-proxy host can mint a token for any project.
- Finding #2 MED — `PROJECT_JWT_SECRET` hardcoded dev fallback at `services/api/src/routes/connector-proxy.ts:58-61`. If env is missing in prod, the fallback silently signs tokens with a known constant.
- Finding #3 MED — `PROJECT_JWT_SECRET` defaults to the value of `JWT_SECRET`. Single-secret leak compromises both trust domains (user sessions AND project-to-connector). Cross-link to `servertodo/01-env-secrets.md` — `.env` perms make this trivial to harvest from inside the sandbox today.
- Finding #4 MED — any workspace member can mint a server-tier API key at `services/api/src/routes/projects/api-keys.ts:43-63`. No role check; "viewer" can mint a key with full write scope.

## Recommended reading order

1. `servertodo/00-README.md` (this folder's index)
2. `servertodo/01-env-secrets.md`
3. `servertodo/02-services-as-root.md`
4. `servertodo/03-puppeteer-hardening.md`
5. `servertodo/04-egress-jail.md`
6. `servertodo/05-dovault-spawn-wiring.md`
7. `secureIntegrationsPRD/07-security-findings.md`

## References

- `secureIntegrationsPRD/07-security-findings.md` (the audit doc — all 12 findings with file:line citations and proposed fixes)
- `secureIntegrationsPRD/00-overview.md` (design context for the secure integrations work)
