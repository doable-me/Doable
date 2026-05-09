# BUG-CORPUS-RT-001 — /runtime/* and /admin/runtime endpoints not exposed (404)

**Severity:** low (gap)
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus-16-26 runner, RUN-CORPUS-16-26 (2026-05-09)

## Repro
```
GET /runtime/status
GET /runtime/vite
GET /admin/runtime
Authorization: Bearer <qa-owner>   (qa-owner is platform admin)
```

## Actual
All three return HTTP 404.

## Expected (per testcases/25-runtime)
- TC-RUNTIME-CAPACITY-001 — engines capacity gauge readable from API.
- TC-RUNTIME-VITE-001 — vite server count / per-project state.
- TC-RUNTIME-SYSTEMD-001 — admin-only systemd status.

## Analysis
No HTTP route surface for the engines/vite/systemd telemetry. The platform admin TUI (doable-admin in `tools/admin-cli`) reads this directly from the host, not via API. If the corpus is supposed to drive the admin UX in-browser, the API needs read-only proxies for these.

## Fix recommendation
Add a thin `services/api/src/routes/admin-runtime.ts` (platform-admin only) that exposes:
- `GET /admin/runtime/engines` → MAX_CONCURRENT_ENGINES + LRU snapshot.
- `GET /admin/runtime/vite` → vite-jail per-project status.
- `GET /admin/runtime/systemd` → `systemctl status doable cloudflared` parsed JSON.

Or mark the TCs as `BLOCKED — admin-TUI only, no HTTP surface yet`.

## Evidence
- `testcases/evidence/env1/TC-RT-CAPACITY-status.body`
- `testcases/evidence/env1/TC-RT-VITE-001.body`
- `testcases/evidence/env1/TC-RT-SYSTEMD-001.body`
