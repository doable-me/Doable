# RUN 2026-05-09 — CORPUS 16-26 (env1 / zantaz)

Target: https://zantaz-api.doable.me
Owner agent: corpus-16-26 runner (5-min cap)
Domains: 16-templates 17-folders 18-versions 19-skills 20-design-comments 21-team-chat 22-notifications 23-thumbnails 24-deploy 25-runtime 26-analytics

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
| TC-TEMPL-LIST-001 | 2026-05-09T21:39:44Z | FAIL | got=401 exp=200 — GET /templates list · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-LIST-012 | 2026-05-09T21:39:45Z | FAIL | got=401 exp=200 — GET /templates anon (public read) · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-LIST-002 | 2026-05-09T21:39:47Z | FAIL | got=401 exp=200 — GET /templates?framework=vite-react filter · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-LIST-003 | 2026-05-09T21:39:49Z | FAIL | got=401 exp=200 — GET /templates?category=starter · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-LIST-019 | 2026-05-09T21:39:50Z | FAIL | got=401 exp=200 — templates contain blank/starter ids · {"error":"Missing or invalid Authorization header"} |
| TC-TEMPL-REGISTRY-002 | 2026-05-09T21:39:52Z | INFO | got=404 exp= — POST /admin/templates/refresh as owner · {"error":"Not Found","path":"/admin/templates/refresh"} |
| TC-TEMPL-REGISTRY-003 | 2026-05-09T21:39:53Z | PASS | got=403 exp=403 — POST /admin/templates/refresh as member -> 403 · {"error":"Platform admin access required"} |
| TC-TEMPL-SCAFFOLD-001 | 2026-05-09T21:39:55Z | INFO | got=403 exp= — POST /projects from template (owner) · {"error":"Project limit reached (3 for free plan). Upgrade to create more."} |
| TC-FOLDER-LIST-002 | 2026-05-09T21:39:58Z | PASS | got=400 exp=400 — GET /folders missing workspaceId · {"error":"workspaceId query parameter is required"} |
| TC-FOLDER-CREATE-024 | 2026-05-09T21:40:00Z | PASS | got=401 exp=401 — POST /folders unauth -> 401 · {"error":"Missing or invalid Authorization header"} |
| TC-FOLDER-LIST-001 | 2026-05-09T21:40:02Z | PASS | got=200 exp=200 — GET /folders?workspaceId=<ws> · {"data":[]} |
| TC-FOLDER-CREATE-001 | 2026-05-09T21:40:04Z | PASS | got=201 exp=201 — POST /folders create root · {"data":{"id":"cea564de-e109-43ba-a295-13d14ceb32e8","workspace_id":"e860bfcb-36ce-4cfe-823f-a1660e0e1514","name":"corpus-2026-05-09","parent_id":null,"position":0,"created_at":"2026-05-09T21:40:03.171Z"}} |
| TC-FOLDER-CREATE-005 | 2026-05-09T21:40:05Z | PASS | got=400 exp=400 — POST /folders empty name -> 400 · {"error":"Validation failed","details":{"name":["String must contain at least 1 character(s)"]}} |
| TC-FOLDER-CREATE-019 | 2026-05-09T21:40:07Z | PASS | got=400 exp=400 — POST /folders position negative -> 400 · {"error":"Validation failed","details":{"position":["Number must be greater than or equal to 0"]}} |
WARN: project create failed — skipping versions tests
| TC-SKILLS-LIST-001 | 2026-05-09T21:40:10Z | INFO | got=404 exp= — GET /skills (if exists) · {"error":"Not Found","path":"/skills"} |
| TC-SKILLS-MARKETPLACE-001 | 2026-05-09T21:40:11Z | INFO | got=404 exp= — GET /marketplace/skills · {"error":"Not Found","path":"/marketplace/skills"} |
| TC-CHAT-LIST-001 | 2026-05-09T21:40:12Z | INFO | got=404 exp= — GET /workspaces/:id/chat/channels · {"error":"Not Found","path":"/workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/chat/channels"} |
| TC-CHAT-MSG-001 | 2026-05-09T21:40:14Z | INFO | got=404 exp= — GET /chat/messages (if exists) · {"error":"Not Found","path":"/chat/messages"} |
| TC-NOTIF-LIST-001 | 2026-05-09T21:40:15Z | FAIL | got=400 exp=200 — GET /notifications scoped to user · {"error":"workspaceId query parameter is required"} |
| TC-NOTIF-LIST-anon | 2026-05-09T21:40:17Z | PASS | got=401 exp=401 — GET /notifications anon -> 401 · {"error":"Missing or invalid Authorization header"} |
| TC-NOTIF-LIST-003 | 2026-05-09T21:40:18Z | FAIL | got=400 exp=200 — GET /notifications?read=false filter · {"error":"workspaceId query parameter is required"} |
| TC-NOTIF-MARK-ALL-001 | 2026-05-09T21:40:20Z | INFO | got=404 exp= — POST /notifications/mark-all-read · {"error":"Not Found","path":"/notifications/mark-all-read"} |
| TC-DEPLOY-ARTIFACTS-001 | 2026-05-09T21:40:21Z | INFO | got=404 exp= — GET /deployments (root) · {"error":"Not Found","path":"/deployments"} |
| TC-RT-CAPACITY-status | 2026-05-09T21:40:23Z | INFO | got=404 exp= — GET /runtime/status (capacity) · {"error":"Not Found","path":"/runtime/status"} |
| TC-RT-VITE-001 | 2026-05-09T21:40:28Z | INFO | got=404 exp= — GET /runtime/vite (if exists) · {"error":"Not Found","path":"/runtime/vite"} |
| TC-RT-SYSTEMD-001 | 2026-05-09T21:40:29Z | INFO | got=404 exp= — GET /admin/runtime (systemd) · {"error":"Not Found","path":"/admin/runtime"} |
| TC-ANALYTICS-EVENTS-001 | 2026-05-09T21:40:30Z | INFO | got=404 exp= — GET /analytics/events · {"error":"Not Found","path":"/analytics/events"} |
| TC-ANALYTICS-DASHBOARD-001 | 2026-05-09T21:40:30Z | INFO | got=404 exp= — GET /analytics/dashboard · {"error":"Not Found","path":"/analytics/dashboard"} |
| TC-ANALYTICS-PV-001 | 2026-05-09T21:40:31Z | INFO | got=404 exp= — GET /analytics/page-views · {"error":"Not Found","path":"/analytics/page-views"} |
| TC-ANALYTICS-RETENTION-001 | 2026-05-09T21:40:32Z | INFO | got=404 exp= — GET /analytics/retention · {"error":"Not Found","path":"/analytics/retention"} |
| TC-ANALYTICS-EVENTS-anon | 2026-05-09T21:40:32Z | PASS | got=401 exp=401 — GET /analytics/events anon -> 401 · {"error":"Missing or invalid Authorization header"} |

## Summary
- TCs run: 31
- PASS: 9
- FAIL: 7
- INFO: 15
- WS_ID: e860bfcb-36ce-4cfe-823f-a1660e0e1514
- PROJ_ID: NONE
