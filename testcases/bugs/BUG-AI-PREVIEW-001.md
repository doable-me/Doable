# BUG-AI-PREVIEW-001 — Live preview is a stub: dev-server never spawns; "Compiling…" messages are synthetic

**Severity:** CRITICAL — the entire end-user value proposition (see your generated app live) is non-functional on this build.
**Found:** 2026-05-10 by lead via TC-AI-CHAT-PREVIEW-COUNTER-001 against env1 install.
**Test:** TC-AI-CHAT-PREVIEW-E2E.md / TC-AI-CHAT-PREVIEW-COUNTER-001 — see `testcases/05-ai-chat/TC-AI-CHAT-PREVIEW-E2E.md`.

## Reproduction (irrefutable evidence)

1. POST `/projects` → fresh project (e.g. `8277e3e1-248e-4cf0-ba04-a140fe9ef5e4`).
2. POST `/projects/:id/chat` with prompt: *Build a counter app with +1, -1, Reset buttons; useState; text-6xl …*
3. Stream the SSE response — observe the phase events in evidence file `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.sse.log`:
   - `phase:scaffolding` → `Creating project files…` → `Installing dependencies…` → `Dependencies installed (9s)`
   - `phase:dev-server` → `Starting dev server…`
   - `phase:dev-server` → `Compiling project… (3s)` → `(6s)` → `(9s)` → `(18s)` → `(21s)`
   - `tool_call edit_file path=src/App.tsx` ← AI writes a correct counter app
   - `tool_result edit_file success:true`
   - `version_created sha=ab8a2a0723…`
   - `phase:checking` → `phase:complete` → `[DONE]`
4. SSE reports total=17 057 ms (MiniMax-M2.7-highspeed, 604 completion tokens).
5. **Now check reality on the server:**
   - `find /opt/doable/services/api/projects/<id> -name App.tsx` → file present, content correct (counter app exactly as requested).
   - `pgrep -af vite` → **0 matches**.
   - `ss -tlnp | grep 5173` → **no listener**.
   - `GET /admin/dev-servers` → `{"servers":[],"summary":{"total":0,"alive":0,"ready":0}}`.
   - `GET /preview-proxy/<id>/` → 404 (no upstream registered).
   - No `.dev-server.pid` or `.log` files in the project directory.

## What this means

The SSE phase events `dev-server` / `Compiling project… (Xs)` are **synthetic** — emitted regardless of whether the dev-server actually started. The end user sees encouraging progress text but no preview will ever render. The "Live Preview" pane in the editor will permanently spin on `Preparing live preview…` / `Downloading packages…`.

Tested on env1 (single-tenant client) but the affected code is in the platform itself — every client install is impacted.

## Suspected code path (root cause to find + fix)

- The dev-server spawn flow likely lives in `services/api/src/runtime/` or `services/api/src/dev-server/` (or wherever the systemd-backed dovault sandbox spawns project processes).
- The Path C sandbox + sudoers wrapper (`servertodo/13-sandbox-path-c.md`) was the most recent infrastructure touch. Likely candidates:
  - The sandbox-spawn helper is failing silently (returns success without actually executing)
  - The dev-server is being spawned but its registration into the in-memory `devServerRegistry` is broken
  - The systemd transient-unit creation is not happening because of a missing env or path
  - The `phase:dev-server` SSE events are wired to a timer or counter, not the actual process state
- The `/admin/dev-servers` endpoint reads from the in-memory registry (`servertodo/15-egress-policy-shift.md` mentions runtime accounting); since it returns empty, registration never occurs.

## Acceptance for fix

- After SSE `[DONE]`, polling `GET /admin/dev-servers` returns at least one server with `projectId == <our id>` and `status == ready`.
- `GET /preview-proxy/<id>/` returns HTTP 200 with HTML body that contains the rendered counter app within 90 s of `[DONE]`.
- Re-running `bash testcases/evidence/run-chat-preview-e2e.sh` exits 0 with all DOM checks PASS:
  - +1 / -1 / Reset buttons present
  - displays `0`
  - uses `text-6xl` and `flex` classes
  - HTML body > 1 KB

## Evidence
- `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.sse.log` (full SSE)
- `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.parsed.log` (phase line offsets, usage, first events)
- `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.preview.html` (empty — preview never reachable)
- `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.dev-servers.json` (empty servers array)
- `testcases/evidence/env1/chat-preview/8277e3e1-248e-4cf0-ba04-a140fe9ef5e4.timing.log`

## Why this MUST be a root-cause fix, not a UI patch
A spinner or banner saying "preview unavailable" would be a workaround. The actual fix must restore the spawn path: the dev-server must really start, register, and serve. Everything downstream (publish, deploy, screenshots, design-comments anchors) depends on a real running preview.
