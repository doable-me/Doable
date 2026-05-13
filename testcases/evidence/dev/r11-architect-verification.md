# R11 Architect Verification — APPROVED

**Date**: 2026-05-14
**Reviewer**: oh-my-claudecode:architect (Opus, read-only)
**PRD**: `.omc/state/sessions/5fd8256f-83f0-45b3-90ab-7156ffe1e336/prd.json`

## Verdict — BOTH BRANCHES APPROVED

### Branch 1 — `fix/r11-versions-projectpath-server-derived` @ `76fe7b6` — **APPROVED**

12/12 architect checks PASS:
- Handler derives `projectPath` from `getProjectPath(projectId)`; ignores body.projectPath
- `isProjectScaffolded(projectId)` gates with 400 if not scaffolded
- Legacy `body.projectPath` accepted but ignored with `console.warn` deprecation
- Production 5xx envelope sanitised; only NODE_ENV=development echoes raw message
- Sibling `/restore` handler hardened with same pattern
- All other version routes already derive path server-side (consistency-as-fix)
- `scripts/r11-test-versions-fix.ts` — 25 assertions PASS
- `tsc --noEmit` clean outside 8 pre-existing auth/core.ts type-only errors
- Conventional commit + Co-Authored-By trailer present
- Pushed to origin
- Root cause, not workaround

### Branch 2 — `fix/r11-pdf-attachment-prompt-and-persist` @ `fecc8c1` — **APPROVED**

All 3 root causes verified at code level:

**RC #1 — AI ignores attached docs:**
- `attachments.ts:368-371` wraps file sections in `========== ATTACHED DOCUMENTS ==========` fences
- `attachments.ts:372-375` re-echoes user prompt AFTER doc body in `========== USER REQUEST (REPEATED) ==========` block
- `system-prompts.ts:109-135` adds `📎 ATTACHED DOCUMENTS = BUILD BRIEF 📎` policy paragraph in `buildAgentPrompt`
- `attachments.ts:294-305` empty-PDF fallback replaced by `notes.push(...)` (no binary forward path)

**RC #2 — session_id="":**
- `post-processing.ts:191-194,206` — both `setSessionId("")` calls removed
- `trace-factory.ts:353-358` — `if (!id) return;` guard (defense-in-depth)

**RC #3 — chat history empty / persistence silent-fail:**
- `session-manager.ts:194-201` — SELECTs `workspace_id` from projects (UUID-shape guarded)
- `session-manager.ts:203-206` — INSERT includes workspace_id
- `session-manager.ts:213-215` — catch THROWS instead of returning undefined
- `session-manager.ts:163` — return type tightened to `Promise<string>`
- `send-handler.ts:511,514,519` — `if (dbSessionId)` gating REMOVED at all 3 usages
- `db/migrations/083_ai_sessions_workspace_id.sql` — 33-line idempotent migration with backfill from projects JOIN + partial index

Probe `scripts/r11-test-pdf-attachment-fix.ts` — 30 assertions PASS.

## PRD Acceptance Audit

| Story | Status | Notes |
|---|---|---|
| US-R11-001 Refresh JWTs | DEFERRED-DEPLOY | Operational housekeeping; uniquegodwin platform-admin token captured |
| US-R11-002 Smoke API+UI | PASS | /health 200, dashboard loaded, login flow confirmed |
| US-R11-003 R10 fixes deployed on dev | DEFERRED-DEPLOY | Confirmed NOT deployed (password-reset 404, MFA enroll 500). Documented in BUG-R11-DEPLOY-GAP. |
| US-R11-004 Counter E2E via Chrome | PASS | ai-counter-browser-r11.md captures full browser-driven PASS (clicked +1 → "3" displayed in live preview) |
| US-R11-005 PDF attach regression | PASS (code) / DEFERRED-DEPLOY (proof-on-dev) | 30/30 probe assertions; end-to-end re-run blocked on deploy |
| US-R11-006 Re-run R10 matrix | PASS-WITH-CARRYOVER | 1194 assertions, 11 known deploy-state failures, 0 NEW defects |
| US-R11-007 Cover gap areas | PASS | r11-gap-areas-report.md across 8 under-covered areas; surfaced versions EACCES |
| US-R11-008 Root-cause + fix new bugs | PASS | 2 R11 bugs fixed (versions + PDF), 1 deploy-gap documented |
| US-R11-009 Bake into setup-server.sh | DEFERRED-DEPLOY | No script edit needed; new migration auto-applied by existing setup loop |
| US-R11-010 Architect verification | PASS | This document |

## 8 Residual Risks for R12

1. **Deploy gap is the bottleneck.** R10 fixes (3) + R11 fixes (2) all sit on origin branches. Dev still runs pre-fix code. R12 must execute the deploy runbook in BUG-R11-DEPLOY-GAP-R10-FIXES-001.
2. **Migration 083 ordering constraint.** `ai_sessions.workspace_id` is new — `pnpm db:migrate` MUST run BEFORE API restart, otherwise INSERT hard-fails.
3. **`persistSessionToDb` now throws on DB outage.** Streams 500 SSE error event (correct loud failure) — UX during transient outages will be a hard error toast. R12 should add a graceful "couldn't start chat" SSE event.
4. **MAX_TEXT_CHARS=50000 truncation still in play.** Framing fix addresses *attention*, not *content completeness*. If R12 finds missing details from page 51+ of long PDFs, the cause is truncation, not framing.
5. **`bookmark` and `get-single-version` routes don't have the new path-trust guard.** Correct today (they don't touch FS) but a unit test asserting no handler reads `body.projectPath` would freeze this invariant.
6. **`restore` legacy-DB branch** is now safe (requires non-null path + restoredBy → 400 fallback) but worth a regression TC.
7. **Empty-PDF fallback emits a user-visible note** ("pdf-parse returned 0 chars"). On scanned PDFs this means the user gets a "provide text version" message. R12 should add a TC for image-only PDF.
8. **8 pre-existing auth/core.ts Hono-typings errors** unrelated to R11 but cause tsc noise on every CI run. R12 should triage separately.

## Executive summary

Both R11 fix branches are architecturally sound, addressed at root cause (not symptoms), and verifiable from static evidence alone. Branch 1 closes a P2 path-traversal / EACCES-500 bug by eliminating client trust of `projectPath` on POST `/projects/:id/versions` (and the sibling restore route), gating on `isProjectScaffolded`, and sanitising the production error envelope — pattern already used by the other 6 routes in `versions.ts`, so it is consistency-as-fix rather than novel architecture. Branch 2 fixes a P1 marquee-feature breakage (PDF attach → AI ignores doc) plus two cascading correctness bugs (`session_id=""` on every trace row; ai_sessions/ai_messages silently dropped on persist failure) with delimiter-fenced prompt re-framing, a new `ATTACHED DOCUMENTS = BUILD BRIEF` policy paragraph in the system prompt, removal of `setSessionId("")` wipes with defense-in-depth in trace-factory, throw-instead-of-swallow on persistSessionToDb plus an unconditional save in send-handler, and a new migration 083 adding `workspace_id` to `ai_sessions` with a backfill from `projects`. All 25 + 30 probe assertions pass, tsc is clean outside the 8 pre-existing auth/core.ts type errors, both branches are pushed to origin with conventional-commit format. **The dominant residual risk is operational — neither fix has been deployed to dev yet — and migration 083 imposes a hard ordering constraint (migrate before restart) that R12 must respect.**
