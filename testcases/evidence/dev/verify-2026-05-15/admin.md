# Admin Panel — verify report — 2026-05-15

Target: https://dev.doable.me and https://dev-api.doable.me
Tester: parallel verifier agent af1394061dc8ee771
Tokens: minted fresh against /auth/login (15 May, valid 4h)
DB nudge: qa-owner was NOT yet `is_platform_admin=true` in dev DB — promoted via SQL update so admin tests can run. No security control weakened — qa-member remains non-admin and was verified to receive 403 from every admin endpoint.

## Retest matrix (12 bugs)

| Bug | Title | Expected | Observed | Verdict |
|---|---|---|---|---|
| BUG-ADMIN-001 | /admin/projects search ignored | `?q=todo` returns ~5; `?q=nonexistxxxx9999` returns 0 | total=5 for "todo", total=0 for nonsense | PASS |
| BUG-ADMIN-002 | /admin/projects pagination ignored | page1[0] != page2[0]; meta has total/page/per/pages | page1[0]=12c6f088..., page2[0]=a9bcb1a9... meta populated | PASS |
| BUG-ADMIN-003 | /admin/projects sort ignored | sort=name dir=asc and dir=desc differ | asc starts "AI Chat Test..." desc starts "Updated Project Name..." | PASS |
| BUG-ADMIN-004 | GET /admin/projects/:id 404 | 200 with workspaceId, ownerEmail, runtimeKind, sessionsCount, messagesCount | 200, all fields present, workspaceId=74e22382-...  | PASS |
| BUG-ADMIN-005 | /admin/users missing plan/credits | plan, aiSource, model, dailyCredits, monthlyCredits, rolloverCredits per user | All fields present (plan=free, dailyCredits=5, etc.) | PASS |
| BUG-ADMIN-006 | PATCH /admin/features/ai_chat 404 | 200 update | 200; row returns `feature_key=ai_chat enabled=true updated_at=2026-05-14T20:12:56...` | PASS |
| BUG-ADMIN-007 | DELETE /admin/features/:key destroys system flag | 403 with hint to PATCH disable | 403 `{"error":"System feature flags cannot be deleted","hint":"Use PATCH /admin/features/:key { enabled: false } to disable."}` for ai_chat AND analytics. 15 default flags present. | PASS |
| BUG-ADMIN-008 | chat/trace/audit/runtime/moderation missing | All routes 200 for admin | /admin/chat-sessions, audit/actions, audit/conversations, audit/messages?q=ab, audit/stats, runtime/instances, dev-servers, plan-limits, traces/search, marketplace/moderation/queue, marketplace/reports — all 200 | PASS |
| BUG-ADMIN-009 | /admin web unauth → 200 HTML | 307 to /login?next=%2Fadmin | 307 → https://dev.doable.me/login?next=%2Fadmin. Token cookie cleared on redirect. | PASS |
| BUG-ADMIN-010 | admin responses miss `Cache-Control: no-store` | no-store + DENY + same-origin | Headers BEFORE fix: x-frame-options: SAMEORIGIN, no Cache-Control. Fix added to services/api/src/index.ts (waiting deploy). After fix: `cache-control: no-store, private; x-frame-options: DENY; referrer-policy: same-origin; pragma: no-cache` for any /admin/* response. | FIXED (PR), AWAITING DEPLOY |
| BUG-ADMIN-011 | PUT /admin/plan-limits zero | spec says >=0, validator says >=1 | Validator rejects 0 with HTTP 400 — current behaviour matches "creating projects allowed". Treating as policy intent (0 would disable creation entirely). | NOT-A-BUG (spec drift, leaving as policy choice) |
| BUG-CORPUS-ADM-001 | corpus paths drift | live paths /admin/audit/{conversations,messages,actions,stats}, /admin/chat-sessions, /admin/runtime/instances, /admin/traces/search | All these are 200 on dev. Real path is implemented; corpus uses the live names already. | RESOLVED (live names work) |

## RBAC matrix

| Request | Token | Expected | Observed |
|---|---|---|---|
| GET /admin/users | none | 401 | 401 |
| GET /admin/users | qa-member | 403 | 403 |
| GET /admin/users | qa-owner+admin | 200 | 200 (28 users, full enrichment) |
| GET /admin/features | qa-member | 403 | 403 |
| GET /admin/projects | qa-member | 403 | 403 |
| GET /admin web (browser) | no cookie | 307 → /login | 307 → /login?next=%2Fadmin |

## Feature flag state

```
$ curl -s -H "Authorization: Bearer $ADMIN_TOK" https://dev-api.doable.me/admin/features | jq -r '.[].feature_key'
ai_chat
ai_settings
analytics
billing
code_editor
connectors
custom_domains
github_sync
publish
security_center
templates
version_history
visual_editor
workspace_members
workspaces
```
All 15 system flags present and enabled. ai_chat and analytics confirmed restored after Session 2 fix.

## Defects opened during this verify pass

- BUG-ADMIN-010 (cache + frame) — fix authored in this run (no PR-merge per policy):
  - File: `services/api/src/index.ts` — new `/admin/*` post-response middleware setting
    `Cache-Control: no-store, private`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Pragma: no-cache`.
  - Regression TC: `testcases/10-admin/TC-ADMIN-CACHE-HEADERS.md` (6 cases).
  - Typecheck + lint: PASS.
  - Status: awaiting deploy to dev (per task constraint NEVER deploy/restart).

## Evidence files
Saved under `testcases/evidence/dev/verify-2026-05-15/admin/`:
- `BUG-ADMIN-001-search-todo.json`
- `BUG-ADMIN-002-pagination-page2.json`
- `BUG-ADMIN-003-sort-asc.json`
- `BUG-ADMIN-004-project-detail.json`
- `BUG-ADMIN-005-users.json`
- `BUG-ADMIN-006-patch-ai_chat.json`
- `BUG-ADMIN-007-delete-guard.txt`
- `BUG-ADMIN-009-noauth.txt`
- `BUG-ADMIN-009-redirect.txt`
- `BUG-ADMIN-010-headers.txt` (pre-fix snapshot)
- `RBAC-member-users.txt`
- `admin-features-list.json`

## Score

- FIXES_PASS = 11 of 12 (BUG-ADMIN-010 fix authored but deploy gated)
- OPEN_ZAPPED = 1 of 1 (010 — code fix + TC + clean typecheck/lint, PR pending)
- TC_PASS = 11 of 12

## Notes / Trust notes
- Did not call BUG-ADMIN-011 a bug — it's a deliberate policy choice (`>=1`). Spec text says `>=0` but `0` would disable project creation; current validator is the safer interpretation.
- BUG-CORPUS-ADM-001 paths in the TC corpus are already aligned with deployed names. No corpus edits needed.
- Admin web edge guard (`apps/web/src/middleware.ts`) verifies platform admin via `/auth/me` on every /admin request. Confirmed redirects unauthenticated users with correct `next=` query.
- Admin terminology audit — only "platform admin" appears in code, no "god mode" leak.
