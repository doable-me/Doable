# Doable Staging E2E — Test Run Log

**Target:** https://staging.doable.me (95.216.8.180, Hetzner — Ubuntu 24.04)
**API:** https://staging-api.doable.me
**WS:** wss://staging-ws.doable.me
**Tester:** Claude Code (acting as autonomous QA bot for uniquegodwin@gmail.com)
**Run started:** 2026-05-08 (Europe/Berlin)
**Stripe:** bypassed via direct DB (plans upgraded, credits seeded)
**Test users:** see [test-accounts.md](../test-accounts.md)

## Result legend
- **PASS** — behaved as documented / spec-implied; no defect
- **FAIL** — behaved differently from documented or expected; bug filed inline
- **BLOCKED** — could not run (dep missing, environment issue, prerequisite failed)
- **PARTIAL** — partial pass; some sub-assertions fine, some not
- **INFO** — observation/finding rather than pass/fail

## Live runs (chronological)

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-API-HEALTH-001 | 2026-05-08T05:43:21Z | PASS | got=200 exp=200 — GET /health returns 200 · {"status":"healthy","timestamp":"2026-05-08T05:43:20.368Z","version":"0.1.0","uptime":3644.220545206,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":266838016,"heapUsedBytes":102466304,"heapTotalB |
| TC-API-HEALTH-002 | 2026-05-08T05:44:09Z | INFO | got=401 exp= — GET /health/db DB connectivity probe · {"error":"Missing or invalid Authorization header"} |
| TC-AUTH-ME-001 | 2026-05-08T05:44:11Z | PASS | got=200 exp=200 — GET /auth/me with valid owner token returns 200 · {"user":{"id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","email":"qa-owner@doable.test","displayName":"QA Platform Owner","avatarUrl":null,"isPlatformAdmin":true,"platformRole":"owner","createdAt":"2026-05-08T05:37:01.049Z", |
| TC-AUTH-ME-002 | 2026-05-08T05:44:11Z | PASS | got=401 exp=401 — GET /auth/me with no Authorization header returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AUTH-ME-003 | 2026-05-08T05:44:12Z | PASS | got=401 exp=401 — GET /auth/me with malformed token returns 401 · {"error":"Invalid token"} |
| TC-AUTH-ME-004 | 2026-05-08T05:44:12Z | PASS | got=401 exp=401 — GET /auth/me with alg=none JWT returns 401 · {"error":"Invalid token"} |
| TC-AUTH-ME-005 | 2026-05-08T05:44:13Z | PASS | got=200 exp=200 — GET /auth/me with member token returns 200 isPlatformAdmin:false · {"user":{"id":"ff9c6e4d-5081-4ed3-a46d-2f1ad046ec4c","email":"qa-member@doable.test","displayName":"QA member","avatarUrl":null,"isPlatformAdmin":false,"platformRole":"member","createdAt":"2026-05-08T05:37:14.180Z","upda |
| TC-AUTH-ME-006 | 2026-05-08T05:44:13Z | FAIL | got=401 exp=200 — GET /auth/me with token Authorization scheme lowercase 'bearer' · {"error":"Missing or invalid Authorization header"} |
| TC-AUTH-ME-007 | 2026-05-08T05:44:14Z | INFO | got=401 exp= — GET /auth/me with extra whitespace in header is rejected · {"error":"Invalid token"} |
| TC-WS-LIST-001 | 2026-05-08T05:44:14Z | PASS | got=200 exp=200 — GET /workspaces lists owner's workspaces · {"data":[{"id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Platform Owner's workspace","slug":"qa-platform-owner","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","plan":"enter |
| TC-WS-LIST-002 | 2026-05-08T05:44:15Z | PASS | got=401 exp=401 — GET /workspaces unauth returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-WS-LIST-003 | 2026-05-08T05:44:15Z | PASS | got=200 exp=200 — GET /workspaces with member token returns own ws · {"data":[{"id":"e0eb30b8-5078-4180-bde9-de8dde600384","name":"QA member's workspace","slug":"qa-member","description":null,"avatar_url":null,"owner_id":"ff9c6e4d-5081-4ed3-a46d-2f1ad046ec4c","plan":"pro","created_at":"20 |
| TC-WEB-LANDING-001 | 2026-05-08T05:44:17Z | PASS | got=200 exp=200 — GET / public landing 200 · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-NOTIF-LIST-001a | 2026-05-14T18:25:00Z | PASS | got=400 exp=400 — GET /notifications no workspaceId -> 400 validation error |
| TC-NOTIF-LIST-001b | 2026-05-14T18:25:01Z | PASS | got=200 exp=200 — GET /notifications?workspaceId=c1083c8a -> 200 {data:[]} |
| TC-NOTIF-LIST-002 | 2026-05-14T18:25:02Z | PASS | got=403 exp=403 — admin2 cannot see owner workspace notifications |
| TC-NOTIF-LIST-003 | 2026-05-14T18:25:03Z | PASS | got=200 exp=200 — GET /notifications?unreadOnly=true -> 200 with data |
| TC-NOTIF-LIST-UNREAD | 2026-05-14T18:25:04Z | PASS | got=200 exp=200 — GET /notifications/unread-count -> {count:0} |
| TC-NOTIF-LIST-008 | 2026-05-14T18:25:05Z | PASS | got=204 exp=204 — POST /notifications/read-all -> 204 |
| TC-NOTIF-LIST-007 | 2026-05-14T18:25:06Z | PASS | got=404 exp=404 — POST /notifications/fake-id/read -> 404 |
| TC-NOTIF-UNAUTH | 2026-05-14T18:25:07Z | PASS | got=401 exp=401 — GET /notifications no token -> 401 |
| TC-ANALYTICS-OVERVIEW-001 | 2026-05-14T18:26:00Z | PASS | got=200 exp=200 — GET /analytics/projects/:id/overview -> 200 with visitors/pageViews/sessions |
| TC-ANALYTICS-DASHBOARD-002 | 2026-05-14T18:26:01Z | PASS | got=401 exp=401 — GET /analytics overview no auth -> 401 |
| TC-ANALYTICS-OVERVIEW-FAKE | 2026-05-14T18:26:02Z | PASS | got=404 exp=404 — GET /analytics overview fake project -> 404 |
| TC-ANALYTICS-DASHBOARD-019 | 2026-05-14T18:26:03Z | FAIL | got=200 exp=403/404 — admin2 can read owner's project analytics without membership — BUG: 2026-05-14-analytics-001 |
| TC-ANALYTICS-TIMESERIES | 2026-05-14T18:26:04Z | PASS | got=200 exp=200 — GET /analytics timeseries 7d -> 200 {data:[]} |
| TC-ANALYTICS-PAGE-VIEWS-001 | 2026-05-14T18:26:05Z | PASS | got=200 exp=200 — GET /analytics pageviews -> 200 {data:[]} |
| TC-ANALYTICS-EVENTS-001 | 2026-05-14T18:26:06Z | PASS | got=200 exp=200 — GET /analytics events -> 200 {data:[]} |
| TC-ANALYTICS-PAGES | 2026-05-14T18:26:07Z | PASS | got=200 exp=200 — GET /analytics top pages -> 200 {data:[]} |
| TC-ANALYTICS-REFERRERS | 2026-05-14T18:26:08Z | PASS | got=200 exp=200 — GET /analytics referrers -> 200 {data:[]} |
| TC-ANALYTICS-DEVICES | 2026-05-14T18:26:09Z | PASS | got=200 exp=200 — GET /analytics devices -> 200 {data:[]} |
| TC-ANALYTICS-REALTIME | 2026-05-14T18:26:10Z | PASS | got=200 exp=200 — GET /analytics realtime -> 200 {activeVisitors,pages} |
| TC-ANALYTICS-SETTINGS-GET | 2026-05-14T18:26:11Z | PASS | got=200 exp=200 — GET /analytics settings -> 200 {enabled,trackingSnippet} |
| TC-ANALYTICS-SETTINGS-PUT | 2026-05-14T18:26:12Z | PASS | got=200 exp=200 — PUT /analytics settings enabled=true -> 200 |
| TC-ANALYTICS-SETTINGS-INVALID | 2026-05-14T18:26:13Z | PASS | got=400 exp=400 — PUT /analytics settings enabled=string -> 400 validation |
| TC-ANALYTICS-SCRIPT | 2026-05-14T18:26:14Z | PASS | got=200 exp=200 — GET /analytics/script.js -> 200 JS tracking script |
| TC-ANALYTICS-EVENTS-001-TRACK | 2026-05-14T18:26:15Z | PASS | got=204 exp=204 — POST /analytics/track page_view -> 204 |
| TC-ANALYTICS-TRACK-INVALID | 2026-05-14T18:26:16Z | PASS | got=400 exp=400 — POST /analytics/track missing fields -> 400 |
| TC-ANALYTICS-TRACK-FAKE-PROJ | 2026-05-14T18:26:17Z | PASS | got=400 exp=400 — POST /analytics/track fake projectId -> 400 |
| TC-ANALYTICS-TRACK-BATCH | 2026-05-14T18:26:18Z | PASS | got=204 exp=204 — POST /analytics/track batch 2 events -> 204 |
| TC-THUMB-GEN-001-NOTEXIST | 2026-05-14T18:27:00Z | PASS | got=404 exp=404 — GET /thumbnails/:id.png no thumbnail -> 404 Cache-Control: no-store |
| TC-THUMB-FORMAT | 2026-05-14T18:27:01Z | PASS | got=400 exp=400 — GET /thumbnails/:id.jpg -> 400 only .png supported |
| TC-THUMB-GEN-REGEN-NOSERVER | 2026-05-14T18:27:02Z | PASS | got=400 exp=400 — POST /thumbnails/:id/regenerate no dev server -> 400 |
| TC-THUMB-REGEN-NOAUTH | 2026-05-14T18:27:03Z | PASS | got=401 exp=401 — POST /thumbnails/:id/regenerate no auth -> 401 |
| TC-THUMB-GEN-039 | 2026-05-14T18:27:04Z | PASS | got=404 exp=not-401 — GET /thumbnails/:id.png no auth -> 404 (public endpoint, no auth required) |
| TC-THUMB-GEN-027 | 2026-05-14T18:27:05Z | FAIL | code-check — Puppeteer --no-sandbox hardcoded unconditionally in capture.ts — BUG: 2026-05-14-analytics-002 |
| TC-WEB-LOGIN-001 | 2026-05-08T05:44:18Z | PASS | got=200 exp=200 — GET /login form 200 · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-SIGNUP-001 | 2026-05-08T05:44:19Z | PASS | got=200 exp=200 — GET /signup form 200 · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-FORGOT-001 | 2026-05-08T05:44:20Z | PASS | got=200 exp=200 — GET /forgot-password 200 · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-DASHBOARD-001 | 2026-05-08T05:44:21Z | INFO | got=200 exp= — GET /dashboard unauthed: should redirect to /login or render auth shell · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-TERMS | 2026-05-08T05:44:22Z | PASS | got=200 exp=200 — GET /terms public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-PRIVACY | 2026-05-08T05:44:23Z | PASS | got=200 exp=200 — GET /privacy public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-COOKIES | 2026-05-08T05:44:25Z | PASS | got=200 exp=200 — GET /cookies public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-CONTACT | 2026-05-08T05:44:25Z | PASS | got=200 exp=200 — GET /contact public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-DMCA | 2026-05-08T05:44:26Z | PASS | got=200 exp=200 — GET /dmca public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WEB-LEGAL-AUP | 2026-05-08T05:44:27Z | PASS | got=200 exp=200 — GET /acceptable-use public · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-WS-GET-001 | 2026-05-08T05:45:16Z | PASS | got=200 exp=200 — GET /workspaces/:id own workspace · {"data":{"id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Platform Owner's workspace","slug":"qa-platform-owner","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","plan":"enterp |
| TC-WS-GET-002 | 2026-05-08T05:45:16Z | INFO | got=403 exp= — GET other user's workspace returns 403/404 · {"error":"Not a member of this workspace"} |
| TC-WS-MEMBERS-LIST-001 | 2026-05-08T05:45:17Z | PASS | got=200 exp=200 — GET /workspaces/:id/members owner sees self · {"data":[{"workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","user_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","role":"owner","joined_at":"2026-05-08T05:37:01.068Z","invited_by":null,"id":"8cdcb0c9-3e39-4996-97ab-2b8ef |
| TC-WS-MEMBERS-LIST-002 | 2026-05-08T05:45:18Z | INFO | got=403 exp= — GET cross-tenant members 403 · {"error":"Not a member of this workspace"} |
| TC-WS-CONTEXT-001 | 2026-05-08T05:45:18Z | INFO | got=200 exp= — GET /workspaces/:id/context active context · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-WS-AI-SETTINGS-001 | 2026-05-08T05:45:20Z | INFO | got=404 exp= — GET /workspaces/:id/ai-settings · {"error":"Not Found","path":"/workspaces/4bbd6afe-c396-4da6-add5-d71f73f51801/ai-settings"} |
| TC-WS-USAGE-001 | 2026-05-08T05:45:20Z | INFO | got=200 exp= — GET /workspaces/:id/usage daily/monthly stats · {"data":{"requestCount":0,"totalTokens":0,"promptTokens":0,"completionTokens":0,"thinkingTokens":0,"totalCostUsd":0,"totalCredits":0,"avgDurationMs":0,"toolCallCount":0}} |
| TC-PROJ-LIST-001 | 2026-05-08T05:45:21Z | PASS | got=200 exp=200 — GET /projects?workspaceId= empty list initially · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-PROJ-LIST-002 | 2026-05-08T05:45:22Z | INFO | got=200 exp= — GET /projects without workspaceId 400/200 · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-PROJ-LIST-003 | 2026-05-08T05:45:22Z | INFO | got=403 exp= — GET /projects?workspaceId=other's WS returns 403/200(empty) · {"error":"Access denied to this workspace"} |
| TC-PROJ-CREATE-001 | 2026-05-08T05:45:24Z | PASS | got id=a22139b7-42a5-4d51-861c-7f01a7ab7c4b status=? — POST /projects creates Next.js project · {"data":{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":null,"status":"draft","visibi |
| TC-PROJ-GET-001 | 2026-05-08T05:45:24Z | PASS | got=200 exp=200 — GET /projects/:id returns project · {"data":{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":null,"status":"draft","visibility":"private","git |
| TC-PROJ-GET-002 | 2026-05-08T05:45:25Z | INFO | got=404 exp= — GET /projects/:id cross-tenant 403/404 · {"error":"Project not found"} |
| TC-ADMIN-USERS-001 | 2026-05-08T05:45:26Z | INFO | got=200 exp= — GET /admin/users platform admin sees user list · [{"id":"807f3867-9273-4c5a-bce2-adc80da9bb11","email":"qa-charlie@doable.test","display_name":"QA charlie","is_platform_admin":false,"platform_role":"member","created_at":"2026-05-08T05:37:40.508Z"},{"id":"6f65e62b-e225- |
| TC-ADMIN-PROJECTS-001 | 2026-05-08T05:45:26Z | INFO | got=200 exp= — GET /admin/projects all projects visible to platform admin · {"data":{"projects":[{"projectId":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","projectName":"QA Test Project","projectSlug":"qa-test-project","frameworkId":"vite-react","status":"draft","visibility":"restricted","workspaceNam |
| TC-ADMIN-AUDIT-001 | 2026-05-08T05:45:27Z | INFO | got=404 exp= — GET /admin/audit list events · {"error":"Not Found","path":"/admin/audit"} |
| TC-ADMIN-TRACE-001 | 2026-05-08T05:45:27Z | INFO | got=404 exp= — GET /admin/trace list traces · {"error":"Not Found","path":"/admin/trace"} |
| TC-ADMIN-CHAT-001 | 2026-05-08T05:45:28Z | INFO | got=404 exp= — GET /admin/chat list AI sessions · {"error":"Not Found","path":"/admin/chat"} |
| TC-ADMIN-DEV-SERVERS-001 | 2026-05-08T05:45:28Z | INFO | got=200 exp= — GET /admin/dev-servers · {"data":{"servers":[],"summary":{"total":0,"alive":0,"ready":0}}} |
| TC-ADMIN-MODERATION-001 | 2026-05-08T05:45:29Z | INFO | got=404 exp= — GET /admin/moderation queue · {"error":"Not Found","path":"/admin/moderation"} |
| TC-ADMIN-RUNTIME-001 | 2026-05-08T05:45:29Z | INFO | got=404 exp= — GET /admin/runtime systemd units · {"error":"Not Found","path":"/admin/runtime"} |
| TC-ADMIN-PLAN-LIMITS-001 | 2026-05-08T05:45:30Z | INFO | got=200 exp= — GET /admin/plan-limits · {"data":[{"plan":"free","maxProjects":3,"maxMembers":1,"dailyCredits":5,"monthlyCredits":0,"maxFileSize":5242880,"customDomains":false,"analytics":false,"prioritySupport":false,"isOverridden":false,"updatedAt":"2026-05-0 |
| TC-ADMIN-RBAC-001 | 2026-05-08T05:45:31Z | PASS | got=403 exp=403 — Non-admin to /admin/users returns 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-RBAC-002 | 2026-05-08T05:45:31Z | PASS | got=403 exp=403 — Non-admin to /admin/projects returns 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-RBAC-003 | 2026-05-08T05:45:32Z | PASS | got=403 exp=403 — Non-admin to /admin/audit returns 403 · {"error":"Platform admin access required"} |

## DEV — Billing + Marketplace batch (2026-05-14)

**Target:** https://dev.doable.me  
**API:** https://dev-api.doable.me  
**Run date:** 2026-05-14  
**Tester:** QA Tester Agent (Claude Sonnet)  
**Stripe:** NOT bypassed — real Stripe checkout URLs returned  
**Test users:** owner-pro@doable.me (pro workspace), owner-free@doable.me (free workspace)  
**Results file:** testcases/evidence/dev/batch-2026-05-14/billing-marketplace-results.json  
**Bugs filed:** 14 (8 billing, 6 marketplace)  

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-BILLING-PLANS-001 | 2026-05-14T17:00:00Z | PASS | GET /billing/plans returns 200 with 3 plans (free, pro, business) |
| TC-BILLING-PLANS-004 | 2026-05-14T17:01:00Z | FAIL | GET /billing/plans missing enterprise plan with contactSales=true — BUG-2026-05-14-BILLING-008 |
| TC-BILLING-PLANS-006 | 2026-05-14T17:01:30Z | FAIL | Plan schema missing storageMb, priceCents, interval fields — BUG-2026-05-14-BILLING-008 |
| TC-BILLING-PLANS-012 | 2026-05-14T17:02:00Z | FAIL | GET /billing/subscription returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PLANS-015 | 2026-05-14T17:02:30Z | FAIL | GET /billing/limits returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PLANS-020 | 2026-05-14T17:03:00Z | FAIL | POST /billing/cancel returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PLANS-025 | 2026-05-14T17:03:30Z | FAIL | POST /billing/upgrade returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PLANS-036 | 2026-05-14T17:04:00Z | FAIL | /pricing page shows 404 "Page not found" — BUG-2026-05-14-BILLING-007 |
| TC-BILLING-CREDITS-001 | 2026-05-14T17:05:00Z | PASS | GET /billing/balance with valid workspaceId returns 200 with credit data |
| TC-BILLING-CREDITS-002 | 2026-05-14T17:05:30Z | FAIL | GET /billing/balance accepts any workspaceId — cross-tenant data leak — BUG-2026-05-14-BILLING-002 |
| TC-BILLING-CREDITS-005 | 2026-05-14T17:06:00Z | FAIL | UI shows -400/100 monthly credits (negative/wrong value) — BUG-2026-05-14-BILLING-001 |
| TC-BILLING-CREDITS-010 | 2026-05-14T17:06:30Z | FAIL | POST /billing/grant returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-CREDITS-011 | 2026-05-14T17:07:00Z | FAIL | POST /billing/revoke returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PORTAL-001 | 2026-05-14T17:08:00Z | PASS | GET /billing/portal returns 200 with Stripe portal URL |
| TC-BILLING-PORTAL-005 | 2026-05-14T17:08:30Z | FAIL | Manage Subscription CTA navigates to /usage not /billing/portal — BUG-2026-05-14-BILLING-003 |
| TC-BILLING-PORTAL-010 | 2026-05-14T17:09:00Z | FAIL | GET /billing/invoices returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-PORTAL-015 | 2026-05-14T17:09:30Z | FAIL | GET /billing/payment-methods returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-TOPUP-001 | 2026-05-14T17:10:00Z | PASS | GET /billing/topup/packages returns 200 with package list |
| TC-BILLING-TOPUP-005 | 2026-05-14T17:10:30Z | PASS | POST /billing/topup returns 200 with Stripe checkout URL |
| TC-BILLING-TOPUP-015 | 2026-05-14T17:11:00Z | FAIL | GET /billing/topup/history returns 404 Not Found — BUG-2026-05-14-BILLING-004 |
| TC-BILLING-WEBHOOK-001 | 2026-05-14T17:12:00Z | PASS | POST /billing/webhook missing sig header returns 400 "Missing stripe-signature header" |
| TC-BILLING-WEBHOOK-003 | 2026-05-14T17:12:30Z | PASS | POST /billing/webhook invalid sig returns 400 "Webhook verification failed" |
| TC-BILLING-WEBHOOK-008 | 2026-05-14T17:13:00Z | FAIL | POST /billing/webhook with event body returns 502 Bad Gateway — BUG-2026-05-14-BILLING-005 |
| TC-BILLING-AUTH-RATELIMIT | 2026-05-14T17:14:00Z | FAIL | Login rate limit shows "Something went wrong" not rate-limit message — BUG-2026-05-14-BILLING-006 |
| TC-MARKET-LIST-001 | 2026-05-14T17:20:00Z | FAIL | GET /marketplace anonymous returns 401 (not public) — BUG-2026-05-14-MARKETPLACE-002 |
| TC-MARKET-LIST-002 | 2026-05-14T17:20:30Z | PASS | GET /marketplace/listings with auth returns 200 with empty array |
| TC-MARKET-LIST-005 | 2026-05-14T17:21:00Z | PASS | GET /marketplace/listings?search=test returns 200 with empty results |
| TC-MARKET-LIST-010 | 2026-05-14T17:21:30Z | PASS | GET /marketplace/listings?sort=popular returns 200 |
| TC-MARKET-LIST-011 | 2026-05-14T17:22:00Z | PASS | GET /marketplace/listings?sort=newest returns 200 |
| TC-MARKET-LIST-012 | 2026-05-14T17:22:30Z | PASS | GET /marketplace/listings?sort=rating returns 200 |
| TC-MARKET-LIST-013 | 2026-05-14T17:23:00Z | FAIL | sort=most_installed returns 400/empty (API uses popular/newest/rating not most_installed/highest_rated) |
| TC-MARKET-LIST-035 | 2026-05-14T17:23:30Z | FAIL | GET /marketplace/feed.json returns 401 (should be public) — BUG-2026-05-14-MARKETPLACE-003 |
| TC-MARKET-CATEGORIES-001 | 2026-05-14T17:24:00Z | PASS | GET /marketplace/categories returns 200 with category list |
| TC-MARKET-BUNDLES-001 | 2026-05-14T17:24:30Z | FAIL | GET /marketplace/bundles returns 404 Not Found — BUG-2026-05-14-MARKETPLACE-006 |
| TC-MARKET-INSTALL-001 | 2026-05-14T17:25:00Z | FAIL | POST /marketplace/install nonexistent ID returns 500 (should 404) — BUG-2026-05-14-MARKETPLACE-001 |
| TC-MARKET-REVIEW-001 | 2026-05-14T17:26:00Z | FAIL | POST /marketplace/reviews returns 404 Not Found — BUG-2026-05-14-MARKETPLACE-004 |
| TC-MARKET-REVIEW-002 | 2026-05-14T17:26:30Z | FAIL | GET /marketplace/listings/:id/reviews returns 404 Not Found — BUG-2026-05-14-MARKETPLACE-004 |
| TC-MARKET-MODERATION-001 | 2026-05-14T17:27:00Z | FAIL | POST /marketplace/reports returns 404 Not Found — BUG-2026-05-14-MARKETPLACE-005 |
| TC-ADMIN-RBAC-004 | 2026-05-08T05:45:32Z | PASS | got=403 exp=403 — Non-admin to /admin/moderation returns 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-RBAC-005 | 2026-05-08T05:45:33Z | PASS | got=403 exp=403 — Non-admin to /admin/runtime returns 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-RBAC-006 | 2026-05-08T05:45:33Z | PASS | got=403 exp=403 — Non-admin to /admin/plan-limits returns 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-RBAC-007 | 2026-05-08T05:45:34Z | PASS | got=401 exp=401 — Unauthed to /admin returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-LIST-001 | 2026-05-08T05:46:18Z | INFO | got=404 exp= — GET /editor/:projectId/files lists scaffolded files · {"error":"Not Found","path":"/editor/a22139b7-42a5-4d51-861c-7f01a7ab7c4b/files"} |
| TC-EDITOR-PROJECT-FILES-001 | 2026-05-08T05:46:19Z | INFO | got=308 exp= — GET /project-files/:projectId/* requires public/auth ·  |
| TC-PROJ-COLLAB-LIST-001 | 2026-05-08T05:46:19Z | INFO | got=200 exp= — GET /projects/:id/collaborators owner sees self · {"data":[]} |
| TC-TEMPL-LIST-001 | 2026-05-08T05:46:20Z | PASS | got=200 exp=200 — GET /templates listing · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite", |
| TC-FOLDER-LIST-001 | 2026-05-08T05:46:20Z | INFO | got=200 exp= — GET /folders?workspaceId= · {"data":[]} |
| TC-FOLDER-CREATE-001 | 2026-05-08T05:46:21Z | PASS | got id=d2a15938-2833-4aa5-9fad-8790721d54af — POST /folders create · {"data":{"id":"d2a15938-2833-4aa5-9fad-8790721d54af","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Folder","parent_id":null,"position":0,"created_at":"2026-05-08T05:46:20.336Z"}} |
| TC-MARKET-LIST-001 | 2026-05-08T05:46:21Z | INFO | got=200 exp= — GET /marketplace/listings public list · {"data":[],"total":0} |
| TC-MARKET-CATEGORIES-001 | 2026-05-08T05:46:22Z | INFO | got=200 exp= — GET /marketplace/categories · {"data":[{"id":"6eaad3c4-0915-4f3e-974b-77f809d5dc0c","slug":"frontend","name":"Frontend","description":"React, Vue, Svelte and other frontend frameworks","icon":"🎨","sort_order":1,"created_at":"2026-05-07T20:31:01.54 |
| TC-MARKET-FEATURED-001 | 2026-05-08T05:46:22Z | INFO | got=200 exp= — GET /marketplace/featured · {"data":[]} |
| TC-COMM-LIST-001 | 2026-05-08T05:46:23Z | INFO | got=401 exp= — GET /community/projects public list · {"error":"Missing or invalid Authorization header"} |
| TC-COMM-FEATURED-001 | 2026-05-08T05:46:23Z | INFO | got=200 exp= — GET /community/featured · {"data":{"projects":[]}} |
| TC-CONN-LIST-001 | 2026-05-08T05:46:24Z | INFO | got=404 exp= — GET /connectors workspace's MCP connectors · {"error":"Not Found","path":"/connectors"} |
| TC-CONN-CATALOG-001 | 2026-05-08T05:46:24Z | INFO | got=404 exp= — GET /connectors/catalog · {"error":"Not Found","path":"/connectors/catalog"} |
| TC-INTEG-LIST-001 | 2026-05-08T05:46:25Z | INFO | got=404 exp= — GET /integrations available list · {"error":"Not Found","path":"/integrations"} |
| TC-INTEG-CONNECTIONS-001 | 2026-05-08T05:46:25Z | INFO | got=200 exp= — GET /integrations/connections · {"data":[]} |
| TC-SKILL-LIST-001 | 2026-05-08T05:46:26Z | INFO | got=404 exp= — GET /skills?workspaceId= · {"error":"Not Found","path":"/skills"} |
| TC-ENV-LIST-001 | 2026-05-08T05:46:27Z | INFO | got=404 exp= — GET /env-vars?workspaceId= · {"error":"Not Found","path":"/env-vars"} |
| TC-ENVS-LIST-001 | 2026-05-08T05:46:27Z | INFO | got=404 exp= — GET /environments · {"error":"Not Found","path":"/environments"} |
| TC-PROV-CATALOG-001 | 2026-05-08T05:46:28Z | INFO | got=404 exp= — GET /provider-catalog list · {"error":"Not Found","path":"/provider-catalog"} |
| TC-PROV-BRIDGE-001 | 2026-05-08T05:46:28Z | INFO | got=404 exp= — GET /provider-bridge user keys list · {"error":"Not Found","path":"/provider-bridge"} |
| TC-NOTIF-LIST-001 | 2026-05-08T05:46:29Z | INFO | got=404 exp= — GET /notifications · {"error":"Not Found","path":"/notifications"} |
| TC-BILL-PLAN-001 | 2026-05-08T05:46:29Z | INFO | got=404 exp= — GET /billing/plan?workspaceId= · {"error":"Not Found","path":"/billing/plan"} |
| TC-BILL-USAGE-001 | 2026-05-08T05:46:30Z | INFO | got=200 exp= — GET /billing/usage · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-ANLY-LIST-001 | 2026-05-08T05:46:31Z | INFO | got=404 exp= — GET /analytics?workspaceId= · {"error":"Not Found","path":"/analytics"} |
| TC-VER-LIST-001 | 2026-05-08T05:46:31Z | INFO | got=404 exp= — GET /versions/:projectId · {"error":"Not Found","path":"/versions/a22139b7-42a5-4d51-861c-7f01a7ab7c4b"} |
| TC-DOM-LIST-001 | 2026-05-08T05:46:32Z | INFO | got=404 exp= — GET /domains for project · {"error":"Not Found","path":"/domains/a22139b7-42a5-4d51-861c-7f01a7ab7c4b"} |
| TC-DEP-LIST-001 | 2026-05-08T05:46:32Z | INFO | got=200 exp= — GET /deploy/:projectId/history · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-GH-STATUS-001 | 2026-05-08T05:46:33Z | INFO | got=200 exp= — GET /github/status user's GH connection state · {"data":{"connected":false,"githubUsername":null}} |
| TC-COMMENT-LIST-001 | 2026-05-08T05:46:33Z | INFO | got=404 exp= — GET /design-comments?projectId= · {"error":"Not Found","path":"/design-comments"} |
| TC-TC-LIST-001 | 2026-05-08T05:46:34Z | INFO | got=404 exp= — GET /team-chat/:workspaceId · {"error":"Project not found"} |
| TC-THUMB-001 | 2026-05-08T05:46:34Z | INFO | got=400 exp= — GET /thumbnails/:projectId placeholder/empty · {"error":"Only .png thumbnails are supported"} |
| TC-ART-LIST-001 | 2026-05-08T05:46:35Z | INFO | got=404 exp= — GET /artifacts/:projectId · Not found |
| TC-PLAN-001 | 2026-05-08T05:46:35Z | INFO | got=404 exp= — GET /plan/:projectId steps · {"error":"Not Found","path":"/plan/a22139b7-42a5-4d51-861c-7f01a7ab7c4b"} |
| TC-BUILD-001 | 2026-05-08T05:46:36Z | INFO | got=404 exp= — GET /build-stream/:projectId SSE · {"error":"Not Found","path":"/build-stream/a22139b7-42a5-4d51-861c-7f01a7ab7c4b"} |
| TC-CHAT-AI-STATUS-001 | 2026-05-08T05:48:57Z | INFO | got=200 exp= — GET projects ai-status · {"active":false} |
| TC-CHAT-STATUS-001 | 2026-05-08T05:48:58Z | INFO | got=200 exp= — GET projects chat status · {"streaming":false} |
| TC-CHAT-HISTORY-001 | 2026-05-08T05:48:58Z | INFO | got=200 exp= — GET projects chat history · {"data":[],"hasMore":false} |
| TC-CHAT-QUEUE-001 | 2026-05-08T05:48:59Z | INFO | got=200 exp= — GET projects chat queue · {"data":[]} |
| TC-CHAT-AI-MODELS-001 | 2026-05-08T05:48:59Z | INFO | got=200 exp= — GET ai models · {"data":[],"error":"Request models.list failed with message: Not authenticated. Please authenticate first."} |
| TC-CHAT-AI-AUTH-001 | 2026-05-08T05:49:01Z | INFO | got=200 exp= — GET ai auth-status · {"data":{"isAuthenticated":false,"statusMessage":"Not authenticated"}} |
| TC-CHAT-TRACES-001 | 2026-05-08T05:49:02Z | INFO | got=200 exp= — GET projects traces · {"data":[]} |
| TC-CHAT-TRACE-STATS-001 | 2026-05-08T05:49:05Z | INFO | got=200 exp= — GET projects trace-stats · {"data":{"total_traces":0,"completed":0,"errors":0,"stalled":0,"aborted":0,"avg_duration_ms":null,"avg_ttft_ms":null,"total_tool_calls":null,"total_auto_continues":null,"total_tokens":null,"total_cost_usd":null,"avg_tool |
| TC-CHAT-RBAC-001 | 2026-05-08T05:49:05Z | INFO | got=404 exp= — Cross-tenant chat history forbidden · {"error":"Project not found"} |
| TC-ADMIN-AUDIT-CONV-001 | 2026-05-08T05:49:06Z | PASS | got=200 exp=200 — GET admin audit conversations · {"conversations":[],"total":0,"limit":50} |
| TC-ADMIN-AUDIT-MSG-001 | 2026-05-08T05:49:07Z | FAIL | got=400 exp=200 — GET admin audit messages · {"error":"Query parameter `q` is required (min 2 chars)"} |
| TC-ADMIN-AUDIT-ACT-001 | 2026-05-08T05:49:07Z | PASS | got=200 exp=200 — GET admin audit actions · {"actions":[{"id":"1","ts":"2026-05-08T05:49:05.949Z","actor_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","actor_email":"qa-owner@doable.test","actor_role":"platform_admin","action":"audit.conversations.search","resource_t |
| TC-ADMIN-AUDIT-STATS-001 | 2026-05-08T05:49:08Z | PASS | got=200 exp=200 — GET admin audit stats · {"total_sessions":0,"total_messages":0,"total_users":0,"messages_24h":0,"messages_7d":0,"sessions_24h":0} |
| TC-ADMIN-TRACE-SEARCH-001 | 2026-05-08T05:49:09Z | INFO | got=200 exp= — GET admin traces search · {"traces":[],"total":0} |
| TC-ADMIN-FEATURE-001 | 2026-05-08T05:49:09Z | INFO | got=200 exp= — GET admin features check key · {"allowed":true,"reason":"platform_admin"} |
| TC-ADMIN-AUDIT-CONV-RBAC-001 | 2026-05-08T05:49:10Z | PASS | got=403 exp=403 — Non-admin audit conversations 403 · {"error":"Platform admin access required"} |
| TC-ADMIN-TRACE-SEARCH-RBAC-001 | 2026-05-08T05:49:10Z | PASS | got=403 exp=403 — Non-admin traces search 403 · {"error":"Platform admin access required"} |
| TC-WS-AI-SETTINGS-001 | 2026-05-08T05:49:15Z | INFO | got=404 exp= — GET ws ai-settings · {"error":"Not Found","path":"/workspaces/4bbd6afe-c396-4da6-add5-d71f73f51801/ai-settings"} |
| TC-WS-CONNECTORS-001 | 2026-05-08T05:49:16Z | INFO | got=200 exp= — GET ws connectors · {"data":[{"id":"03108405-7040-46c7-b07e-6342e716ed5f","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","project_id":null,"created_by":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","scope":"workspace","name":"Markdown Build |
| TC-WS-CONNECTORS-EFF-001 | 2026-05-08T05:49:16Z | INFO | got=200 exp= — GET ws connectors-effective · {"data":[{"id":"03108405-7040-46c7-b07e-6342e716ed5f","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","project_id":null,"created_by":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","scope":"workspace","name":"Markdown Build |
| TC-WS-SKILLS-001 | 2026-05-08T05:49:17Z | INFO | got=200 exp= — GET ws skills · {"data":[]} |
| TC-WS-SKILLS-MAN-001 | 2026-05-08T05:49:17Z | INFO | got=200 exp= — GET ws skills manifest · {"data":[]} |
| TC-WS-RULES-001 | 2026-05-08T05:49:18Z | INFO | got=200 exp= — GET ws rules · {"data":[]} |
| TC-WS-ENVIRONMENTS-001 | 2026-05-08T05:49:18Z | INFO | got=200 exp= — GET ws environments · {"data":[]} |
| TC-WS-ENV-DEFAULT-001 | 2026-05-08T05:49:19Z | INFO | got=200 exp= — GET ws environments-default · {"data":null,"isCustom":false,"items":{"skills":[],"rules":[],"knowledge":[],"connectors":[{"id":"03108405-7040-46c7-b07e-6342e716ed5f","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","project_id":null,"created_by" |
| TC-WS-ENVVARS-001 | 2026-05-08T05:49:19Z | INFO | got=200 exp= — GET ws env-vars · {"data":[]} |
| TC-WS-INVITES-001 | 2026-05-08T05:49:20Z | PASS | got=200 exp=200 — GET ws invites · {"data":[]} |
| TC-WS-MARKET-INSTALLS-001 | 2026-05-08T05:49:22Z | INFO | got=200 exp= — GET ws marketplace installs · {"data":[]} |
| TC-WS-USAGE-ME-001 | 2026-05-08T05:49:22Z | INFO | got=200 exp= — GET ws usage me · {"data":{"today":{"requestCount":0,"totalTokens":0,"promptTokens":0,"completionTokens":0,"thinkingTokens":0,"totalCostUsd":0,"totalCredits":0,"avgDurationMs":0,"toolCallCount":0},"thisWeek":{"requestCount":0,"totalTokens |
| TC-WS-USAGE-CREDITS-001 | 2026-05-08T05:49:23Z | INFO | got=200 exp= — GET ws usage me credits · {"data":{"todayCredits":0,"monthCredits":0,"dailyLimit":100000,"monthlyLimit":1000000,"planType":"enterprise"}} |
| TC-WS-RUNTIME-INSTANCES-001 | 2026-05-08T05:49:23Z | INFO | got=200 exp= — GET ws runtime instances · {"data":[]} |
| TC-WS-CONTEXT-WID-001 | 2026-05-08T05:49:24Z | INFO | got=200 exp= — GET ws context · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-BILL-PLANS-001 | 2026-05-08T05:49:43Z | INFO | got=200 exp= — GET billing plans list · {"data":[{"id":"free","name":"Free","description":"For personal projects and experimentation","priceMonthly":0,"priceYearly":0,"features":["3 projects","5 daily AI credits","Community support","Doable subdomain"],"dailyC |
| TC-BILL-CREDITS-001 | 2026-05-08T05:49:43Z | INFO | got=200 exp= — GET billing credits · {"data":{"daily_remaining":100000,"daily_total":100000,"monthly_remaining":1000000,"monthly_total":1000000,"rollover_credits":0,"total_available":1100000,"daily_reset_at":"2026-05-09T05:37:01.069Z","monthly_reset_at":"20 |
| TC-BILL-CRED-USAGE-001 | 2026-05-08T05:49:44Z | INFO | got=200 exp= — GET billing credits usage · {"data":{"rows":[],"total":0,"dailyBreakdown":[]}} |
| TC-BILL-USAGE-G-001 | 2026-05-08T05:49:44Z | INFO | got=200 exp= — GET billing usage · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-BILL-WEBHOOK-001 | 2026-05-08T05:49:45Z | INFO | got=400 exp= — POST billing webhook empty body · {"error":"Missing stripe-signature header"} |
| TC-VER-LIST-001 | 2026-05-08T05:49:45Z | INFO | got=200 exp= — GET projects versions · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-EDIT-FILES-LIST-001 | 2026-05-08T05:49:46Z | INFO | got=200 exp= — GET projects files · {"data":[]} |
| TC-PROV-CAT-001 | 2026-05-08T05:49:46Z | INFO | got=200 exp= — GET ai provider-catalog · {"data":[{"id":"openai","name":"OpenAI","category":"cloud","subcategory":"major","sdkType":"openai","defaultBaseUrl":"https://api.openai.com/v1","baseUrlEditable":true,"authMethod":"bearer","apiKeyPrefix":"sk-","apiKeyPl |
| TC-SEC-RESULTS-001 | 2026-05-08T05:49:47Z | INFO | got=200 exp= — GET projects security results · {"scan":null,"findings":[]} |
| TC-DOM-PROJ-001 | 2026-05-08T05:49:48Z | INFO | got=200 exp= — GET domains project · {"data":[]} |
| TC-COMM-DISCOVER-001 | 2026-05-08T05:49:48Z | INFO | got=200 exp= — GET community discover anon · {"data":{"projects":[],"total":0,"page":1,"pageSize":20}} |
| TC-COMM-MY-SHARED-001 | 2026-05-08T05:49:49Z | INFO | got=200 exp= — GET community my shared · {"data":{"projectIds":[]}} |
| TC-PLAN-001 | 2026-05-08T05:49:49Z | INFO | got=200 exp= — GET projects plan · {"data":null} |
| TC-RUN-PROJ-001 | 2026-05-08T05:49:50Z | INFO | got=200 exp= — GET projects runtime · {"data":null} |
| TC-RUN-METRICS-001 | 2026-05-08T05:49:51Z | INFO | got=200 exp= — GET projects runtime metrics · {"data":{"state":"unknown","uptimeMs":null,"memoryBytes":null,"cpuPct":null,"source":"none"}} |
| TC-RUN-LOGS-001 | 2026-05-08T05:49:51Z | INFO | got=200 exp= — GET projects runtime logs · {"data":[],"reason":"no runtime registered"} |
| TC-RBAC-WS-CONNECTORS-001 | 2026-05-08T05:50:32Z | INFO | got=403 exp= — Cross-tenant ws connectors 403 · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-SKILLS-001 | 2026-05-08T05:50:32Z | INFO | got=403 exp= — Cross-tenant ws skills 403 · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-ENVVARS-001 | 2026-05-08T05:50:33Z | INFO | got=403 exp= — Cross-tenant ws env-vars 403 · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-MEMBERS-001 | 2026-05-08T05:50:33Z | INFO | got=403 exp= — Cross-tenant ws members 403 · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-INVITES-001 | 2026-05-08T05:50:34Z | INFO | got=403 exp= — Cross-tenant ws invites 403 · {"error":"Not a member of this workspace"} |
| TC-RBAC-PROJ-FILES-001 | 2026-05-08T05:50:34Z | INFO | got=404 exp= — Cross-tenant proj files 403/404 · {"error":"Project not found"} |
| TC-RBAC-PROJ-VERSIONS-001 | 2026-05-08T05:50:35Z | INFO | got=404 exp= — Cross-tenant proj versions 403/404 · {"error":"Project not found"} |
| TC-RBAC-PROJ-RUNTIME-001 | 2026-05-08T05:50:36Z | INFO | got=404 exp= — Cross-tenant proj runtime 403/404 · {"error":"Project not found"} |
| TC-RBAC-PROJ-CHAT-Q-001 | 2026-05-08T05:50:36Z | INFO | got=404 exp= — Cross-tenant proj chat queue 403/404 · {"error":"Project not found"} |
| TC-WS-INVITE-CREATE-001 | 2026-05-08T05:50:37Z | INFO | got=201 exp= — POST ws members invite (admin) · {"data":{"id":"1591071e-844b-4ec0-b681-0f17020d11e1","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","email":"qa-bob@doable.test","role":"member","token":"7d53ec32944bcde800e41b91d8a16ac48120cb919a750743030e15b69a8 |
| TC-WS-INVITE-RBAC-001 | 2026-05-08T05:50:37Z | PASS | got=403 exp=403 — Non-admin invite returns 403 · {"error":"Not a member of this workspace"} |
| TC-EDIT-CREATE-001 | 2026-05-08T05:50:38Z | INFO | got=201 exp= — POST projects files (create file) · {"data":{"path":"src/qa-test.txt","updatedAt":"2026-05-08T05:50:37.519Z"}} |
| TC-EDIT-PUT-001 | 2026-05-08T05:50:38Z | INFO | got=200 exp= — PUT projects files content update · {"data":{"path":"src/qa-test.txt","size":16,"updatedAt":"2026-05-08T05:50:38.061Z"}} |
| TC-EDIT-GET-FILE-001 | 2026-05-08T05:50:39Z | INFO | got=200 exp= — GET single file content · {"data":{"path":"src/qa-test.txt","content":"hello qa updated"}} |
| TC-TEMPL-GET-001 | 2026-05-08T05:50:39Z | INFO | got=404 exp= — GET first template by id (use list) · {"error":"Template not found"} |
| TC-MKT-LIST-PUB-001 | 2026-05-08T05:50:40Z | INFO | got=200 exp= — GET marketplace listings public · {"data":[],"total":0} |
| TC-MKT-CAT-PUB-001 | 2026-05-08T05:50:40Z | INFO | got=200 exp= — GET marketplace categories public · {"data":[{"id":"6eaad3c4-0915-4f3e-974b-77f809d5dc0c","slug":"frontend","name":"Frontend","description":"React, Vue, Svelte and other frontend frameworks","icon":"🎨","sort_order":1,"created_at":"2026-05-07T20:31:01.54 |
| TC-MKT-FEAT-PUB-001 | 2026-05-08T05:50:41Z | INFO | got=200 exp= — GET marketplace featured public · {"data":[]} |
| TC-FOLDER-CREATE-002 | 2026-05-08T05:50:42Z | PASS | POST /folders second folder · {"data":{"id":"59d8d6dc-cb86-4ea4-ad70-681ed69cfb28","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Folder-2","parent_id":null,"position":0,"created_at":"2026-05-08T05:50:40.915Z"}} |
| TC-FOLDER-GET-001 | 2026-05-08T05:50:42Z | INFO | got=200 exp= — GET folders id · {"data":{"id":"59d8d6dc-cb86-4ea4-ad70-681ed69cfb28","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Folder-2","parent_id":null,"position":0,"created_at":"2026-05-08T05:50:40.915Z","children":[]}} |
| TC-FOLDER-PATCH-001 | 2026-05-08T05:50:42Z | INFO | got=200 exp= — PATCH folders id rename · {"data":{"id":"59d8d6dc-cb86-4ea4-ad70-681ed69cfb28","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Folder-2-renamed","parent_id":null,"position":0,"created_at":"2026-05-08T05:50:40.915Z"}} |
| TC-FOLDER-DELETE-001 | 2026-05-08T05:50:43Z | INFO | got=200 exp= — DELETE folders id · {"data":{"id":"59d8d6dc-cb86-4ea4-ad70-681ed69cfb28","deleted":true}} |
| TC-VER-CREATE-001 | 2026-05-08T05:50:43Z | INFO | got=400 exp= — POST projects versions snapshot · {"error":"Missing required fields: createdBy, projectPath"} |
| TC-PROJ-CREATE-RBAC-001 | 2026-05-08T05:50:44Z | PASS | got=403 exp=403 — Create project in another's WS returns 403 · {"error":"Access denied — requires member role or higher"} |
| TC-CHAT-SEND-001 | 2026-05-08T05:50:44Z | INFO | got=200 exp= — POST projects chat send (agent mode hello) · data: {"type":"thinking","data":"Preparing workspace..."}  data: {"type":"status","data":{"phase":"scaffolding","message":"Creating project files..."}}  data: {"type":"thinking","data":"Creating project scaffold..."}  da |
| TC-AUTH-LOGOUT-001 | 2026-05-08T05:50:53Z | PASS | got=200 exp=200 — POST auth logout returns 200 · {"message":"Logged out successfully"} |
| TC-AUTH-FORGOT-001 | 2026-05-08T05:50:53Z | INFO | got=429 exp= — POST auth forgot-password silent ack · {"error":"Too many requests, please try again later."} |
| TC-WS-PATCH-001 | 2026-05-08T05:51:50Z | INFO | got=200 exp= — PATCH workspaces id rename · {"data":{"id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Owner WS Renamed","slug":"qa-platform-owner","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","plan":"enterprise","cre |
| TC-WS-PATCH-RBAC-001 | 2026-05-08T05:51:50Z | PASS | got=403 exp=403 — Member rename owner WS 403 · {"error":"Not a member of this workspace"} |
| TC-WS-INVITE-LINK-001 | 2026-05-08T05:51:51Z | INFO | got=201 exp= — POST workspaces invite-link · {"data":{"id":"37fb2a4f-40c1-4be2-a0e7-54a11704f6f2","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","email":"__invite_link__","role":"viewer","token":"59a5dfe24c890d977477eafcbb21be2eb262b95ae85fa3681a85f9076b85fd |
| TC-WS-CREATE-001 | 2026-05-08T05:51:51Z | INFO | got=201 exp= — POST workspaces create new · {"data":{"id":"45aad98d-e623-4a5c-b4e8-84f5308a6b7a","name":"Second WS","slug":"qa-owner-second","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","plan":"free","created_at":"2026-05- |
| TC-WS-INVITE-VAL-001 | 2026-05-08T05:51:52Z | PASS | got=400 exp=400 — POST invite bad email returns 400 · {"error":"Validation failed","details":{"email":["Invalid email"]}} |
| TC-PROJ-FILTER-DEL-001 | 2026-05-08T05:51:53Z | INFO | got=200 exp= — GET projects?includeDeleted=false default · {"data":[{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":null,"status":"draft","visibility":"private","gi |
| TC-PROJ-FILTER-VIS-001 | 2026-05-08T05:51:53Z | INFO | got=200 exp= — GET projects?visibility=private · {"data":[{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":null,"status":"draft","visibility":"private","gi |
| TC-PROJ-FILTER-Q-001 | 2026-05-08T05:51:54Z | INFO | got=200 exp= — GET projects?q=QA search · {"data":[{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":null,"status":"draft","visibility":"private","gi |
| TC-PROJ-PATCH-001 | 2026-05-08T05:51:54Z | INFO | got=200 exp= — PATCH projects id rename description · {"data":{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project","slug":"qa-test-project","description":"e2e tested","status":"draft","visibility":"publi |
| TC-PROJ-PATCH-002 | 2026-05-08T05:51:55Z | INFO | got=200 exp= — PATCH projects same slug · {"data":{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project Renamed","slug":"qa-test-project","description":"e2e tested","status":"draft","visibility |
| TC-PLAN-GEN-001 | 2026-05-08T05:51:55Z | INFO | got=404 exp= — POST projects plan generate · {"error":"Not Found","path":"/projects/a22139b7-42a5-4d51-861c-7f01a7ab7c4b/plan"} |
| TC-DIRECT-SAVE-001 | 2026-05-08T05:51:56Z | INFO | got=401 exp= — POST direct-save · {"error":"Missing or invalid Authorization header"} |
| TC-PFILES-NOAUTH-001 | 2026-05-08T05:51:57Z | INFO | got=401 exp= — GET project-files internal endpoint · {"error":"Missing or invalid Authorization header"} |
| TC-CADDY-NOTFOUND-001 | 2026-05-08T05:51:57Z | INFO | got=000 exp= — GET unpublished subdomain returns 404 ·  |
| TC-CADDY-LANDING-001 | 2026-05-08T05:51:58Z | INFO | got=200 exp= — GET landing direct (Caddy fall-through) · <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font" crossor |
| TC-COMM-PUBLISH-001 | 2026-05-08T05:51:59Z | INFO | got=308 exp= — POST community publish project ·  |
| TC-WS-PROBE-001 | 2026-05-08T05:52:00Z | INFO | got=404 exp= — GET wss://staging-ws.doable.me/health · Not Found |
| TC-TEMPL-LIST-DETAIL-001 | 2026-05-08T05:52:01Z | INFO | got=200 exp= — GET /templates root listing · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite", |
| TC-TEMPL-DETAIL-002 | 2026-05-08T05:52:58Z | INFO | got=200 exp= — GET /templates/blank · {"data":{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite","tailwind","ty |
| TC-TEMPL-PREVIEW-002 | 2026-05-08T05:52:59Z | INFO | got=200 exp= — GET /templates/blank/preview · <!DOCTYPE html> <html lang="en"> <head>   <meta charset="UTF-8" />   <meta name="viewport" content="width=device-width, initial-scale=1.0" />   <title>Blank Project — Preview</title>   <script src="https://cdn.tailwind |
| TC-TEMPL-DETAIL-003 | 2026-05-08T05:53:00Z | INFO | got=200 exp= — GET /templates/saas-dashboard · {"data":{"id":"saas-dashboard","name":"SaaS Dashboard","description":"Dashboard with sidebar navigation, auth pages, settings, and analytics placeholder. Built for B2B SaaS apps.","category":"dashboard","tags":["react"," |
| TC-TEMPL-DETAIL-NOTFOUND-001 | 2026-05-08T05:53:01Z | PASS | got=404 exp=404 — GET /templates/nonexistent 404 · {"error":"Template not found"} |
| TC-COMM-PUBLISH-002 | 2026-05-08T05:53:02Z | INFO | got=400 exp= — POST community publish project (follow redirect) · {"success":false,"error":{"issues":[{"code":"invalid_type","expected":"string","received":"undefined","path":["title"],"message":"Required"}],"name":"ZodError"}} |
| TC-DEP-PUBLISH-001 | 2026-05-08T05:53:04Z | INFO | got=200 exp= — POST /deploy/:id/publish · {"data":{"deploymentId":"ce537a53-e69f-4a54-85cb-438284ffe646","url":"https://project-renamed-0mflv.staging.doable.me","status":"live","durationMs":5917}} |
| TC-VER-CREATE-002 | 2026-05-08T05:53:11Z | INFO | got=400 exp= — POST projects versions valid payload · {"error":"Missing required fields: createdBy, projectPath"} |
| TC-VER-AUTO-001 | 2026-05-08T05:53:12Z | INFO | got=400 exp= — POST projects versions/auto · {"error":"Missing required field: createdBy"} |
| TC-VER-UNDO-001 | 2026-05-08T05:53:12Z | INFO | got=400 exp= — POST projects versions/undo · {"error":"Missing required field: messageId"} |
| TC-EDIT-PUT-002 | 2026-05-08T05:53:13Z | INFO | got=200 exp= — PUT /projects/:id/files/* update content · {"data":{"path":"src/qa-test.txt","size":16,"updatedAt":"2026-05-08T05:53:12.969Z"}} |
| TC-EDIT-DEL-001 | 2026-05-08T05:53:14Z | INFO | got=200 exp= — DELETE /projects/:id/files/* removes file · {"data":{"deleted":true,"path":"src/qa-test.txt"}} |
| TC-PLAN-POST-001 | 2026-05-08T05:53:15Z | INFO | got=404 exp= — POST projects plan run · {"error":"Not Found","path":"/projects/a22139b7-42a5-4d51-861c-7f01a7ab7c4b/plan"} |
| TC-PLAN-GEN-001 | 2026-05-08T05:53:16Z | INFO | got=404 exp= — POST projects plan/generate · {"error":"Not Found","path":"/projects/a22139b7-42a5-4d51-861c-7f01a7ab7c4b/plan/generate"} |
| TC-WS-TRANSFER-001 | 2026-05-08T05:53:17Z | INFO | got=400 exp= — POST /workspaces/:id/transfer (owner) · {"error":"Validation failed","details":{"newOwnerId":["Required"]}} |
| TC-NOTIF-G-001 | 2026-05-08T05:53:17Z | INFO | got=404 exp= — GET /notifications search · {"error":"Not Found","path":"/notifications"} |
| TC-PREVIEW-001 | 2026-05-08T05:53:18Z | INFO | got=200 exp= — GET /preview/:id (preview proxy) · <!doctype html> <html lang="en">   <head><script> (function() {   try {     var PREFIX = "__a22139b7-42a5-4d51-861c-7f01a7ab7c4b__";      // Detect whether real Storage is accessible (opaque-origin iframes throw)     var |
| TC-PUBLISH-LIVE-001 | 2026-05-08T05:53:48Z | INFO | got=000 exp= — GET https://project-renamed-0mflv.staging.doable.me/ public ·  |
| TC-PUBLISH-LIVE-DIRECT-001 | 2026-05-08T05:53:48Z | INFO | got=000 exp= — GET via Host header at staging.doable.me/ ·  |
| TC-UI-DASHBOARD-CRASH-001 | 2026-05-08T05:55:00Z | **FAIL** | got=200 (HTML) but client-side React Error #310 thrown — dashboard error boundary shows "Something went wrong". Sidebar renders fine (workspace name, plan, credits, project count). Reproduced for both fresh new workspace and existing enterprise workspace. Stack: page-bb89828efc5ed020.js → useEffect inside U → ae aF aM. **BUG: dashboard page crashes due to hooks rule violation.** |
| TC-UI-ADMIN-001 | 2026-05-08T05:55:30Z | PASS | got=200 — /admin loads platform admin panel with Feature Flags / Users & AI / Integrations / Plans / AI Tools / Thumbnails / Sessions / Email tabs and Projects/Runtime/Chat/Audit/Moderation quick links. React (Vite) + Next.js framework toggles render. |
| TC-UI-ADMIN-PROJECTS-001 | 2026-05-08T05:56:00Z | PASS | got=200 — /admin/projects renders 2 projects: QA Test Project Renamed (vite-react, running, public) + Smoke Project (vite-react, draft). Sortable columns, filter input. Pagination footer. |
| TC-UI-BILLING-001 | 2026-05-08T05:56:30Z | PASS | got=200 — /billing renders Enterprise plan: 1,100,000 credits available, Unlimited daily/monthly bars, 100k Daily / 1M Monthly / 0 Rollover. Manage Subscription + Buy 100 Credits CTAs. Stripe-bypass via DB reflected correctly. |
| TC-UI-EDITOR-001 | 2026-05-08T05:57:00Z | PASS | got=200 — /editor/:id renders dual-pane: AI chat panel left ("Start a conversation", suggestions: SaaS landing/kanban/recipe app/portfolio site), live preview right showing the Doable Vite project. Toolbar: Share/Connect GitHub/Upgrade/Deploy. Runtime status: STOPPED, polling 5s. |
| TC-UI-WS-SETTINGS-001 | 2026-05-08T05:57:30Z | PASS | got=200 — /workspace-settings shows tabs (General/Environments/Integrations/MCP Servers/Skills & Rules/Knowledge); Plan: Enterprise; Your role: Owner. Editable name + description. |
| TC-UI-MARKETPLACE-001 | 2026-05-08T05:57:45Z | PASS | got=200 — /marketplace renders search bar, category chips (All/Frontend/Backend/Full-Stack/Database/Testing/DevOps/Design/AI/ML), Popular/Newest/Rating tabs, empty state "No listings found", Import / My listings / List on Marketplace CTAs. |
| TC-UI-TEMPLATES-001 | 2026-05-08T05:58:00Z | PASS | got=200 — /dashboard/templates renders category tabs (All / Content / Dashboards / E-commerce / Marketing / Personal / Productivity / Starters), template cards w/ thumbnails, file count, "Official" badge. SaaS Dashboard (13 files), Landing Page (14 files) shown. |
| TC-UI-DISCOVER-001 | 2026-05-08T05:58:15Z | PASS | got=200 — /discover renders search, "All" tab, empty state "No community projects yet. Be the first to publish!" - clean copy + tooltip "Discover vs Marketplace" link. |
| TC-UI-AI-SETTINGS-CRASH-001 | 2026-05-08T05:58:30Z | **FAIL** | got=200 (HTML) but client-side React error #310 thrown — /ai-settings shows "Something went wrong". Same hook violation as /dashboard. **BUG: ai-settings page crashes with React #310 hooks rule violation.** |
| TC-UI-USAGE-001 | 2026-05-08T05:58:45Z | PASS | got=200 — /usage shows My Usage/Workspace Usage/Platform tabs. Today's tokens 72,198, This month's cost $0.00, 4 monthly requests, 4.9s avg response, 0 credits used (enterprise unlimited). Credit Usage donut charts at 0% Today / 0% This Month. ENTERPRISE PLAN badge. |
| TC-UI-RUNTIME-001 | 2026-05-08T05:58:55Z | PASS | got=200 — /runtime shows Running instances table: 1 row (QA Test Project Renamed, qa-test-project) STOPPED. Columns: Project / State / Uptime / Memory / CPU / Last active. Polls every 8s. |
| TC-UI-SETTINGS-001 | 2026-05-08T05:59:00Z | PASS | got=200 — /settings shows Profile section: avatar, Display name input (editable), Email field (read-only with "Contact support to change..." copy), Save changes CTA. |
| TC-UI-ADMIN-RUNTIME-001 | 2026-05-08T05:59:30Z | PASS | got=200 — /admin/runtime shows Dev Servers (1) and Published Apps tabs; Total Servers 1, Alive 1, Ready 1, Total RAM 140.9 MB. Row: QA Test Project Renamed (vite-react) listening 127.0.0.1:3100, PID 69953, Status ready, Memory 140.9 MB, Uptime 8m 29s. Auto-refresh on. |
| TC-UI-ADMIN-MODERATION-001 | 2026-05-08T05:59:45Z | PASS | got=200 — /admin/moderation shows Review queue + Reports tabs, "No listings awaiting review" empty state. |
| TC-UI-ADMIN-DEV-SERVERS-001 | 2026-05-08T05:59:50Z | PASS | got=200 — /admin/dev-servers (alias of /admin/runtime) renders Dev Servers tab with same data (1 ready instance). |
| TC-UI-ADMIN-CHAT-001 | 2026-05-08T06:00:00Z | PASS | got=200 — /admin/chat shows Chat Sessions (0) with "Read-only audit view. Message content is auto-redacted (passwords, JWTs, API keys, hex blobs, DB URLs). Every thread you open is recorded in the admin audit log with your name + timestamp." Filter input + All modes dropdown. |
| TC-UI-ADMIN-TRACE-001 | 2026-05-08T06:00:15Z | PASS | got=200 — /admin/trace renders Trace search form: USER ID / WORKSPACE ID / STATUS dropdown / FROM / TO datetime / ROOT SPAN NAME CONTAINS. Empty state "No traces match these filters." Click row to open flame graph. |
| TC-UI-RBAC-ADMIN-001 | 2026-05-08T06:00:30Z | **FINDING** | Switched localStorage to qa-bob (non-admin); /admin still renders System Administration page with all feature flag toggles visible. doable_user has isPlatformAdmin:false but UI does NOT redirect or hide admin controls; user can SEE the page (toggles still server-gated and would 403). Recommend client-side guard (redirect to /dashboard with "not authorized" toast) to avoid info-leak of platform feature names. **BUG: client-side admin gate missing.** |
| TC-UI-RBAC-ADMIN-002 | 2026-05-08T06:00:35Z | **FINDING** | Header avatar in sidebar (bottom-left) shows "QA Platform Owner / qa-owner@doable.test" even though localStorage doable_user now contains qa-bob. Auth provider does not re-read storage on navigation, so a stale identity persists. **BUG: stale identity displayed after token swap; refresh required.** |
| TC-RBAC-PROJ-PATCH-001 | 2026-05-08T06:02:10Z | INFO | got=401 exp= — Cross-tenant project PATCH 403/404 · {"error":"Token expired"} |
| TC-RBAC-PROJ-DELETE-001 | 2026-05-08T06:02:11Z | INFO | got=401 exp= — Cross-tenant project DELETE 403/404 · {"error":"Token expired"} |
| TC-RBAC-PROJ-FILE-CREATE-001 | 2026-05-08T06:02:12Z | INFO | got=401 exp= — Cross-tenant create file 403/404 · {"error":"Token expired"} |
| TC-RBAC-WS-PATCH-001 | 2026-05-08T06:02:13Z | INFO | got=401 exp= — Cross-tenant workspace PATCH 403/404 · {"error":"Token expired"} |
| TC-RBAC-WS-DELETE-001 | 2026-05-08T06:02:14Z | INFO | got=401 exp= — Cross-tenant workspace DELETE 403/404 · {"error":"Token expired"} |
| TC-RBAC-WS-INVITE-001 | 2026-05-08T06:02:14Z | INFO | got=401 exp= — Cross-tenant workspace invite 403/404 · {"error":"Token expired"} |
| TC-RBAC-WS-ENVVAR-CREATE-001 | 2026-05-08T06:02:15Z | INFO | got=401 exp= — Cross-tenant ws env-var create 403 · {"error":"Token expired"} |
| TC-VIEWER-RBAC-001 | 2026-05-08T06:02:16Z | INFO | got=401 exp= — Viewer cannot create project · {"error":"Token expired"} |
| TC-VIEWER-INVITE-001 | 2026-05-08T06:02:17Z | FAIL | got=401 exp=403 — Viewer tries invite returns 403 · {"error":"Token expired"} |
| TC-API-LONGPATH-001 | 2026-05-08T06:02:20Z | INFO | got=401 exp= — GET very long path returns 4xx · {"error":"Token expired"} |
| TC-SEC-SQL-PROJ-001 | 2026-05-08T06:02:21Z | INFO | got=000 exp= — GET projects with SQLi in workspaceId returns 4xx ·  |
| TC-SEC-HDR-001 | 2026-05-08T06:02:21Z | INFO | got=401 exp= — Authorization with newline returns 401/400 · {"error":"Invalid token"} |
| TC-API-METHOD-001 | 2026-05-08T06:02:22Z | INFO | got=401 exp= — PUT /health returns 405/404/200 · {"error":"Missing or invalid Authorization header"} |
| TC-API-TRAIL-001 | 2026-05-08T06:02:23Z | INFO | got=308 exp= — GET /health/ trailing slash ·  |
| TC-API-HEALTHDB-001 | 2026-05-08T06:02:23Z | INFO | got=401 exp= — GET /health/db (re-check) · {"error":"Token expired"} |
| TC-AUTH-REFRESH-001 | 2026-05-08T06:02:24Z | FAIL | got=401 exp=200 — POST /auth/refresh with valid refresh token · {"error":"Refresh token has been revoked"} |
| TC-MARKET-LISTING-CREATE-001 | 2026-05-08T06:02:25Z | INFO | got=401 exp= — POST workspaces marketplace listing · {"error":"Token expired"} |
| TC-RBAC-PROJ-PATCH-002 | 2026-05-08T06:04:14Z | INFO | got=403 exp= — Cross-tenant project PATCH 403/404 (fresh) · {"error":"Viewers cannot edit projects"} |
| TC-RBAC-PROJ-DELETE-002 | 2026-05-08T06:04:17Z | INFO | got=403 exp= — Cross-tenant project DELETE 403/404 (fresh) · {"error":"Only workspace owners and admins can delete projects"} |
| TC-RBAC-PROJ-FILE-CREATE-002 | 2026-05-08T06:04:20Z | INFO | got=201 exp= — Cross-tenant create file 403/404 (fresh) · {"data":{"path":"hack.txt","updatedAt":"2026-05-08T06:04:20.623Z"}} |
| TC-RBAC-WS-PATCH-002 | 2026-05-08T06:04:23Z | PASS | got=403 exp=403 — Cross-tenant workspace PATCH 403 (fresh) · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-DELETE-002 | 2026-05-08T06:04:24Z | PASS | got=403 exp=403 — Cross-tenant workspace DELETE 403 (fresh) · {"error":"Not a member of this workspace"} |
| TC-RBAC-WS-INVITE-002 | 2026-05-08T06:04:26Z | PASS | got=403 exp=403 — Cross-tenant workspace invite 403 (fresh) · {"error":"Not a member of this workspace"} |
| TC-VIEWER-RBAC-002 | 2026-05-08T06:04:27Z | INFO | got=201 exp= — Viewer cannot create project in own ws (lacks member role) · {"data":{"id":"e7c19ef3-d5ad-4a90-9f8d-414a2291dd99","workspace_id":"cc137477-2d01-4b75-922c-da3272f88aec","name":"v","slug":"v-mowifnmg","description":null,"status":"draft","visibility":"private","github_repo_url":null, |
| TC-VIEWER-INVITE-002 | 2026-05-08T06:04:30Z | FAIL | got=201 exp=403 — Viewer tries invite to own ws (admin required) returns 403 · {"data":{"id":"0443e5e2-4b8f-4e09-ba78-d71434dc44e5","workspace_id":"cc137477-2d01-4b75-922c-da3272f88aec","email":"x@x.test","role":"member","token":"ca83a57b9c920db6f6ec680aed55c89aab87d9eed6606fa92171c4eb00adb89c","in |
| TC-VIEWER-READ-FOREIGN-001 | 2026-05-08T06:04:31Z | INFO | got=403 exp= — Viewer cannot read owner's ws · {"error":"Not a member of this workspace"} |
| TC-API-LONGPATH-002 | 2026-05-08T06:04:34Z | INFO | got=500 exp= — GET very long path 4xx (fresh) · {"error":"Internal Server Error","message":"invalid input syntax for type uuid: \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
| TC-SEC-HDR-002 | 2026-05-08T06:04:36Z | INFO | got=401 exp= — Authorization with newline 401/400 (fresh) · {"error":"Invalid token"} |
| TC-API-METHOD-002 | 2026-05-08T06:04:37Z | INFO | got=401 exp= — PUT /health 405/404 (fresh) · {"error":"Missing or invalid Authorization header"} |
| TC-API-OPTIONS-001 | 2026-05-08T06:04:38Z | INFO | got=204 exp= — OPTIONS /auth/me CORS preflight ·  |
| TC-API-OPTIONS-002 | 2026-05-08T06:04:40Z | INFO | got=204 exp= — OPTIONS /auth/me from disallowed origin ·  |
| TC-API-HEALTHDB-002 | 2026-05-08T06:04:41Z | INFO | got=404 exp= — GET /health/db (fresh) · {"error":"Not Found","path":"/health/db"} |
| TC-API-HEALTHDB-003 | 2026-05-08T06:04:42Z | INFO | got=401 exp= — GET /health/db unauth · {"error":"Missing or invalid Authorization header"} |
| TC-SEC-JWT-EXP-001 | 2026-05-08T06:04:44Z | PASS | got=401 exp=401 — Expired JWT returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-SEC-JWT-WRONGISS-001 | 2026-05-08T06:04:48Z | PASS | got=401 exp=401 — JWT with wrong issuer returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-SEC-JWT-WRONGSIG-001 | 2026-05-08T06:04:50Z | PASS | got=401 exp=401 — JWT signed with wrong secret returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-SEC-JWT-NOSUB-001 | 2026-05-08T06:04:52Z | PASS | got=401 exp=401 — JWT with no sub returns 401 · {"error":"Missing or invalid Authorization header"} |
| TC-SEC-PROJ-FILE-CROSS-001 | 2026-05-08T06:05:00Z | **FAIL — BUG** | got=201 `{"data":{"path":"hack.txt"}}` — qa-bob (NO collaborator role on project) was able to POST /projects/:id/files and got 201 Created. Owner subsequent GET /files/hack.txt → 404 and listing doesn't show hack.txt. Investigation: editorRoutes only applies authMiddleware, no project access guard (services/api/src/routes/editor.ts:10). The write hits an in-memory `projectFiles` Map keyed by projectId — bob's write may be in a different process scoped to his projectFiles entry, OR silently overwritten by reload from disk. **CONFIRMED BUG: /projects/:id/files routes lack project ownership/collaborator check; cross-tenant POST returns 201 instead of 403.** Impact: limited because the in-memory store is not the source of truth, but principle of least privilege violated and could cause confusion or future issues. Severity: high. |
| TC-SEC-JWT-EXP-001 | 2026-05-08T06:05:30Z | PASS | got=401 — Expired JWT (exp 1h in past, valid signature) rejected. |
| TC-SEC-JWT-WRONGISS-001 | 2026-05-08T06:05:35Z | PASS | got=401 — JWT with iss=WRONG (vs expected `doable`) rejected. |
| TC-SEC-JWT-WRONGSIG-001 | 2026-05-08T06:05:40Z | PASS | got=401 — JWT signed with arbitrary unknown HS256 secret rejected. |
| TC-SEC-JWT-NOSUB-001 | 2026-05-08T06:05:45Z | PASS | got=401 — JWT missing `sub` claim rejected. |
| TC-API-LONGPATH-002 | 2026-05-08T06:05:50Z | **FAIL** | got=500 — request with 2000-char project ID in path returns 500 Internal Server Error. Should return 400/404/414. **BUG: very long path triggers server error instead of validation failure.** |
| TC-API-OPTIONS-001 | 2026-05-08T06:06:00Z | PASS | got=204 — OPTIONS preflight from staging.doable.me allowed (CORS allow-list correct). |
| TC-API-OPTIONS-002 | 2026-05-08T06:06:05Z | INFO | got=204 — OPTIONS preflight from evil.example.com also returns 204; verify Access-Control-Allow-Origin header value (likely null/missing for disallowed). |
| TC-AUTH-LOGIN-RATELIMIT-001 | 2026-05-08T06:06:10Z | PASS | The 11th login attempt within 15 min returned 429 — login rate limiter (10/15m) enforced. |
| TC-AUTH-FORGOT-RATELIMIT-001 | 2026-05-08T06:06:15Z | PASS | The 4th forgot-password attempt within 1 hour returned 429 — forgot-password rate limiter (3/hour) enforced. |
| TC-AUTH-REGISTER-RATELIMIT-001 | 2026-05-08T06:06:20Z | PASS | The 6th register attempt within 1 hour returned 429 — register rate limiter (5/hour) enforced. |
| TC-SEC-CORS-001 | 2026-05-08T06:06:30Z | **FAIL — BUG (HIGH)** | got=204 + `access-control-allow-origin: https://evil.example.com` + `access-control-allow-credentials: true` + `access-control-allow-headers: Authorization,...` — server REFLECTS arbitrary Origin in CORS preflight, accepting any cross-origin request with credentials. Configured `CORS_ORIGINS=https://staging.doable.me` is ignored. Practical impact for JWT-in-localStorage is limited (SOP still protects localStorage), but it violates the principle of least privilege and would be catastrophic if app ever moved to cookie auth. **Misconfigured CORS allow-list — should reject Origin not in env var.** |
| TC-SEC-CORS-002 | 2026-05-08T06:06:35Z | **FAIL — BUG (HIGH)** | Confirmed: same misconfiguration on actual GET requests — `access-control-allow-origin: https://evil.example.com` returned even on real GET /auth/me. |
| TC-MKT-INSTALL-NONEXISTENT-001 | 2026-05-08T06:07:20Z | INFO | got=404 exp= — POST install non-existent listing 404/400 · {"error":"Listing not found"} |
| TC-CONN-PROXY-001 | 2026-05-08T06:07:21Z | INFO | got=401 exp= — POST connector-proxy without JWT 401 · {"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing Authorization: Bearer <token>"}} |
| TC-DIRECT-SAVE-002 | 2026-05-08T06:07:22Z | INFO | got=401 exp= — POST /__doable/direct-save no-auth route · {"error":"Missing or invalid Authorization header"} |
| TC-PFILES-002 | 2026-05-08T06:07:23Z | INFO | got=401 exp= — GET /__doable/project-files/:id/index.html (filesystem-backed) · {"error":"Missing or invalid Authorization header"} |
| TC-ADMIN-FEATURES-001 | 2026-05-08T06:07:24Z | INFO | got=200 exp= — GET /admin/features/check/marketplace · {"allowed":true,"reason":"platform_admin"} |
| TC-ADMIN-FEATURES-002 | 2026-05-08T06:07:25Z | INFO | got=200 exp= — GET /admin/features/check/non_existent · {"allowed":true,"reason":"platform_admin"} |
| TC-ADMIN-TRACING-001 | 2026-05-08T06:07:25Z | INFO | got=404 exp= — GET /admin/tracing (unsure of exact route) · {"error":"Not Found","path":"/admin/tracing"} |
| TC-PLAN-GET-001 | 2026-05-08T06:07:26Z | INFO | got=200 exp= — GET /projects/:id/plan correct route · {"data":null} |
| TC-SEC-SCAN-001 | 2026-05-08T06:07:26Z | INFO | got=200 exp= — POST /projects/:id/security/scan · {"scan":{"id":"b2e2f64f-4e0c-4988-82da-5e3b37250434","projectId":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","status":"completed","findingsCount":0,"filesScanned":10,"duration":656},"findings":[]} |
| TC-FRAMEWORK-PUB-001 | 2026-05-08T06:07:28Z | INFO | got=401 exp= — GET /frameworks public list · {"error":"Missing or invalid Authorization header"} |
| TC-FRAMEWORK-PUB-002 | 2026-05-08T06:07:28Z | INFO | got=401 exp= — GET /api/frameworks public list · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-POST-001 | 2026-05-08T06:07:29Z | INFO | got=404 exp= — POST /templates with auth · {"error":"Not Found","path":"/templates"} |
| TC-WS-SLUG-DUP-001 | 2026-05-08T06:07:30Z | INFO | got=409 exp= — POST workspaces with duplicate slug 409/400 · {"error":"A workspace with this slug already exists"} |
| TC-WS-SLUG-MALFORMED-001 | 2026-05-08T06:07:30Z | INFO | got=400 exp= — POST workspaces malformed slug returns 400 · {"error":"Validation failed","details":{"slug":["Invalid"]}} |
| TC-FOLDER-VAL-001 | 2026-05-08T06:07:31Z | INFO | got=400 exp= — POST folders with empty name returns 400 · {"error":"Validation failed","details":{"name":["String must contain at least 1 character(s)"]}} |
| TC-PROJ-NEW-LIMIT-001 | 2026-05-08T06:07:31Z | INFO | got=201 exp= — Owner enterprise can create many projects · {"data":{"id":"b6a5136f-90dc-4ba6-ae48-3f6728a3e2dd","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Limit Test 2","slug":"qa-limit-test-2","description":null,"status":"draft","visibility":"private","git |
| TC-PROJ-PUB-VIS-001 | 2026-05-08T06:07:32Z | INFO | got=200 exp= — Owner sets project visibility=public · {"data":{"id":"a22139b7-42a5-4d51-861c-7f01a7ab7c4b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Test Project Renamed","slug":"qa-test-project","description":"e2e tested","status":"published","visibi |
| TC-PREV-AUTH-001 | 2026-05-08T06:07:33Z | INFO | got=200 exp= — GET /preview/:id no-auth with valid published project (302/200) · <!doctype html> <html lang="en">   <head><script> (function() {   try {     var PREFIX = "__a22139b7-42a5-4d51-861c-7f01a7ab7c4b__";      // Detect whether real Storage is accessible (opaque-origin iframes throw)     var |
| TC-INTERNAL-001 | 2026-05-08T06:07:34Z | INFO | got=403 exp= — GET /internal/health public-but-internal-only · {"error":"Forbidden"} |
| TC-INTERNAL-002 | 2026-05-08T06:07:35Z | INFO | got=403 exp= — GET /internal/yjs/something without internal secret · {"error":"Forbidden"} |
| TC-DNS-API-001 | 2026-05-08T06:07:35Z | INFO | got=200 exp= — GET https://staging-api.doable.me works · {"status":"healthy","timestamp":"2026-05-08T06:07:35.253Z","version":"0.1.0","uptime":5099.10551045,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":277471232,"heapUsedBytes":105304024,"heapTotalBy |
| TC-DNS-WS-001 | 2026-05-08T06:07:36Z | INFO | got=404 exp= — GET https://staging-ws.doable.me serves WS HTTP probe · Not Found |
## 2026-05-13 -- Ralph R9 dev run (https://dev-api.doable.me)
| Test ID | UTC | Result | Description (evidence) |
|---------|-----|--------|------------------------|
| TC-001 | 2026-05-13T18:14:04Z | PASS | GET /health -> HTTP 200 |
| TC-002 | 2026-05-13T18:14:04Z | PASS | GET /auth/me (owner token) -> HTTP 200 |
| TC-003 | 2026-05-13T18:14:04Z | PASS | GET /auth/me (no auth) -> HTTP 401 |
| TC-004 | 2026-05-13T18:14:04Z | PASS | GET /auth/me (malformed) -> HTTP 401 |
| TC-005 | 2026-05-13T18:14:04Z | PASS | GET /workspaces (owner) -> HTTP 200 |
| TC-006 | 2026-05-13T18:14:04Z | PASS | GET /projects?workspaceId=... -> HTTP 200 |
| TC-007 | 2026-05-13T18:14:04Z | FAIL | GET /templates -> HTTP 401 [testcases/evidence/dev/TC-007.body] |
| TC-008 | 2026-05-13T18:14:04Z | PASS | GET /marketplace/listings -> HTTP 200 |
| TC-009 | 2026-05-13T18:14:04Z | PASS | POST /projects (vite-react) -> HTTP 201 |
| TC-010 | 2026-05-13T18:14:04Z | INFO | GET /projects/:id (skipped) |
| TC-011 | 2026-05-13T18:14:04Z | FAIL | GET /billing/usage -> HTTP 400 [testcases/evidence/dev/TC-011.body] |

**Summary**: 8 PASS, 2 FAIL, 1 INFO (11 probes)
**Project Created**: 9c521376-d56e-48d0-8bc5-c387ac20f83a

---

## Run: Collaborative Multi-User Testing — 2026-05-14

**Target:** https://dev.doable.me
**API:** https://dev-api.doable.me
**WS:** https://dev-ws.doable.me
**Run timestamp:** 2026-05-14T17:00:00Z–17:45:00Z
**Tester:** claude-sonnet-4-6 (QA Tester agent)
**User A (Chrome):** owner-pro@doable.me
**User B (Playwright):** ws-member@doable.me
**Focus:** Design mode, cursor presence, live editing, shared preview, workspace sharing, AI chat collaboration

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-COLLAB-WEB-HEALTH | 2026-05-14T17:30:00Z | PASS | GET dev.doable.me → 200 OK, frontend loads |
| TC-COLLAB-WS-HEALTH | 2026-05-14T17:30:00Z | PASS | GET dev-ws.doable.me/health → 200 OK |
| TC-COLLAB-API-HEALTH | 2026-05-14T17:30:00Z | FAIL | GET dev-api.doable.me/health → 502 Bad Gateway — API server down [BUG-COLLAB-002] |
| TC-COLLAB-LOGIN-A | 2026-05-14T17:35:00Z | FAIL | owner-pro login via Chrome → 429 rate limit then 502 [BUG-COLLAB-001, BUG-COLLAB-002] |
| TC-COLLAB-LOGIN-B | 2026-05-14T17:35:00Z | FAIL | ws-member login via Playwright → 502 "Something went wrong" [BUG-COLLAB-002, BUG-COLLAB-003] |
| TC-COLLAB-RATE-LIMIT-UX | 2026-05-14T17:35:00Z | FAIL | Rate limit message has no retry-after time [BUG-COLLAB-001] |
| TC-COLLAB-PREVIEW-WS | 2026-05-14T17:40:00Z | FAIL | wss://dev-api.doable.me/preview/{id}/ → 502, retries infinitely [BUG-COLLAB-004] |
| TC-COLLAB-RUNTIME-METRICS | 2026-05-14T17:40:00Z | FAIL | GET /projects/{id}/runtime/metrics → 404, client polls in tight loop [BUG-COLLAB-005] |
| TC-COLLAB-GITHUB-STATUS | 2026-05-14T17:40:00Z | FAIL | GET /{projectId}/github/status → 404 [BUG-COLLAB-006] |
| TC-COLLAB-DESIGN-MODE | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 blocks login [BUG-COLLAB-002] |
| TC-COLLAB-CURSOR-PRESENCE | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 blocks login [BUG-COLLAB-002] |
| TC-COLLAB-LIVE-EDIT | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 blocks login [BUG-COLLAB-002] |
| TC-COLLAB-SHARED-PREVIEW | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 + preview WS 502 [BUG-COLLAB-002, BUG-COLLAB-004] |
| TC-COLLAB-WORKSPACE-SHARE | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 blocks login [BUG-COLLAB-002] |
| TC-COLLAB-AI-CHAT-MULTI | 2026-05-14T17:45:00Z | BLOCKED | Cannot test — API 502 blocks login [BUG-COLLAB-002] |

**Summary**: 2 PASS, 6 FAIL, 0 INFO, 7 BLOCKED (15 probes)
**Root cause**: dev-api.doable.me returning 502 on all endpoints — API server is down
**Bugs filed**: BUG-COLLAB-001 through BUG-COLLAB-006 (6 bugs)
**Evidence**: testcases/evidence/dev/batch-2026-05-14/collab-results.json

| TC-WS-CRUD-001 | 2026-05-14T17:33:00Z | PASS | GET /workspaces lists user workspaces — 200 {data:[{plan:'pro',userRole:'owner',memberCount:1,credits:{...}}]} |
| TC-WS-CRUD-003 | 2026-05-14T17:33:00Z | PASS | GET /workspaces no Bearer => 401 |
| TC-WS-CRUD-004 | 2026-05-14T17:33:19Z | PASS | POST /workspaces happy path — 201 {slug:'qa-test-ws-001',plan:'free'} |
| TC-WS-CRUD-006 | 2026-05-14T17:33:20Z | PASS | POST missing name => 400 Validation failed |
| TC-WS-CRUD-007 | 2026-05-14T17:33:20Z | PASS | POST missing slug => 400 Validation failed |
| TC-WS-CRUD-010 | 2026-05-14T17:33:21Z | PASS | POST name empty => 400 |
| TC-WS-CRUD-011 | 2026-05-14T17:33:21Z | PASS | POST slug length 2 => 400 |
| TC-WS-CRUD-015 | 2026-05-14T17:33:21Z | PASS | POST slug uppercase => 400 |
| TC-WS-CRUD-016 | 2026-05-14T17:33:21Z | PASS | POST slug starts with hyphen => 400 |
| TC-WS-CRUD-017 | 2026-05-14T17:33:21Z | PASS | POST slug ends with hyphen => 400 |
| TC-WS-CRUD-022 | 2026-05-14T17:33:22Z | PASS | POST duplicate slug => 409 |
| TC-WS-CRUD-029 | 2026-05-14T17:33:22Z | PASS | GET /:id returns workspace — 200 |
| TC-WS-CRUD-030 | 2026-05-14T17:33:23Z | PASS | GET /:id non-member => 403 Not a member |
| TC-WS-CRUD-031 | 2026-05-14T17:33:23Z | PASS | GET non-existent UUID => 403 (membership check first) |
| TC-WS-CRUD-032 | 2026-05-14T17:33:23Z | PASS | GET malformed UUID => 400 Invalid workspace id |
| TC-WS-CRUD-033 | 2026-05-14T17:33:56Z | PASS | PATCH /:id name (owner) => 200 updated |
| TC-WS-CRUD-037 | 2026-05-14T17:33:57Z | PASS | PATCH avatarUrl invalid => 400 Invalid url |
| TC-WS-CRUD-038 | 2026-05-14T17:33:57Z | PASS | PATCH {} => 200 no-op |
| TC-WS-CRUD-039 | 2026-05-14T17:33:57Z | PASS | PATCH slug field ignored (not in schema) |
| TC-WS-CRUD-040 | 2026-05-14T17:33:58Z | PASS | PATCH owner_id ignored silently |
| TC-WS-CRUD-042 | 2026-05-14T17:38:30Z | PASS | DELETE workspace from owner => 200 {deleted:true} |
| TC-WS-CRUD-046 | 2026-05-14T17:38:31Z | PASS | DELETE idempotent — second => 403 |
| TC-WS-CRUD-048 | 2026-05-14T17:39:20Z | PASS | Transfer to non-member => 400/403 |
| TC-WS-CRUD-049 | 2026-05-14T17:39:20Z | PASS | Transfer when caller not owner => 403 |
| TC-WS-CRUD-050 | 2026-05-14T17:39:21Z | PASS | Transfer non-uuid newOwnerId => 400 |
| TC-WS-MEM-001 | 2026-05-14T17:33:58Z | PASS | GET /:id/members lists members — 200 |
| TC-WS-MEM-004 | 2026-05-14T17:33:59Z | PASS | Member listing has no password_hash |
| TC-WS-MEM-009 | 2026-05-14T17:38:32Z | PASS | DELETE self => 400 Cannot remove yourself |
| TC-WS-MEM-018 | 2026-05-14T17:38:33Z | PASS | PATCH change own role => 400 |
| TC-WS-MEM-019 | 2026-05-14T17:38:33Z | PASS | PATCH role=owner => 400 |
| TC-WS-INV-001 | 2026-05-14T17:34:42Z | PASS | Admin invites by email (pro plan) => 201 with token |
| TC-WS-INV-005 | 2026-05-14T17:34:43Z | PASS | Invite missing email => 400 |
| TC-WS-INV-006 | 2026-05-14T17:34:43Z | PASS | Invite invalid email => 400 |
| TC-WS-INV-008 | 2026-05-14T17:34:43Z | PASS | Invite role=owner => 400 enum error |
| TC-WS-INV-009 | 2026-05-14T17:35:10Z | PASS | Invite existing member => 409 |
| TC-WS-INV-021 | 2026-05-14T17:35:11Z | PASS | GET /:id/invites (admin+) => 200 list |
| TC-WS-INV-023 | 2026-05-14T17:39:00Z | PASS | DELETE invite revokes it => {revoked:true} |
| TC-WS-INV-028 | 2026-05-14T17:39:10Z | FAIL | Accept invite with wrong-email user — no email match check; owner-pro accepted viewer invite, demoted own role. BUG filed: 2026-05-14-workspace-001.md |
| TC-WS-INV-030 | 2026-05-14T17:39:11Z | PASS | Accept revoked invite => 400 |
| TC-WS-INV-032 | 2026-05-14T17:35:12Z | PASS | Accept malformed token => 400 |
| TC-WS-INV-033 | 2026-05-14T17:35:12Z | PASS | Accept missing token => 400 |
| TC-WS-INV-035 | 2026-05-14T17:35:12Z | PASS | Accept SQL injection token => 400 safe |
| TC-WS-INV-036 | 2026-05-14T17:34:44Z | PASS | Accept unauthenticated => 401 |
| TC-WS-INV-037 | 2026-05-14T17:35:52Z | PASS | Shareable invite link create => 201 with __invite_link__ email |
| TC-WS-INV-039 | 2026-05-14T17:35:52Z | PASS | Shareable invite link role=owner => 400 |
| TC-WS-PLAN-001 | 2026-05-14T17:35:20Z | PASS | Free plan cannot exceed 1 member => 403 with limit message |
| TC-WS-PLAN-008 | 2026-05-14T17:38:34Z | PASS | plan field present in workspace listing |
| TC-WS-ROLE-001 | 2026-05-14T17:38:35Z | PASS | Anonymous => 401 |
| TC-WS-ROLE-002 | 2026-05-14T17:39:22Z | PASS | Logged-in non-member => 403 Not a member |
| TC-PROJ-CREATE-001 | 2026-05-14T17:36:23Z | PASS | Create project vite-react default => 201 status:draft visibility:private |
| TC-PROJ-CREATE-004 | 2026-05-14T17:36:25Z | PASS | Disabled framework (django) => 403 |
| TC-PROJ-CREATE-008b | 2026-05-14T17:36:26Z | FAIL | Missing workspaceId silently picks workspace => 201 (should be 400). BUG: 2026-05-14-workspace-002.md |
| TC-PROJ-CREATE-008c | 2026-05-14T17:36:26Z | PASS | GET /projects/not-a-uuid => 400-equivalent Invalid project id |
| TC-PROJ-CREATE-009 | 2026-05-14T17:36:27Z | PASS | Empty name => 400 |
| TC-PROJ-CREATE-034 | 2026-05-14T17:36:27Z | PASS | Non-member workspaceId => 403 |
| TC-PROJ-CREATE-039 | 2026-05-14T17:38:10Z | PASS | Free plan project limit (3) enforced => 403 |
| TC-PROJ-CREATE-063 | 2026-05-14T17:36:28Z | PASS | Unauthenticated => 401 |
| TC-PROJ-CREATE-066 | 2026-05-14T17:36:26Z | INFO | Status immediately 'draft' at 3s poll — creating state not captured |
| TC-PROJ-CREATE-068 | 2026-05-14T17:36:26Z | PASS | Default visibility is private |
| TC-PROJ-LIST-015 | 2026-05-14T17:37:00Z | PASS | Filter status=draft — all results are draft |
| TC-PROJ-LIST-018 | 2026-05-14T17:37:01Z | PASS | Invalid status filter => 400 |
| TC-PROJ-LIST-020 | 2026-05-14T17:37:01Z | PASS | Search by name works |
| TC-PROJ-LIST-025 | 2026-05-14T17:37:02Z | PASS | Search SQL injection safe |
| TC-PROJ-LIST-032 | 2026-05-14T17:37:02Z | PASS | workspaceId non-member => 403 |
| TC-PROJ-LIST-037 | 2026-05-14T17:37:02Z | PASS | Unauthenticated => 401 |
| TC-PROJ-LIST-047 | 2026-05-14T17:39:25Z | PASS | /recently-viewed not mistaken for /:id => 200 |
| TC-PROJ-LIST-048 | 2026-05-14T17:39:25Z | PASS | /starred not mistaken for /:id => 200 |
| TC-PROJ-LIST-049 | 2026-05-14T17:39:25Z | FAIL | /projects/shared => 502 Bad Gateway (crash). BUG: 2026-05-14-workspace-003.md |
| TC-PROJ-UPDATE-001 | 2026-05-14T17:37:03Z | PASS | Owner updates name => 200 |
| TC-PROJ-UPDATE-016 | 2026-05-14T17:37:04Z | PASS | Status draft=>published => 200 |
| TC-PROJ-UPDATE-020 | 2026-05-14T17:37:04Z | PASS | Invalid status => 400 |
| TC-PROJ-UPDATE-021 | 2026-05-14T17:37:04Z | PASS | visibility=>public => 200 |
| TC-PROJ-UPDATE-032 | 2026-05-14T17:37:05Z | PASS | Project not found => 404 |
| TC-PROJ-UPDATE-038 | 2026-05-14T17:37:05Z | PASS | workspace_id ignored in PATCH |
| TC-PROJ-DELETE-001 | 2026-05-14T17:38:00Z | PASS | Owner deletes project => 200 {deleted:true} |
| TC-PROJ-DELETE-007 | 2026-05-14T17:38:01Z | PASS | Project not found => 404 |
| TC-PROJ-DELETE-008 | 2026-05-14T17:38:01Z | PASS | Already-deleted => 404 |
| TC-PROJ-DELETE-021 | 2026-05-14T17:38:02Z | PASS | Unauthenticated => 401 |
| TC-PROJ-COLLAB-001 | 2026-05-14T17:38:02Z | PASS | List collaborators => 200 {data:[]} |
| TC-API-502 | 2026-05-14T17:42:00Z | FAIL | dev-api.doable.me 502 all endpoints from 17:42 UTC — likely triggered by /projects/shared crash. BUG: 2026-05-14-workspace-004.md |

---

## Dev Run — 2026-05-14 (GitHub + Versions + Folders)

**Target:** https://dev.doable.me
**API:** https://dev-api.doable.me
**Tester:** QA Tester Agent (Claude Sonnet 4.6)
**Run date:** 2026-05-14
**Account:** owner-pro@doable.me / TestPass123!
**Evidence:** testcases/evidence/dev/batch-2026-05-14/github-versions-results.json
**Bugs filed:** 11 (github-001..003, versions-001..002, folder-001..006)

### Summary

| Feature | Cases Run | Pass | Fail | Skip |
|---------|-----------|------|------|------|
| GitHub | 13 | 4 | 6 | 3 |
| Versions | 19 | 15 | 4 | 0 |
| Folders | 21 | 13 | 8 | 0 |
| **Total** | **53** | **32** | **18** | **3** |

### Key Findings

**GitHub (Critical)**
- BUG-GH-001: `/auth/github/repo/start` → 500 for all callers (repo connect flow broken)
- BUG-GH-002: Editor "Connect GitHub" button redirects to /usage (wrong route wired)
- BUG-GH-003: `/github/connect`, `/projects/:id/github/commits`, `/push`, `/pull`, `/github/import` all 404 — routes not registered; GitHub sync has no backend

**Versions (Medium)**
- BUG-VER-001: GET `/projects/:id/versions/auto` → 500 UUID parse error (route conflict)
- BUG-VER-002: Restore with invalid SHA → 500 (should be 404)

**Folders (High/Medium)**
- BUG-FOLDER-001: parentId=self allowed → cycle created (no cycle detection)
- BUG-FOLDER-002: parentId from different workspace → 500 (should be 400)
- BUG-FOLDER-003: color field silently ignored (schema gap)
- BUG-FOLDER-004: GET /workspaces/:id/folders returns 200 for non-member (should be 403)
- BUG-FOLDER-005: GET/PATCH/DELETE /folders/:id IDOR — no workspace membership check
- BUG-FOLDER-006: PATCH /projects/:id with folderId → 403 "Viewers cannot edit projects" for project owner (role resolution bug)

### Environment Notes

- Rate limiter exhausted at session start (10 req/15min); waited for clearance
- Dev API returned 502 for ~10 minutes mid-session; resumed after recovery
- Token refreshed via coordinator-provided pre-generated token


## Dev API Batch Run — 2026-05-14

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-API-HEALTH-001 | 2026-05-14T17:31:00Z | FAIL | GET /health/ returns 308 redirect; GET /health returns 200 — trailing slash inconsistency |
| TC-API-HEALTH-005 | 2026-05-14T17:31:00Z | PASS | GET /health/live returns 200 |
| TC-API-HEALTH-007 | 2026-05-14T17:31:00Z | PASS | GET /health/ready returns 200 |
| TC-API-AUTH-019 | 2026-05-14T17:32:00Z | PASS | GET /auth/me with valid token returns 200 |
| TC-API-AUTH-020 | 2026-05-14T17:32:00Z | PASS | GET /auth/me no auth returns 401 |
| TC-API-AUTH-026 | 2026-05-14T17:32:00Z | PASS | alg:none JWT rejected 401 |
| TC-API-AUTH-028 | 2026-05-14T17:32:00Z | PASS | POST /auth/refresh with valid token returns 200 |
| TC-API-PROJECTS-021 | 2026-05-14T17:33:00Z | FAIL | POST /projects with framework='cobol' returns 201, stored as vite-react — BUG-API-002 |
| TC-API-PROJECTS-033 | 2026-05-14T17:34:00Z | FAIL | GET /projects/valid-nonexistent-uuid returns 400 not 404 — BUG-API-003 |
| TC-API-PROJECTS-043 | 2026-05-14T17:34:00Z | FAIL | DELETE /projects/:id returns 200 not 204 — BUG-API-004 |
| TC-API-PROJECTS-049 | 2026-05-14T17:36:00Z | FAIL | POST /projects/:id/archive returns 404 — BUG-API-005 |
| TC-API-PROJECTS-073 | 2026-05-14T17:37:00Z | FAIL | POST /projects/:id/share returns 404 — BUG-API-006 |
| TC-API-PROJECTS-015 | 2026-05-14T17:37:00Z | FAIL | GET /projects?limit=-1 returns 200 not 400 — BUG-API-023 |
| TC-API-WS-015 | 2026-05-14T17:35:00Z | FAIL | PUT /workspaces/:wid returns 404 — BUG-API-007 |
| TC-API-WS-019 | 2026-05-14T17:52:00Z | FAIL | DELETE /workspaces/:wid returns 200 not 204 — BUG-API-009 |
| TC-API-WS-025 | 2026-05-14T17:50:00Z | FAIL | POST /workspaces/:wid/members returns 404 — BUG-API-008 |
| TC-API-WS-041 | 2026-05-14T17:32:00Z | FAIL | GET /workspaces/:wid/billing/plan returns 404 — BUG-API-010 |
| TC-API-ADMIN-004 | 2026-05-14T17:53:00Z | FAIL | GET /admin/users?email= filter ignored, returns all users — BUG-API-011 |
| TC-API-ADMIN-012 | 2026-05-14T17:51:00Z | FAIL | GET /admin/workspaces returns 404 — BUG-API-012 |
| TC-API-ADMIN-016 | 2026-05-14T17:51:00Z | FAIL | GET /admin/audit returns 404 — BUG-API-012 |
| TC-API-INTEG-006 | 2026-05-14T17:35:00Z | FAIL | GET /integrations/connections requires undocumented workspaceId — BUG-API-013 |
| TC-API-INTEG-027 | 2026-05-14T17:35:00Z | FAIL | GET /integrations/admin/pieces returns 404 not 403 for non-admin — BUG-API-014 |
| TC-API-PROV-001 | 2026-05-14T17:37:00Z | FAIL | GET /ai/provider-catalog requires auth; spec says public — BUG-API-015 |
| TC-API-PROV-002 | 2026-05-14T17:55:00Z | PASS | ETag 304 caching works on provider-catalog |
| TC-API-PROV-021 | 2026-05-14T17:37:00Z | FAIL | GET /workspaces/:wid/ai-settings returns 404 — BUG-API-016 |
| TC-API-GITHUB-001 | 2026-05-14T17:37:00Z | FAIL | GET /github/install-url returns 404 — BUG-API-017 |
| TC-API-GITHUB-027 | 2026-05-14T17:38:00Z | FAIL | GET /github/oauth/start returns 404 — BUG-API-017 |
| TC-API-FOLDERS-002 | 2026-05-14T17:49:00Z | FAIL | GET /folders without workspaceId returns 200 not 400 — BUG-API-018 |
| TC-API-DEPLOY-001 | 2026-05-14T17:50:00Z | FAIL | POST /deploy/:id/publish on empty project returns 500 — BUG-API-019 |
| TC-API-DEPLOY-021 | 2026-05-14T17:50:00Z | FAIL | GET /domains returns 404 — BUG-API-020 |
| TC-API-CHAT-016 | 2026-05-14T17:50:00Z | FAIL | GET /chat/:pid/sessions returns 404 — BUG-API-021 |
| TC-API-THUMB-001 | 2026-05-14T17:50:00Z | FAIL | GET /thumbnails/:id returns 400 'Only .png thumbnails supported' — BUG-API-022 |

## Dev batch: AUTH + SECURITY — 2026-05-14

**Target web:** https://dev.doable.me  
**Target API:** https://dev-api.doable.me  
**Target WS:** wss://dev-ws.doable.me  
**Tester:** qa-tester agent (claude-sonnet-4-6)  
**Run date:** 2026-05-14  
**Accounts:** owner-pro@doable.me / outsider@doable.me / TestPass123!  
**Evidence:** testcases/evidence/dev/batch-2026-05-14/auth-security-results.json  
**Bugs filed:** BUG-011 through BUG-018 (testcases/bugs/2026-05-14-auth-security-*.md)

### Summary
- Total executed: 89
- PASS: 58
- FAIL: 10
- BLOCKED: 19 (login/register/forgot/reset rate limits exhausted mid-run)
- INFO: 2

### FAILs
| Test ID | Description | Bug |
|---------|-------------|-----|
| TC-AUTH-LOGIN-049 | expiresIn:900 in body but JWT exp-iat=14400 (4h) | BUG-011 |
| TC-AUTH-REGISTER-057 | Same token lifetime mismatch on register | BUG-011 |
| TC-SEC-CORS-001 | CORS: credentials:true returned for disallowed origins | BUG-012 |
| TC-AUTH-MISC-012 | No Cache-Control: no-store on auth responses | BUG-013 |
| TC-SEC-STORAGE-001 | Tokens in localStorage (XSS risk) | BUG-014 |
| TC-AUTH-LOGOUT-005 | Access token not cleared on logout | BUG-015 |
| TC-SEC-HEADERS-003 | CSP allows unsafe-eval and unsafe-inline | BUG-016 |
| TC-SEC-WS-001 | WS accepts evil.example origin (CSWSH) | BUG-017 |
| TC-AUTH-RATE-LIMIT-012 | 429 has no Retry-After header | BUG-018 |
| TC-AUTH-LOGIN-037 | Content-Type header check inconclusive (curl -I quirk) | recheck needed |

### BLOCKEDs (rate-limited)
Login RL (10/15min), Register RL (5/1h), Forgot RL (3/1h), Reset RL (5/1h) all exhausted during smoke pass. Affected: TC-AUTH-LOGIN-008/009, TC-AUTH-REGISTER-017/021/030/031/040/043, TC-AUTH-FORGOT-001/002/004/005, TC-AUTH-RESET-004/006/007/008/009, TC-AUTH-ME-009.

### XFF Bypass Regression
TC-SEC-XFF-BYPASS-001/002 CONFIRMED FIXED — rotating XFF returns 429 correctly (cf-connecting-ip keying works).

| TC-AUTH-LOGIN-001 | 2026-05-14T16:00:00Z | PASS | Login with valid credentials returns 200 + tokens |
| TC-AUTH-LOGIN-002 | 2026-05-14T16:00:00Z | PASS | Login wrong password → 401 no enumeration |
| TC-AUTH-LOGIN-003 | 2026-05-14T16:00:00Z | PASS | Login unknown email → 401 same message |
| TC-AUTH-LOGIN-049 | 2026-05-14T16:05:00Z | FAIL | JWT exp-iat=14400 vs expiresIn=900 — BUG-011 |
| TC-AUTH-REFRESH-001 | 2026-05-14T16:10:00Z | PASS | Refresh with valid token → 200 new pair |
| TC-AUTH-REFRESH-002 | 2026-05-14T16:10:00Z | PASS | Old rotated refresh → 401 revoked |
| TC-AUTH-LOGOUT-001 | 2026-05-14T16:15:00Z | PASS | Logout with valid token → 200 |
| TC-AUTH-LOGOUT-005 | 2026-05-14T16:15:00Z | FAIL | Access token persists in localStorage post-logout — BUG-015 |
| TC-SEC-WS-001 | 2026-05-14T16:30:00Z | FAIL | WS 101 for evil.example origin — BUG-017 |
| TC-SEC-XFF-BYPASS-001 | 2026-05-14T16:35:00Z | PASS | XFF rotation blocked, 429 on 4th request |
| TC-SEC-XFF-BYPASS-002 | 2026-05-14T16:35:00Z | PASS | Login XFF rotation blocked correctly |

## Dev batch — 2026-05-14 Publish + Deploy + Runtime (browser QA via Chrome MCP)

**Target:** https://dev.doable.me  **API:** https://dev-api.doable.me  
**Account:** owner-pro@doable.me  **Evidence:** testcases/evidence/dev/batch-2026-05-14/publish-deploy-results.json

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-API-HEALTH-DEV-001 | 2026-05-14T17:45:12Z | PASS | GET /health → 200 healthy, DB up latency=1ms, uptime=8.8s |
| TC-PUBLISH-SUBDOMAIN-025 | 2026-05-14T17:46:00Z | PASS | POST /projects/{id}/publish no auth → 401 Missing or invalid Authorization header |
| TC-PUBLISH-SUBDOMAIN-026 | 2026-05-14T17:46:00Z | PASS | POST /projects/{id}/publish no auth → 401 (same as 025 variant) |
| TC-PUBLISH-LIFECYCLE-001 | 2026-05-14T17:50:00Z | PASS | Deploy button opens Deploy Project modal with Live/Test environment selector |
| TC-DEPLOY-ENV-SWITCH | 2026-05-14T17:50:30Z | PASS | Clicking Test option changes button to "Deploy to Test", Live deselects |
| TC-DEPLOY-LIFECYCLE-001 | 2026-05-14T17:51:00Z | FAIL | Deploy to Live: POST /projects/{id}/publish → 404; UI shows ENOENT /var/lib/doable-sites missing — BUG-2026-05-14-publish-001 |
| TC-DEPLOY-TEST-ENV | 2026-05-14T17:52:00Z | FAIL | Deploy to Test: build progress shown (Preparing files→Building project→Deploying to preview) then fails with same ENOENT — BUG-2026-05-14-publish-001 |
| TC-PUBLISH-SUBDOMAIN-001 | 2026-05-14T17:47:00Z | FAIL | GET /projects/{id} for published project: subdomain=null, published_url=null despite status=published — BUG-2026-05-14-publish-002 |
| TC-PUBLISH-SUBDOMAIN-002 | 2026-05-14T17:51:00Z | PASS | Generated subdomain follows dev-<slug> pattern (dev-vite-updated-zpnwx seen in error) |
| TC-PUBLISH-LIFECYCLE-025 | 2026-05-14T17:48:00Z | PARTIAL | Dashboard shows Published badge on project card but no live URL chip — BUG-2026-05-14-publish-003 |
| TC-BILLING-CREDITS-DISPLAY | 2026-05-14T17:46:30Z | FAIL | Monthly Credits shows -400/100 used (negative value) — BUG-2026-05-14-publish-004 |
| TC-AUTH-LOGIN-RATE-LIMIT | 2026-05-14T17:35:00Z | FAIL | 429 on login after 10 attempts, Retry-After header not exposed in CORS — BUG-2026-05-14-publish-005 |
| TC-API-HEALTH-DEV-002 | 2026-05-14T17:58:37Z | FAIL | GET /health → 502 Bad Gateway (API server crashed/down) — BUG-2026-05-14-publish-006 |
| TC-DASHBOARD-NAV-001 | 2026-05-14T17:46:00Z | FAIL | /dashboard intermittently redirects to /billing or /usage — BUG-2026-05-14-publish-007 |
| TC-RUNTIME-VITE-PREVIEW | 2026-05-14T17:50:00Z | PASS | Editor preview pane renders project correctly (Doable branded app visible) |
| TC-RUNTIME-METRICS | 2026-05-14T17:50:00Z | PASS | GET /projects/{id}/runtime/metrics → 200, polling every ~5s |

## Dev Batch � 2026-05-14 MCP + Integrations

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
| TC-API-INFRA-001 | 2026-05-14T17:37Z | FAIL | dev-api crash loop during session � 502 repeatedly, 5-11s recovery windows. BUG-001 |
| TC-MCP-CONNECTOR-001 | 2026-05-14T17:51Z | PASS | List connectors returns 200 with 4 built-in MCP App connectors |
| TC-MCP-CONNECTOR-002 | 2026-05-14T17:51Z | PASS | All 4 built-ins present: Markdown/PDF/Presentation/Spreadsheet Builder |
| TC-MCP-CONNECTOR-004 | 2026-05-14T17:51Z | FAIL | stdio transport blocked for user-created connectors (403) |
| TC-MCP-CONNECTOR-005 | 2026-05-14T17:51Z | PASS | streamable_http connector created (HTTP 201) |
| TC-MCP-CONNECTOR-006 | 2026-05-14T17:56Z | PASS | http_sse connector created (HTTP 201) |
| TC-MCP-CONNECTOR-009 | 2026-05-14T17:51Z | FAIL | http:// URL accepted for HTTP connector � BUG-007 |
| TC-MCP-CONNECTOR-010 | 2026-05-14T17:54Z | PASS | PATCH connector update works |
| TC-MCP-CONNECTOR-012 | 2026-05-14T17:51Z | PASS | DELETE user-created connector works |
| TC-MCP-CONNECTOR-013 | 2026-05-14T17:51Z | FAIL | Built-in connector deletable � BUG-002 |
| TC-MCP-CONNECTOR-014 | 2026-05-14T17:55Z | FAIL | PATCH enabled=false no effect � BUG-010 |
| TC-MCP-CONNECTOR-022 | 2026-05-14T17:54Z | PASS | listTools for active stdio connector returns 200 with 2 tools |
| TC-MCP-CONNECTOR-022-http | 2026-05-14T17:54Z | FAIL | listTools for inactive HTTP connector returns 500 � BUG-008 |
| TC-MCP-CONNECTOR-026 | 2026-05-14T17:55Z | PASS | Cross-tenant connector access returns 403 |
| TC-MCP-CONNECTOR-040 | 2026-05-14T17:55Z | FAIL | Audit log endpoint not found |
| TC-MCP-CONNECTOR-044 | 2026-05-14T17:55Z | FAIL | Debug logs endpoint returns 404 |
| TC-MCP-CONNECTOR-053 | 2026-05-14T17:56Z | PASS | server_env_encrypted not in GET response |
| TC-MCP-CONNECTOR-INVALID-ID-001 | 2026-05-14T17:51Z | PASS | Bogus id returns 400 |
| TC-MCP-CONNECTOR-INVALID-ID-002 | 2026-05-14T17:51Z | PARTIAL | Trailing slash bogus returns 308 not 400 |
| TC-MCP-CONNECTOR-INVALID-ID-003 | 2026-05-14T17:54Z | PASS | PATCH bogus returns 400 |
| TC-MCP-CONNECTOR-INVALID-ID-004 | 2026-05-14T17:54Z | PASS | DELETE bogus returns 400 |
| TC-MCP-CONNECTOR-INVALID-ID-005 | 2026-05-14T17:54Z | PASS | /tools bogus returns 400 |
| TC-MCP-CONNECTOR-INVALID-ID-006 | 2026-05-14T17:55Z | PASS | Bogus workspaceId returns 400 |
| TC-MCP-CONNECTOR-INVALID-ID-007 | 2026-05-14T17:55Z | PASS | discover literal not blocked by UUID guard |
| TC-MCP-CONNECTOR-INVALID-ID-008 | 2026-05-14T17:51Z | PASS | Valid UUID nonexistent returns 404 |
| TC-MCP-APPS-RUNTIME-001 | 2026-05-14T17:59Z | FAIL | mcp_ui_resource not emitted on dev � BUG-013 |
| TC-MCP-OAUTH-014 | 2026-05-14T17:55Z | PASS | No tokens in GET connector response |
| TC-MCP-OAUTH-038 | 2026-05-14T17:55Z | PASS | Invalid JWT returns 401 |
| TC-MCP-OAUTH-039 | 2026-05-14T17:57Z | PASS | Expired JWT returns 401 |
| TC-INTEG-LIST-001 | 2026-05-14T17:51Z | FAIL | GET /integrations returns 404 � BUG-004 |
| TC-INTEG-LIST-004 | 2026-05-14T17:56Z | PASS | Category filter works with underscore names |
| TC-INTEG-LIST-005 | 2026-05-14T17:57Z | FAIL | authType filter not working |
| TC-INTEG-LIST-006 | 2026-05-14T17:56Z | FAIL | ?q= search not working � BUG-005 |
| TC-INTEG-LIST-009 | 2026-05-14T17:57Z | PASS | Categories array in catalog response |
| TC-INTEG-LIST-010 | 2026-05-14T17:51Z | PASS | Detail by slug returns 200 |
| TC-INTEG-LIST-011 | 2026-05-14T17:55Z | FAIL | No connectUrl in integration detail |
| TC-INTEG-LIST-020 | 2026-05-14T17:51Z | FAIL | Only 533 integrations not 630+ |
| TC-INTEG-LIST-022 | 2026-05-14T17:57Z | PASS | Gzip compression enabled |
| TC-INTEG-LIST-023 | 2026-05-14T17:55Z | PASS | No XSS in catalog |
| TC-INTEG-LIST-026 | 2026-05-14T17:51Z | PASS | Connections endpoint returns 200 |
| TC-INTEG-LIST-027 | 2026-05-14T17:51Z | PASS | Cross-tenant connections returns 403 |
| TC-INTEG-LIST-038 | 2026-05-14T17:39Z | PASS | Anon access returns 401 |
| TC-INTEG-LIST-039 | 2026-05-14T17:57Z | FAIL | Catalog 849ms > 500ms SLA � BUG-009 |
| TC-INTEG-LIST-040 | 2026-05-14T17:51Z | PASS | Bad slug returns 404 |
| TC-INTEG-CONNECT-001 | 2026-05-14T17:55Z | FAIL | enhanced-auth/start returns 404 � BUG-003 |
| TC-INTEG-PROXY-001 | 2026-05-14T17:57Z | FAIL | connector-proxy 404 � BUG-012 |
| TC-INTEG-REVOKE-001 | 2026-05-14T17:57Z | PASS | Revoke route exists, correct 404 for nonexistent |
| TC-EDITOR-CORS-001 | 2026-05-14T17:59Z | FAIL | Editor CORS errors on 502 � BUG-011 |
| TC-AI-CHAT-SEND-001 | 2026-05-14T18:00:00Z | PASS | Agent mode SSE stream works; events: thinking, status, tool_call, tool_result, done, usage; model: MiniMax-M2.7-highspeed |
| TC-AI-CHAT-SEND-002 | 2026-05-14T18:03:00Z | PASS | Plan mode emits plan event with structured steps; keep_alive heartbeats present; create_plan tool used |
| TC-AI-CHAT-SEND-003 | 2026-05-14T17:57:00Z | FAIL | "chat" mode not accepted - only agent/plan/visual-edit valid; HTTP 400 ZodError. BUG-011 |
| TC-AI-CHAT-SEND-004 | 2026-05-14T17:57:00Z | PASS | Empty content rejected HTTP 400 ZodError |
| TC-AI-CHAT-SEND-005 | 2026-05-14T17:57:00Z | PASS | Whitespace-only content rejected HTTP 400 |
| TC-AI-CHAT-SEND-006 | 2026-05-14T18:10:00Z | PASS | Content >100000 chars rejected HTTP 400 (limit=100000 not 200000 per spec) |
| TC-AI-CHAT-SEND-007 | 2026-05-14T18:10:00Z | PASS | Missing mode defaults to agent; stream succeeds |
| TC-AI-CHAT-SEND-008 | 2026-05-14T17:57:00Z | PASS | Invalid mode "foobar" rejected HTTP 400 ZodError |
| TC-AI-CHAT-SEND-010 | 2026-05-14T17:57:00Z | PASS | Non-existent projectId HTTP 400 "Invalid project id" |
| TC-AI-CHAT-SEND-011 | 2026-05-14T18:01:00Z | PASS | Cross-tenant access blocked HTTP 404 for outsider token |
| TC-AI-CHAT-SEND-012 | 2026-05-14T17:57:00Z | PASS | Unauthenticated request HTTP 401 |
| TC-AI-CHAT-SEND-015 | 2026-05-14T18:01:00Z | PARTIAL | Tool events present (tool_call, tool_result) but no session_start or delta events - different naming than spec. BUG-013 |
| TC-AI-CHAT-SEND-016 | 2026-05-14T18:03:00Z | PASS | keep_alive events observed in plan mode stream |
| TC-AI-CHAT-SEND-017 | 2026-05-14T18:05:00Z | FAIL | done event has empty data {}; no messageId or creditsUsed. BUG-014 |
| TC-AI-CHAT-SEND-022 | 2026-05-14T18:10:00Z | PARTIAL | 3 concurrent sends all 502 (server blocks concurrent); not 409 as spec implies |
| TC-AI-CHAT-SEND-033 | 2026-05-14T17:59:00Z | PASS | XSS content stored verbatim; parameterized queries protect DB |
| TC-AI-CHAT-SEND-034 | 2026-05-14T17:59:00Z | PASS | SQL injection stored as text; no DB impact |
| TC-AI-CHAT-SEND-035 | 2026-05-14T18:10:00Z | FAIL | Emoji stored as ?????? — UTF-8 encoding corruption. BUG-015 |
| TC-AI-CHAT-SEND-040 | 2026-05-14T18:10:00Z | PASS | x-request-id header present in response |
| TC-AI-CHAT-SEND-044 | 2026-05-14T18:15:00Z | FAIL | Idempotency-Key not honored; duplicate messages created. BUG-016 |
| TC-AI-CHAT-SEND-047 | 2026-05-14T17:59:00Z | PASS | CORS preflight 204; correct allow-origin/methods headers |
| TC-AI-CHAT-MODES-001 | 2026-05-14T18:01:00Z | PASS | Agent mode tool calls work; list_files, read_file tools dispatched |
| TC-AI-CHAT-MODES-002 | 2026-05-14T18:03:00Z | PASS | Plan mode emits structured plan; create_plan tool used |
| TC-AI-CHAT-MODES-004 | 2026-05-14T18:10:00Z | FAIL | PATCH /projects/:id/chat/session 404; endpoint not implemented. BUG-017 |
| TC-AI-CHAT-MODES-036 | 2026-05-14T18:10:00Z | FAIL | GET /chat/modes 404 on all paths. BUG-018 |
| TC-AI-CHAT-CREDITS-001 | 2026-05-14T18:05:00Z | FAIL | 26 sends; usage log shows 26 entries but dailyRemaining unchanged. BUG-019 |
| TC-AI-CHAT-CREDITS-004 | 2026-05-14T18:00:00Z | PASS | Free plan dailyMax=5; Pro plan dailyMax=50, monthlyMax=500 |
| TC-AI-CHAT-CREDITS-009 | 2026-05-14T18:10:00Z | FAIL | monthlyRemaining=0 workspace still processes sends; no 429. BUG-020 |
| TC-AI-CHAT-CREDITS-023 | 2026-05-14T18:10:00Z | FAIL | Usage log has null for prompt_tokens, completion_tokens, model. BUG-021 |
| TC-AI-CHAT-CREDITS-027 | 2026-05-14T18:10:00Z | PASS | GET /billing/usage returns per-user credit consumption entries |
| TC-AI-CHAT-CREDITS-028 | 2026-05-14T18:00:00Z | PASS | GET /billing/balance returns dailyRemaining/Max, monthlyRemaining/Max, topupRemaining, planType |
| TC-AI-CHAT-HISTORY-001 | 2026-05-14T18:01:00Z | PASS | GET /projects/:id/chat/history returns messages sorted ascending |
| TC-AI-CHAT-HISTORY-002 | 2026-05-14T18:15:00Z | PASS | limit=2 pagination works; hasMore=true when more exist |
| TC-AI-CHAT-HISTORY-009 | 2026-05-14T18:10:00Z | PARTIAL | Schema has all fields but missing metadata obj; spec requires metadata.mode. BUG-022 |
| TC-AI-CHAT-HISTORY-010 | 2026-05-14T18:10:00Z | PASS | Tool calls present as structured objects in history |
| TC-AI-CHAT-HISTORY-016 | 2026-05-14T18:08:00Z | PASS | DELETE /projects/:id/chat clears history; returns {cleared:true} HTTP 200 |
| TC-AI-CHAT-HISTORY-021 | 2026-05-14T18:10:00Z | FAIL | Export endpoint not found (404 all paths). BUG-023 |
| TC-AI-CHAT-HISTORY-026 | 2026-05-14T18:10:00Z | FAIL | Search endpoint not found (404 all paths). BUG-024 |
| TC-AI-CHAT-HISTORY-031 | 2026-05-14T18:10:00Z | FAIL | PATCH /chat/session 404; session rename not implemented. BUG-017 |
| TC-AI-CHAT-HISTORY-044 | 2026-05-14T18:10:00Z | PASS | Messages visible immediately in history after stream done |
| TC-AI-CHAT-MODELS-001 | 2026-05-14T18:00:00Z | FAIL | GET /ai/models returns "Not authenticated" for all users. BUG-025 |
| TC-AI-CHAT-MODELS-003 | 2026-05-14T18:10:00Z | FAIL | PATCH session model 404; model switching not implemented. BUG-017 |
| TC-AI-CHAT-owner-role | 2026-05-14T17:58:00Z | FAIL | owner-pro has viewer role in own pro workspace; cannot use AI chat. BUG-026 |
