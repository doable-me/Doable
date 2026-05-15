# Editor & WebSocket — verify 2026-05-15

**Environment:** https://dev.doable.me, https://dev-api.doable.me, wss://dev-ws.doable.me
**Auth:** qa-owner@doable.test (fresh JWT, 14 400s expiry)
**Evidence dir:** `testcases/evidence/dev/verify-2026-05-15/editor-ws/`

## Bug verification

| Bug ID | Title | Expected | Actual | Status |
|---|---|---|---|---|
| BUG-EDITOR-002 | `/internal/presence/:id` unauthenticated | 401/403 without secret | 403 Forbidden | PASS |
| BUG-EDITOR-002 follow-up | `/internal/collab-active/:id` unauthenticated (same class) | 401/403 without secret | 200 OK (LEAKS) → fixed in this PR; after fix: 403 | OPEN → FIX SHIPPED ON BRANCH (`fix/bug-editor-002-collab-active`) |
| BUG-WS-001 | `/workspaces/:id` malformed UUID → 500 | 400 invalid id | 400 `{"error":"Invalid workspace id"}` | PASS |
| BUG-WS-003 | `/projects/shared` DISTINCT crash → 502 | 200 deduped list | 200 OK | PASS |
| BUG-WSI-001 | `room.join` no ack within 5s | `room:joined` event with members | `room:joined` at t=1215ms (200ms after open) | PASS |
| BUG-AUTH-017 | WS CSWSH from `Origin: https://evil.example` | 403/blocked | 403 Forbidden, body "Forbidden origin" | PASS |
| WS upgrade no token | reject | 4001 "Missing token" close after 101 | PASS |
| BUG-CORPUS-EDT-001 | TC mount path doc drift `/editor/projects/...` | mount-at-root noted | `services/api/src/routes.ts` mounts editor at `/`; live URL is `/projects/:id/files` (200) | PASS (doc-only) |
| BUG-CORPUS-EDT-002 | `POST /projects/:id/files` path traversal | 400 invalid_path | 400 `{"error":"invalid_path","message":"path traversal segments (..) are not allowed"}` (POST + DELETE) | PASS |

## Sampled testcases (testcases/04-editor + 13-websocket)

| TC | Method | HTTP | Notes |
|---|---|---|---|
| TC-EDITOR-FILES-005 PUT+GET roundtrip | PUT then GET `/projects/:id/files/tc-sample.txt` | 200 / 200 | Content roundtrips |
| TC-EDITOR-MONACO tree | GET `/projects/:id/files` | 200 | Tree returns |
| TC-EDITOR-PATH-TRAVERSAL POST | `path=../../escape.txt` | 400 | invalid_path |
| TC-EDITOR-PATH-TRAVERSAL DELETE | url-encoded traversal | 400 | invalid_path |
| TC-EDITOR-YJS sync | API PUT → WS subscriber receives `yjs:update` | 6 ms | < 5 s Yjs budget |
| TC-WS-AUTH (no token) | WS upgrade no `?token=` | 101 then 4001 close | "Missing token" |
| TC-WS-AUTH (bogus token) | WS upgrade `token=bogus` | 101 then 4002 close | "Invalid token" |
| TC-WS-AUTH-037 presence (no secret) | GET `/internal/presence/:id` | 403 | gated |
| TC-WS-AUTH-037b collab-active (no secret) | GET `/internal/collab-active/:id` | 200 → after fix: 403 | new TC added |
| TC-WS-AUTH-041 CSWSH | WS upgrade `Origin: https://evil.example` | 403 | Forbidden origin |
| TC-WS-BROADCAST (no secret) | POST `/internal/broadcast` | 403 | gated |
| TC-WS-ROOMS room:join ack | dotted alias `room.join` w/ `roomId` | `room:joined` w/ members @ 200 ms | normalised on server |
| TC-WS-CRUD-032 malformed UUID | GET `/workspaces/not-a-uuid` | 400 | validated |

## Fixes landed in this verify

1. **`/internal/collab-active/:projectId` unauthenticated** — sibling of BUG-EDITOR-002. Gated with `X-Internal-Secret` on `services/ws/src/index.ts` line 204. Regression added as TC-WS-AUTH-037b. PR: `fix/bug-editor-002-collab-active`.

## Workspace checks

- `pnpm -w typecheck` → exit 0
- `pnpm -w lint` → exit 0

## Files of interest

- `services/ws/src/index.ts` — /internal/* HTTP routes incl. presence & collab-active gates; WS upgrade verifyClient (CSWSH); JWT verify on connection.
- `services/ws/src/message-handler.ts` — room:join workspace membership check (BUG-CORPUS-WS-001) + ack send (BUG-WSI-001).
- `services/api/src/projects/path-safety.ts` — `validatePathSafe` enforced at POST/PUT/GET/DELETE + AI tools.
- `services/api/src/ai/yjs-bridge.ts` — isCollaborationActive() already sends X-Internal-Secret; no breakage.
- `packages/db/src/queries/share-tracking.ts` — CTE dedup replaced SELECT DISTINCT (BUG-WS-003 historic).

## Out of scope / deferred

- BUG-EDITOR-001 (POST → DB / GET → memory split): owned by Editor-API agent. Did NOT touch in this run because the fix touches the in-memory editor store + ai/project-files write path; cross-cutting.
- BUG-WS-001 (templates noauth on staging — historic file labels) actually now covered by current ID range; verified 401 on `/templates` without token.
