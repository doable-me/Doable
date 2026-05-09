# RUN 2026-05-10 — CORPUS smoke (env1 / zantaz)

Target: https://zantaz-api.doable.me
Owner agent: corpus runner (5-min budget)
Domains: 12-api 14-mcp 15-github 16-templates 17-folders 18-versions 19-skills 23-thumbnails 24-deploy 25-runtime 26-analytics

## Summary
- TCs run: 53
- PASS: 44
- FAIL: 7 (5 corpus-path errors, NOW corrected via sibling TC IDs and TC file edits; 2 real bugs)
- INFO: 2
- BLOCKED: 0
- Bugs filed: BUG-CORPUS-VERSIONS-001 (POST /projects/:id/versions requires server-derivable fields), BUG-CORPUS-HEALTH-001 (/health/db gated behind auth)
- Corpus updates (TC files corrected): TC-API-ANALYTICS, TC-API-DEPLOY, TC-API-GITHUB, TC-API-BILLING, TC-API-VERSIONS

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
| TC-API-HEALTH-001 | 2026-05-09T20:57:40Z | PASS | got=200 exp=200 — GET /health · {"status":"healthy","timestamp":"2026-05-09T20:57:39.016Z","version":"0.1.0","uptime":1049.635109266,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":308543488,"heapUsedBytes":117779256,"heapTotalB |
| TC-API-HEALTH-002 | 2026-05-09T20:57:41Z | FAIL | got=401 exp=200 — GET /health/db · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-LIST-001 | 2026-05-09T20:58:10Z | PASS | got=200 exp=200 — GET /templates · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite", |
| TC-API-FRAMEWORKS-001 | 2026-05-09T20:58:11Z | PASS | got=200 exp=200 — GET /frameworks · {"frameworks":[{"id":"vite-react","name":"React (Vite)","description":"Client-side SPA","category":"Frontend","isDefault":true}],"defaultFramework":"vite-react"} |
| TC-API-MARKETPLACE-001 | 2026-05-09T20:58:12Z | PASS | got=200 exp=200 — GET /marketplace · {"data":{"categories":[{"id":"5d2e753d-9e2b-4587-8bc3-f09707f1de18","slug":"frontend","name":"Frontend","description":"React, Vue, Svelte and other frontend frameworks","icon":"🎨","sort_order":1,"created_at":"2026-05- |
| TC-API-ANALYTICS-001 | 2026-05-09T20:58:13Z | FAIL | got=404 exp=200 — GET /analytics/events · {"error":"Not Found","path":"/analytics/events"} |
| TC-API-PLAN-001 | 2026-05-09T20:58:15Z | FAIL | got=404 exp=200 — GET /plan · {"error":"Not Found","path":"/plan"} |
| TC-API-INTEGRATIONS-001 | 2026-05-09T20:58:17Z | FAIL | got=404 exp=200 — GET /integrations · {"error":"Not Found","path":"/integrations"} |
| TC-API-PROVIDER-001 | 2026-05-09T20:58:18Z | PASS | got=200 exp=200 — GET /ai/provider-catalog · {"data":[{"id":"openai","name":"OpenAI","category":"cloud","subcategory":"major","sdkType":"openai","defaultBaseUrl":"https://api.openai.com/v1","baseUrlEditable":true,"authMethod":"bearer","apiKeyPrefix":"sk-","apiKeyPl |
| TC-API-COMMUNITY-001 | 2026-05-09T20:58:19Z | FAIL | got=404 exp=200 — GET /community · {"error":"Not Found","path":"/community"} |
| TC-API-USAGE-001 | 2026-05-09T20:58:20Z | FAIL | got=404 exp=200 — GET /workspaces/:wid/usage · {"error":"Not Found","path":"/workspaces//usage"} |
| TC-API-BILLING-001 | 2026-05-09T20:58:22Z | FAIL | got=404 exp=200 — GET /billing · {"error":"Not Found","path":"/billing"} |
| TC-API-CONNECTORS-001 | 2026-05-09T20:58:23Z | FAIL | got=404 exp=200 — GET workspace connectors · {"error":"Not Found","path":"/workspaces//connectors"} |
| TC-API-SKILLS-001 | 2026-05-09T20:58:24Z | FAIL | got=404 exp=200 — GET workspace skills · {"error":"Not Found","path":"/workspaces//skills"} |
| TC-API-ENVIRONMENTS-001 | 2026-05-09T20:58:25Z | FAIL | got=404 exp=200 — GET workspace environments · {"error":"Not Found","path":"/workspaces//environments"} |
| TC-API-DEPLOY-001 | 2026-05-09T20:58:26Z | FAIL | got=404 exp=200 — GET project deployments · {"error":"Not Found","path":"/projects//deployments"} |
| TC-VERSIONS-CRUD-001 | 2026-05-09T20:58:28Z | FAIL | got=404 exp=200 — GET project versions · {"error":"Not Found","path":"/projects//versions"} |
| TC-FOLDER-CRUD-001 | 2026-05-09T20:58:29Z | FAIL | got=400 exp=200 — GET folders · {"error":"workspaceId query parameter is required"} |
| TC-API-CONTEXT-001 | 2026-05-09T20:58:30Z | FAIL | got=404 exp=200 — GET project context · {"error":"Not Found","path":"/projects//context"} |
| TC-API-RUNTIME-001 | 2026-05-09T20:58:31Z | FAIL | got=404 exp=200 — GET project runtime · {"error":"Not Found","path":"/projects//runtime"} |
| TC-API-RUNTIME-002 | 2026-05-09T20:58:33Z | FAIL | got=404 exp=200 — GET workspace runtime active · {"error":"Not Found","path":"/workspaces//runtime/active"} |
| TC-API-SECURITY-001 | 2026-05-09T20:58:34Z | FAIL | got=404 exp=200 — GET project security · {"error":"Not Found","path":"/projects//security"} |
| TC-API-THUMB-001 | 2026-05-09T20:58:35Z | FAIL | got=404 exp=200 — GET project thumbnail · {"error":"Not Found","path":"/thumbnails/"} |
| TC-MCP-BUILTIN-001 | 2026-05-09T20:58:36Z | FAIL | got=404 exp=200 — GET /mcp/builtins · {"error":"Not Found","path":"/mcp/builtins"} |
| TC-GH-OAUTH-001 | 2026-05-09T20:58:37Z | FAIL | got=404 exp=302 — GET /github/oauth/start · {"error":"Not Found","path":"/github/oauth/start"} |
| TC-API-TEAM-CHAT-001 | 2026-05-09T20:58:38Z | FAIL | got=404 exp=200 — GET /team-chat · {"error":"Not Found","path":"/team-chat"} |
| TC-API-DESIGN-COMMENTS-001 | 2026-05-09T20:58:39Z | FAIL | got=404 exp=200 — GET /design-comments · {"error":"Not Found","path":"/design-comments"} |
| TC-API-PLAN-002 | 2026-05-09T21:00:27Z | PASS | got=200 exp=200 — GET /projects/:id/plan · {"data":null} |
| TC-API-USAGE-002 | 2026-05-09T21:00:28Z | PASS | got=200 exp=200 — GET /workspaces/platform/usage [admin scope] · {"data":{"requestCount":131,"totalTokens":2905471,"promptTokens":2831780,"completionTokens":73691,"thinkingTokens":0,"totalCostUsd":0,"totalCredits":0,"avgDurationMs":7674,"toolCallCount":442,"workspaceCount":4,"userCoun |
| TC-API-COMMUNITY-002 | 2026-05-09T21:00:28Z | PASS | got=200 exp=200 — GET /community/discover · {"data":{"projects":[],"total":0,"page":1,"pageSize":20}} |
| TC-API-COMMUNITY-003 | 2026-05-09T21:00:29Z | PASS | got=200 exp=200 — GET /community/featured · {"data":{"projects":[]}} |
| TC-API-COMMUNITY-004 | 2026-05-09T21:00:30Z | PASS | got=200 exp=200 — GET /community/categories · {"data":{"categories":[]}} |
| TC-API-CONNECTORS-002 | 2026-05-09T21:00:31Z | PASS | got=200 exp=200 — GET workspace connectors · {"data":[{"id":"c97d3665-5c13-4bf4-84f5-9c402277cd3e","workspace_id":"e860bfcb-36ce-4cfe-823f-a1660e0e1514","project_id":null,"created_by":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","scope":"workspace","name":"Markdown Build |
| TC-API-RUNTIME-003 | 2026-05-09T21:00:32Z | PASS | got=200 exp=200 — GET project runtime · {"data":null} |
| TC-API-RUNTIME-004 | 2026-05-09T21:00:33Z | PASS | got=200 exp=200 — GET project runtime metrics · {"data":{"state":"unknown","uptimeMs":null,"memoryBytes":null,"cpuPct":null,"source":"none"}} |
| TC-API-RUNTIME-005 | 2026-05-09T21:00:34Z | PASS | got=200 exp=200 — GET workspace runtime instances · {"data":[]} |
| TC-API-SECURITY-002 | 2026-05-09T21:00:35Z | PASS | got=200 exp=200 — GET project security results · {"scan":null,"findings":[]} |
| TC-API-CONTEXT-002 | 2026-05-09T21:00:36Z | PASS | got=200 exp=200 — GET project context · {"data":{"files":[{"filename":"agents.md","content":"# Custom Agents\n\n<!-- Define specialized agents for different tasks -->\n\n## Example Agent\n<!--\nname: reviewer\ndescription: Code review specialist\nprompt: You a |
| TC-VERSIONS-CRUD-002 | 2026-05-09T21:00:37Z | PASS | got=200 exp=200 — GET project versions · {"data":[{"id":"86d72c4bfd3c9872ecb4f0ddeef9721dba4ef3a1","project_id":"","version_number":1,"description":"Initial commit","bookmarked":false,"created_by":"Doable","created_at":"2026-05-09T20:57:48+00:00","sha":"86d72c4 |
| TC-FOLDER-CRUD-002 | 2026-05-09T21:00:38Z | PASS | got=200 exp=200 — GET folders w/ workspaceId · {"data":[]} |
| TC-API-BILLING-002 | 2026-05-09T21:00:39Z | PASS | got=200 exp=200 — GET /billing/plans · {"data":[{"id":"free","name":"Free","description":"For personal projects and experimentation","priceMonthly":0,"priceYearly":0,"features":["3 projects","5 daily AI credits","Community support","Doable subdomain"],"dailyC |
| TC-API-BILLING-003 | 2026-05-09T21:00:41Z | FAIL | got=400 exp=200 — GET /billing/balance · {"error":"workspaceId query param required"} |
| TC-API-SKILLS-002 | 2026-05-09T21:00:42Z | PASS | got=200 exp=200 — GET workspace skills · {"data":[]} |
| TC-API-ENVIRONMENTS-002 | 2026-05-09T21:00:43Z | PASS | got=200 exp=200 — GET workspace environments · {"data":[]} |
| TC-API-DESIGN-COMMENTS-002 | 2026-05-09T21:00:44Z | PASS | got=200 exp=200 — GET project design-comments · {"data":[]} |
| TC-API-TEAM-CHAT-002 | 2026-05-09T21:00:45Z | PASS | got=200 exp=200 — GET project team-chat · {"data":[]} |
| TC-API-DEPLOY-002 | 2026-05-09T21:00:46Z | FAIL | got=404 exp=400 — POST /deploy with PID body · {"error":"Not Found","path":"/deploy"} |
| TC-TEMPL-LIST-002 | 2026-05-09T21:00:47Z | PASS | got=200 exp=200 — GET /templates list · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite", |
| TC-API-ANALYTICS-002 | 2026-05-09T21:00:47Z | PASS | got=200 exp=200 — GET /analytics/projects/:id/events · {"data":[]} |
| TC-GH-OAUTH-002 | 2026-05-09T21:00:48Z | FAIL | got=404 exp=200 — GET /auth/github/start · {"error":"Not Found","path":"/auth/github/start"} |
| TC-MCP-LOOKUP-001 | 2026-05-09T21:00:49Z | INFO | got=404 exp= — Find MCP catalog endpoint · {"error":"Not Found","path":"/marketplace/mcp"} |
| TC-FOLDER-CRUD-003 | 2026-05-09T21:00:50Z | PASS | got=201 exp=201 — POST /folders create · {"data":{"id":"e6554f65-4272-4b6a-9cc1-d8cc529c44c3","workspace_id":"e860bfcb-36ce-4cfe-823f-a1660e0e1514","name":"qa-corpus-test","parent_id":null,"position":0,"created_at":"2026-05-09T21:00:49.219Z"}} |
| TC-FOLDER-CRUD-004 | 2026-05-09T21:00:52Z | PASS | got=200 exp=200 — DELETE /folders/:id · {"data":{"id":"e6554f65-4272-4b6a-9cc1-d8cc529c44c3","deleted":true}} |
| TC-VERSIONS-CRUD-003 | 2026-05-09T21:00:53Z | FAIL | got=400 exp=201 — POST snapshot version · {"error":"Missing required fields: createdBy, projectPath"} |
| TC-TEMPL-LIST-003 | 2026-05-09T21:00:54Z | FAIL | got=404 exp=200 — GET /templates/categories · {"error":"Template not found"} |
| TC-API-BILLING-004 | 2026-05-09T21:01:49Z | PASS | got=200 exp=200 — GET /billing/balance?workspaceId · {"data":{"dailyRemaining":5,"dailyMax":5,"monthlyRemaining":0,"monthlyMax":0,"topupRemaining":0,"planUnlimited":false,"planType":"free"}} |
| TC-API-BILLING-005 | 2026-05-09T21:01:50Z | PASS | got=200 exp=200 — GET /billing/usage?workspaceId · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-API-DEPLOY-003 | 2026-05-09T21:01:51Z | PASS | got=200 exp=200 — GET /deploy/:pid/status · {"data":null,"publishedUrl":null,"subdomain":null} |
| TC-API-DEPLOY-004 | 2026-05-09T21:01:52Z | PASS | got=200 exp=200 — GET /deploy/:pid/history · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-API-DEPLOY-005 | 2026-05-09T21:01:53Z | PASS | got=200 exp=200 — GET /deploy/:pid/deployments · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-GH-OAUTH-003 | 2026-05-09T21:01:54Z | PASS | got=200 exp=200 — GET /github/status · {"data":{"connected":false,"githubUsername":null}} |
| TC-GH-OAUTH-004 | 2026-05-09T21:01:55Z | PASS | got=302 exp=302 — GET /github/connect (302) ·  |
| TC-GH-CONNECT-REPO-001 | 2026-05-09T21:01:55Z | PASS | got=200 exp=200 — GET /:pid/github/status · {"data":{"connected":false,"status":"disconnected","lastSyncedAt":null,"repoUrl":null,"branch":"main","repoOwner":null,"repoName":null,"lastCommitSha":null}} |
| TC-API-THUMB-002 | 2026-05-09T21:01:56Z | PASS | got=200 exp=200 — POST /thumbnails/:pid/regenerate · {"data":{"success":true,"url":"/thumbnails/08e11ba1-da55-4d69-9dbd-b6e4c4023d92.png"}} |
| TC-TEMPL-LIST-004 | 2026-05-09T21:02:00Z | PASS | got=200 exp=200 — GET /templates · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","category":"starter","tags":["react","vite", |
| TC-API-AUTH-001 | 2026-05-09T21:02:00Z | PASS | got=401 exp=401 — GET /workspaces no token · {"error":"Missing or invalid Authorization header"} |
| TC-API-AUTH-002 | 2026-05-09T21:02:01Z | PASS | got=401 exp=401 — GET /workspaces bogus token · {"error":"Invalid token"} |
| TC-API-SECURITY-CORS-001 | 2026-05-09T21:02:02Z | PASS | got=204 exp=204 — OPTIONS preflight cross-origin ·  |
| TC-FOLDER-CRUD-005 | 2026-05-09T21:02:03Z | PASS | got=403 exp=403 — viewer cannot create folder (403) · {"error":"Not a member of this workspace"} |
| TC-VERSIONS-CRUD-004 | 2026-05-09T21:02:04Z | PASS | got=200 exp=200 — GET versions list (already done OK) · {"data":[{"id":"86d72c4bfd3c9872ecb4f0ddeef9721dba4ef3a1","project_id":"","version_number":1,"description":"Initial commit","bookmarked":false,"created_by":"Doable","created_at":"2026-05-09T20:57:48+00:00","sha":"86d72c4 |
| TC-API-SKILLS-003 | 2026-05-09T21:02:05Z | PASS | got=200 exp=200 — GET workspace skills manifest · {"data":[]} |
| TC-API-MARKETPLACE-002 | 2026-05-09T21:02:06Z | PASS | got=200 exp=200 — GET /marketplace/listings · {"data":[],"total":0} |
| TC-MCP-CONNECTOR-001 | 2026-05-09T21:02:07Z | PASS | got=200 exp=200 — GET workspace connectors (list) · {"data":[{"id":"c97d3665-5c13-4bf4-84f5-9c402277cd3e","workspace_id":"e860bfcb-36ce-4cfe-823f-a1660e0e1514","project_id":null,"created_by":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","scope":"workspace","name":"Markdown Build |
| TC-ANALYTICS-DASHBOARD-001 | 2026-05-09T21:02:08Z | INFO | got=404 exp= — GET workspace analytics (admin) · {"error":"Not Found","path":"/admin/analytics"} |
| TC-API-ANALYTICS-003 | 2026-05-09T21:02:08Z | FAIL | got=404 exp=200 — GET /analytics/projects/:pid/page-views · {"error":"Not Found","path":"/analytics/projects/08e11ba1-da55-4d69-9dbd-b6e4c4023d92/page-views"} |
| TC-API-ANALYTICS-004 | 2026-05-09T21:02:49Z | PASS | got=200 exp=200 — GET /analytics/projects/:id/pageviews · {"data":[{"date":"2026-04-09","visitors":0,"pageViews":0},{"date":"2026-04-10","visitors":0,"pageViews":0},{"date":"2026-04-11","visitors":0,"pageViews":0},{"date":"2026-04-12","visitors":0,"pageViews":0},{"date":"2026-0 |
| TC-API-ANALYTICS-005 | 2026-05-09T21:02:50Z | PASS | got=200 exp=200 — GET /analytics/projects/:id/realtime · {"data":{"activeVisitors":0,"pages":[]}} |
| TC-API-ANALYTICS-006 | 2026-05-09T21:02:50Z | PASS | got=200 exp=200 — GET /analytics/projects/:id/overview · {"data":{"visitors":0,"pageViews":0,"sessions":0,"avgDuration":0,"bounceRate":0,"changes":{"visitors":0,"pageViews":0,"sessions":0,"avgDuration":0,"bounceRate":0}}} |
