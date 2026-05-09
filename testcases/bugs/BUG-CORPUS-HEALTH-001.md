# BUG-CORPUS-HEALTH-001 — /health/db requires auth (anti-pattern for liveness probe)

**Severity:** low (blocks ops monitoring)
**Env:** env1 / zantaz

## Repro
```
GET /health/db        (no Authorization)
```

## Actual
HTTP 401 — `{"error":"Missing or invalid Authorization header"}`

## Expected
A health/liveness endpoint should be unauthenticated (or at most behind a fixed bearer / IP allowlist). Forcing JWT auth means external probes (Cloudflare/uptime/Caddy) can't use it.

## Fix recommendation
Either:
- Move DB health to `/health/db` and skip auth middleware (matches `/health` which works).
- Or rename to `/admin/health/db` so the role of the route is explicit.

## Evidence
`testcases/evidence/env1/TC-API-HEALTH-002.body`
