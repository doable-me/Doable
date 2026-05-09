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
