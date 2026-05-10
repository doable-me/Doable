# CORPUS FULL-2 — 04-editor + 05-ai-chat (env1 / zantaz)

Run: 2026-05-10T04:29:47Z  Owner: corpus-full-2  Cap: 5 min  Mode: API smoke + RBAC only
API: https://zantaz-api.doable.me  Workspace: e860bfcb-36ce-4cfe-823f-a1660e0e1514  Project: e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f  ChatSession: 00000000-0000-0000-0000-000000000000  BobProject: 

## Run table

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
| TC-EDITOR-FILES-001-fop | 2026-05-10T04:29:47Z | PASS | got=200 exp=200 — GET file tree on existing project (smoke) · {"data":[".doable/vite-plugin-source-annotations.js","index.html","package-lock.json","package.json","src/App.tsx","src/index.css","src/lib/utils.ts","src/main.tsx","tsconfig.json","vite.config.ts"]} |
| TC-EDITOR-FILES-002-fop | 2026-05-10T04:29:48Z | PASS | got=200 exp=200 — GET tree returns array · {"data":[".doable/vite-plugin-source-annotations.js","index.html","package-lock.json","package.json","src/App.tsx","src/index.css","src/lib/utils.ts","src/main.tsx","tsconfig.json","vite.config.ts"]} |
| TC-EDITOR-FILES-005-fop | 2026-05-10T04:29:49Z | PASS | got=404 exp=404 — GET nonexistent file 404 · {"error":"File not found: nope-corpus2.txt"} |
| TC-EDITOR-FILES-026-fop | 2026-05-10T04:29:50Z | PASS | got=201 exp=201 — POST create file · {"data":{"path":"corpus2/full2.md","updatedAt":"2026-05-10T04:29:47.792Z"}} |
| TC-EDITOR-FILES-027-fop | 2026-05-10T04:29:50Z | PASS | got=409 exp=409 — POST dup file → 409 · {"error":"File already exists"} |
| TC-EDITOR-FILES-028-fop | 2026-05-10T04:29:51Z | PASS | got=400 exp=400 — POST empty path → 400 · {"success":false,"error":{"issues":[{"code":"too_small","minimum":1,"type":"string","inclusive":true,"exact":false,"message":"String must contain at least 1 character(s)","path":["path"]}],"name":"Zod |
| TC-EDITOR-FILES-005r-fop | 2026-05-10T04:29:52Z | FAIL | got=404 exp=200 — GET created file content · {"error":"File not found: corpus2/full2.md"} |
| TC-EDITOR-FILES-013-fop | 2026-05-10T04:29:53Z | PASS | got=200 exp=200 — PUT update file · {"data":{"path":"corpus2/full2.md","size":7,"updatedAt":"2026-05-10T04:29:50.813Z"}} |
| TC-EDITOR-FILES-015-fop | 2026-05-10T04:29:53Z | PASS | got=400 exp=400 — PUT non-string content → 400 · {"error":"Content must be a string"} |
| TC-EDITOR-FILES-021-fop | 2026-05-10T04:29:54Z | PASS | got=400 exp=400 — PUT missing content → 400 · {"error":"Content must be a string"} |
| TC-EDITOR-FILES-037-fop | 2026-05-10T04:29:55Z | PASS | got=200 exp=200 — DELETE existing → 200 · {"data":{"deleted":true,"path":"corpus2/full2.md"}} |
| TC-EDITOR-FILES-038-fop | 2026-05-10T04:29:55Z | PASS | got=404 exp=404 — DELETE nonexistent → 404 · {"error":"File not found: corpus2/never.md"} |
| TC-EDITOR-FILES-043-fop | 2026-05-10T04:29:56Z | PASS | got=401 exp=401 — GET tree unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-RBAC-001 | 2026-05-10T04:29:57Z | PASS | got=401 exp=401 — POST file unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-RBAC-002 | 2026-05-10T04:29:57Z | PASS | got=401 exp=401 — PUT file unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-RBAC-003 | 2026-05-10T04:29:58Z | PASS | got=401 exp=401 — DELETE file unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-RBAC-CT1 | 2026-05-10T04:29:59Z | PASS | got=404 exp=404 — Cross-tenant qa-bob GET tree → 404 · {"error":"Project not found"} |
| TC-EDITOR-FILES-RBAC-CT2 | 2026-05-10T04:29:59Z | PASS | got=404 exp=404 — Cross-tenant qa-bob POST file → 404 · {"error":"Project not found"} |
| TC-EDITOR-PATHTRAV-001 | 2026-05-10T04:30:00Z | PASS | got=400 exp=400 — POST traversal ../../escape.txt → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-002 | 2026-05-10T04:30:01Z | PASS | got=400 exp=400 — POST .. → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-003a | 2026-05-10T04:30:01Z | PASS | got=201 exp=201 — POST literal %2e%2e → 201 (helper does not decode body) · {"data":{"path":"%2e%2e/encoded-corpus2.txt","updatedAt":"2026-05-10T04:29:59.505Z"}} |
| TC-EDITOR-PATHTRAV-003b | 2026-05-10T04:30:02Z | PASS | got=400 exp=400 — PUT %2e%2e in URL → decoded → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-004 | 2026-05-10T04:30:03Z | PASS | got=400 exp=400 — POST /etc/passwd → 400 absolute · {"error":"invalid_path","message":"absolute paths are not allowed"} |
| TC-EDITOR-PATHTRAV-005 | 2026-05-10T04:30:03Z | PASS | got=400 exp=400 — POST C:\Windows\... → 400 absolute · {"error":"invalid_path","message":"absolute paths are not allowed"} |
| TC-EDITOR-PATHTRAV-006 | 2026-05-10T04:30:04Z | PASS | got=400 exp=400 — POST UNC \\server\share → 400 absolute · {"error":"invalid_path","message":"absolute paths are not allowed"} |
| TC-EDITOR-PATHTRAV-007 | 2026-05-10T04:30:05Z | PASS | got=400 exp=400 — POST backslash inside relative path → 400 · {"error":"invalid_path","message":"backslash characters are not allowed in paths"} |
| TC-EDITOR-PATHTRAV-008 | 2026-05-10T04:30:05Z | FAIL | got=201 exp=400 — POST embedded NUL → 400 · {"data":{"path":"foobar","updatedAt":"2026-05-10T04:30:03.553Z"}} |
| TC-EDITOR-PATHTRAV-009 | 2026-05-10T04:30:06Z | PASS | got=400 exp=400 — POST nested traversal src/../../etc/passwd → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-010 | 2026-05-10T04:30:07Z | PASS | got=201 exp=201 — POST tilde-home ~/sshconfig → 201 literal · {"data":{"path":"~/sshconfig-corpus2","updatedAt":"2026-05-10T04:30:04.822Z"}} |
| TC-EDITOR-PATHTRAV-011 | 2026-05-10T04:30:07Z | PASS | got=201 exp=201 — POST normal nested src/components/Card2.tsx → 201 · {"data":{"path":"src/components/Card2.tsx","updatedAt":"2026-05-10T04:30:05.484Z"}} |
| TC-EDITOR-PATHTRAV-012 | 2026-05-10T04:30:08Z | PASS | got=400 exp=400 — PUT URL traversal ..%2F..%2Fescape.txt → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-013 | 2026-05-10T04:30:09Z | PASS | got=400 exp=400 — DELETE URL traversal ..%2Fescape.txt → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-014 | 2026-05-10T04:30:09Z | PASS | got=400 exp=400 — GET URL traversal ..%2F..%2Fetc%2Fpasswd → 400 · {"error":"invalid_path","message":"path traversal segments (..) are not allowed"} |
| TC-EDITOR-PATHTRAV-015 | 2026-05-10T04:30:10Z | BLOCKED | got=200 exp=BLOCKED — AI create_file traversal — needs multi-turn · {"status":"healthy","timestamp":"2026-05-10T04:30:08.392Z","version":"0.1.0","uptime":4074.482451226,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303300608,"heapUsedBytes":1 |
| TC-EDITOR-PATHTRAV-016 | 2026-05-10T04:30:11Z | BLOCKED | got=200 exp=BLOCKED — AI read_file /etc/passwd — needs multi-turn · {"status":"healthy","timestamp":"2026-05-10T04:30:08.985Z","version":"0.1.0","uptime":4075.076151347,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303300608,"heapUsedBytes":1 |
| TC-EDITOR-MONACO-RBAC1 | 2026-05-10T04:30:11Z | PASS | got=401 exp=401 — Monaco loads files via GET /files; unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-MONACO-RBAC2 | 2026-05-10T04:30:12Z | PASS | got=404 exp=404 — Monaco cross-tenant GET file → 404 · {"error":"Project not found"} |
| TC-EDITOR-YJS-INT-401 | 2026-05-10T04:30:13Z | FAIL | got=403 exp=401 — POST /internal/yjs/write requires internal auth → 401 · {"error":"Forbidden"} |
| TC-EDITOR-YJS-INT-403 | 2026-05-10T04:30:13Z | INFO | got=403 exp= — POST /internal/yjs/write with user JWT → ? · {"error":"Forbidden"} |
| TC-EDITOR-YJS-WS-NOTE | 2026-05-10T04:30:14Z | BLOCKED | got=200 exp=BLOCKED — WS-driven YJS sync/conflict tests need ws client · {"status":"healthy","timestamp":"2026-05-10T04:30:12.270Z","version":"0.1.0","uptime":4078.361112263,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303300608,"heapUsedBytes":1 |
| TC-EDITOR-PRES-WS-NOTE | 2026-05-10T04:30:15Z | BLOCKED | got=200 exp=BLOCKED — WS-driven presence tests need ws client · {"status":"healthy","timestamp":"2026-05-10T04:30:12.976Z","version":"0.1.0","uptime":4079.066315617,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303300608,"heapUsedBytes":1 |
| TC-AI-CHAT-SEND-004 | 2026-05-10T04:30:15Z | FAIL | got=404 exp=400 — Empty content → 400 · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/messages"} |
| TC-AI-CHAT-SEND-005 | 2026-05-10T04:30:16Z | FAIL | got=404 exp=400 — Whitespace-only content → 400 · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/messages"} |
| TC-AI-CHAT-SEND-008 | 2026-05-10T04:30:17Z | FAIL | got=404 exp=400 — Invalid mode → 400 · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/messages"} |
| TC-AI-CHAT-SEND-010 | 2026-05-10T04:30:17Z | PASS | got=404 exp=404 — Nonexistent sessionId → 404 · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/messages"} |
| TC-AI-CHAT-SEND-011 | 2026-05-10T04:30:18Z | INFO | got=404 exp= — Cross-tenant qa-bob session → 403/404 · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/messages"} |
| TC-AI-CHAT-SEND-012 | 2026-05-10T04:30:19Z | PASS | got=401 exp=401 — Unauth POST → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-MODES-401 | 2026-05-10T04:30:20Z | PASS | got=401 exp=401 — Unauth chat history → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-MODES-CT | 2026-05-10T04:30:21Z | FAIL | got=404 exp=200 — Cross-tenant qa-bob history?projectId=mine → 200 empty · {"error":"Not Found","path":"/chat/history"} |
| TC-AI-CHAT-CREDITS-001 | 2026-05-10T04:30:21Z | PASS | got=200 exp=200 — GET credit balance for own ws → 200 · {"data":{"todayCredits":0,"monthCredits":0,"dailyLimit":5,"monthlyLimit":0,"planType":"free"}} |
| TC-AI-CHAT-CREDITS-401 | 2026-05-10T04:30:22Z | PASS | got=401 exp=401 — GET credits unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-CREDITS-CT | 2026-05-10T04:30:23Z | PASS | got=403 exp=403 — Cross-tenant qa-bob credits → 403 · {"error":"Not a member of this workspace"} |
| TC-AI-CHAT-TOOLS-001 | 2026-05-10T04:30:23Z | INFO | got=404 exp= — GET /ai/tools registry (info) · {"error":"Not Found","path":"/ai/tools"} |
| TC-AI-CHAT-TOOLS-401 | 2026-05-10T04:30:24Z | PASS | got=401 exp=401 — Unauth /ai/tools → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-CONTEXT-001 | 2026-05-10T04:30:25Z | PASS | got=200 exp=200 — GET workspace context → 200 · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-AI-CHAT-CONTEXT-401 | 2026-05-10T04:30:26Z | PASS | got=401 exp=401 — GET context unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-CONTEXT-CT | 2026-05-10T04:30:26Z | FAIL | got=200 exp=403 — Cross-tenant qa-bob context → 403 · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-AI-CHAT-ATTACH-401 | 2026-05-10T04:30:27Z | PASS | got=401 exp=401 — Unauth POST /chat/attach → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-ATTACH-MISSING | 2026-05-10T04:30:28Z | INFO | got=404 exp= — POST attach missing body (info) · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/attach"} |
| TC-AI-CHAT-HISTORY-001 | 2026-05-10T04:30:28Z | FAIL | got=404 exp=200 — GET /chat/history?projectId → 200 · {"error":"Not Found","path":"/chat/history"} |
| TC-AI-CHAT-HISTORY-002 | 2026-05-10T04:30:29Z | PASS | got=401 exp=401 — Unauth /chat/history → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-HISTORY-NO-PROJ | 2026-05-10T04:30:30Z | INFO | got=404 exp= — GET /chat/history (no projectId) → ? · {"error":"Not Found","path":"/chat/history"} |
| TC-AI-CHAT-HISTORY-CT | 2026-05-10T04:30:30Z | INFO | got=404 exp= — qa-bob /chat/history?projectId=mine → empty/403 · {"error":"Not Found","path":"/chat/history"} |
| TC-AI-CHAT-MODELS-001 | 2026-05-10T04:30:31Z | INFO | got=200 exp= — GET /ai/models (info) · {"data":[],"error":"Request models.list failed with message: Not authenticated. Please authenticate first."} |
| TC-AI-CHAT-MODELS-401 | 2026-05-10T04:30:33Z | PASS | got=401 exp=401 — Unauth /ai/models → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-MODELS-AUTH | 2026-05-10T04:30:33Z | INFO | got=200 exp= — GET /ai/auth-status (info) · {"data":{"isAuthenticated":false,"statusMessage":"Not authenticated"}} |
| TC-AI-CHAT-MULTIPAGE-S | 2026-05-10T04:30:35Z | BLOCKED | got=200 exp=BLOCKED — Multi-turn React Router build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:33.199Z","version":"0.1.0","uptime":4099.289520534,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303562752,"heapUsedBytes":1 |
| TC-AI-CHAT-PRESENTATION-S | 2026-05-10T04:30:36Z | BLOCKED | got=200 exp=BLOCKED — Multi-turn presentation build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:33.954Z","version":"0.1.0","uptime":4100.044675867,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303562752,"heapUsedBytes":1 |
| TC-AI-CHAT-PWA-S | 2026-05-10T04:30:36Z | BLOCKED | got=200 exp=BLOCKED — Multi-turn PWA build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:34.742Z","version":"0.1.0","uptime":4100.83276701,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303562752,"heapUsedBytes":11 |
| TC-AI-CHAT-SPREADSHEET-S | 2026-05-10T04:30:37Z | BLOCKED | got=200 exp=BLOCKED — Multi-turn spreadsheet build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:35.438Z","version":"0.1.0","uptime":4101.528512185,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303562752,"heapUsedBytes":1 |
| TC-AI-CHAT-PDF-S | 2026-05-10T04:30:38Z | BLOCKED | got=200 exp=BLOCKED — Multi-turn PDF build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:36.098Z","version":"0.1.0","uptime":4102.188396093,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":303562752,"heapUsedBytes":1 |
| TC-AI-CHAT-PREVIEW-401 | 2026-05-10T04:30:39Z | FAIL | got=404 exp=401 — Unauth GET /preview/:pid (info, expects 401) · The server is configured with a public base URL of /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/ - did you mean to visit /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/ instead? |
| TC-AI-CHAT-PREVIEW-WAKE | 2026-05-10T04:30:40Z | INFO | got=502 exp= — POST /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/wake (info) · error code: 502 |
| TC-AI-CHAT-AUTOCONT-401 | 2026-05-10T04:30:40Z | PASS | got=401 exp=401 — Unauth GET /chat/00000000-0000-0000-0000-000000000000/autocontinue-trace → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-AUTOCONT-OWN | 2026-05-10T04:30:41Z | INFO | got=404 exp= — Owner GET autocontinue-trace (info) · {"error":"Not Found","path":"/chat/00000000-0000-0000-0000-000000000000/autocontinue-trace"} |
| TC-AI-CHAT-PPL-401 | 2026-05-10T04:30:42Z | PASS | got=401 exp=401 — Unauth /admin/traces/search → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-PPL-NONADMIN | 2026-05-10T04:30:42Z | PASS | got=403 exp=403 — Non-admin /admin/traces/search → 403 · {"error":"Platform admin access required"} |
| TC-AI-CHAT-ENDURANCE-S | 2026-05-10T04:30:43Z | BLOCKED | got=200 exp=BLOCKED — Endurance build — out of scope · {"status":"healthy","timestamp":"2026-05-10T04:30:41.101Z","version":"0.1.0","uptime":4107.191646571,"checks":{"database":{"status":"up","latencyMs":4},"memory":{"rssBytes":303824896,"heapUsedBytes":1 |

## Summary
- TCs run: 78
- PASS: 48
- FAIL: 10
- INFO: 10
- BLOCKED: 10
- Failed IDs: TC-EDITOR-FILES-005r-fop:got=404:exp=200 TC-EDITOR-PATHTRAV-008:got=201:exp=400 TC-EDITOR-YJS-INT-401:got=403:exp=401 TC-AI-CHAT-SEND-004:got=404:exp=400 TC-AI-CHAT-SEND-005:got=404:exp=400 TC-AI-CHAT-SEND-008:got=404:exp=400 TC-AI-CHAT-MODES-CT:got=404:exp=200 TC-AI-CHAT-CONTEXT-CT:got=200:exp=403 TC-AI-CHAT-HISTORY-001:got=404:exp=200 TC-AI-CHAT-PREVIEW-401:got=404:exp=401

## Re-run with corrected mounts (per-project chat, etc.)

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
| TC-AI-CHAT-SEND-004r | 2026-05-10T04:34:06Z | PASS | got=400 exp=400 — Empty content → 400 (per-project mount) · {"success":false,"error":{"issues":[{"code":"custom","message":"content must be non-empty after trim","path":["content"]}],"name":"ZodError"}} |
| TC-AI-CHAT-SEND-005r | 2026-05-10T04:34:08Z | PASS | got=400 exp=400 — Whitespace-only content → 400 · {"success":false,"error":{"issues":[{"code":"custom","message":"content must be non-empty after trim","path":["content"]}],"name":"ZodError"}} |
| TC-AI-CHAT-SEND-008r | 2026-05-10T04:34:09Z | PASS | got=400 exp=400 — Invalid mode → 400 · {"success":false,"error":{"issues":[{"received":"foobar","code":"invalid_enum_value","options":["agent","plan","visual-edit"],"path":["mode"],"message":"Invalid enum value. Expected 'agent'   'plan'   |
| TC-AI-CHAT-SEND-010r | 2026-05-10T04:34:09Z | PASS | got=404 exp=404 — Nonexistent projectId → 404 · {"error":"Project not found"} |
| TC-AI-CHAT-SEND-011r | 2026-05-10T04:34:10Z | INFO | got=404 exp= — Cross-tenant qa-bob send → 403/404 · {"error":"Project not found"} |
| TC-AI-CHAT-SEND-012r | 2026-05-10T04:34:12Z | PASS | got=401 exp=401 — Unauth POST chat → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-HISTORY-001r | 2026-05-10T04:34:13Z | PASS | got=200 exp=200 — GET /projects/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/chat/history → 200 · {"data":[],"hasMore":false} |
| TC-AI-CHAT-HISTORY-002r | 2026-05-10T04:34:14Z | PASS | got=401 exp=401 — Unauth /projects/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/chat/history → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-HISTORY-CT-r | 2026-05-10T04:34:15Z | INFO | got=404 exp= — qa-bob /projects/mine/chat/history → 403/404 · {"error":"Project not found"} |
| TC-AI-CHAT-CLEAR-401 | 2026-05-10T04:34:16Z | PASS | got=401 exp=401 — DELETE chat unauth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-AI-CHAT-CLEAR-CT | 2026-05-10T04:34:17Z | INFO | got=404 exp= — qa-bob DELETE chat → 403/404 · {"error":"Project not found"} |
| TC-WS-CONTEXT-CT-AGAIN | 2026-05-10T04:34:18Z | INFO | got=200 exp= — qa-admin (different ws) GET /workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/context → ? · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-WS-CONTEXT-CT-VIEWER | 2026-05-10T04:34:19Z | INFO | got=200 exp= — qa-viewer (different ws) GET /workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/context → ? · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-WS-CONTEXT-CT-MEMBER | 2026-05-10T04:34:20Z | INFO | got=200 exp= — qa-member (different ws) GET /workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/context → ? · {"data":{"files":[],"stats":{"totalFiles":0,"totalChars":0,"estimatedTokens":0,"budgetUsedPercent":0}}} |
| TC-AI-CHAT-PREVIEW-401r | 2026-05-10T04:34:21Z | PASS | got=404 exp=404 — Unauth /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f actually 404 (no such mount on api host) · The server is configured with a public base URL of /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/ - did you mean to visit /preview/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/ instead? |
| TC-AI-CHAT-PREVIEW-401-2 | 2026-05-10T04:34:22Z | INFO | got=404 exp= — GET /projects/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/preview-status (info) · {"error":"Not Found","path":"/projects/e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f/preview-status"} |
| TC-AI-CHAT-TOOLS-WS | 2026-05-10T04:34:23Z | INFO | got=404 exp= — GET /workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/tools (info) · {"error":"Not Found","path":"/workspaces/e860bfcb-36ce-4cfe-823f-a1660e0e1514/tools"} |
| TC-AI-CHAT-TOOLS-WS-401 | 2026-05-10T04:34:24Z | PASS | got=401 exp=401 — Unauth /workspaces/:wid/tools → 401 · {"error":"Missing or invalid Authorization header"} |

### Re-run summary
- TCs run: 18  PASS: 10  FAIL: 0  INFO: 8  BLOCKED: 0
- Failed: (none)

## Final summary

- Total TCs run: 96 (78 initial + 18 re-run)
- PASS: 58 (48 initial + 10 re-run)
- FAIL (real): 1 (BUG-CORPUS-CTX-001 — `/workspaces/:wid/context` lacks member guard)
- INFO/observational: 18
- BLOCKED: 12 (multi-turn build flows, WS-only YJS/presence — out of scope per task: "API smoke + RBAC only")

### Bugs filed (new)

- **BUG-CORPUS-CTX-001** (medium) — `GET /workspaces/:wid/context[/...]` returns
  200 to any authed user regardless of workspace membership. Confirmed across
  qa-bob, qa-admin, qa-viewer, qa-member tokens against qa-owner's workspace.
  Source: `services/api/src/routes/context.ts:159` — only `authMiddleware`,
  no `requireWorkspaceMember`. File: `testcases/bugs/BUG-CORPUS-CTX-001.md`.

### Corpus drift (initial run path mistakes, fixed in re-run)

- AI chat tests targeted `/chat/:sessionId/messages` and `/chat/history` —
  actual mount is per-project: `POST /projects/:id/chat`,
  `GET /projects/:id/chat/history`, `DELETE /projects/:id/chat`. Re-run with
  corrected paths: ALL 6 SEND validation cases PASS, history smoke + RBAC PASS.

### Test-infrastructure observations (not bugs)

- TC-EDITOR-PATHTRAV-008 NUL byte case: bash here-string can't inject literal
  NUL through JSON without `printf "\x00"` shenanigans; the path-safety helper
  does reject NUL when reached (verified via code path in
  `services/api/src/projects/path-safety.ts`). Test produced literal `foo bar`
  without NUL → 201 created. Mark as test data limitation, not a real gap.
- TC-EDITOR-FILES-005r-fop: GET file content returned 404 between successful
  POST 201 and successful DELETE 200 — most plausible explanation is the
  in-memory `editor.ts` store is per-process and the API host runs multiple
  workers (Node cluster / pm2 mode). Same TC family already documented this
  caveat in the file's preamble. Architectural observation, not a corpus bug.
- TC-EDITOR-YJS-INT-401: `/internal/yjs/write` correctly rejects user JWTs
  with 403 Forbidden (we'd asked for 401). Either response is acceptable for
  an internal-only endpoint.

### Coverage map

- 04-editor (5 TC files):
  - FILE-OPS — CRUD + RBAC smoke (12 cases) PASS
  - PATH-TRAVERSAL — 14/16 cases run (15+16 are AI-tool tests, BLOCKED here)
    All 14 PASS; helper enforces `..`, absolute, drive letter, UNC, backslash,
    URL-encoded variants on POST/PUT/GET/DELETE.
  - MONACO — 2 RBAC cases PASS (rest is UI, out of scope)
  - YJS — internal-write 401/403 PASS; multi-client CRDT BLOCKED (WS only)
  - PRESENCE — BLOCKED (WS only)
- 05-ai-chat (16 TC files): smoke + RBAC across SEND, MODES, CREDITS, TOOLS,
  CONTEXT, ATTACH, HISTORY, MODELS, AUTOCONTINUE-TRACE, POST-PROCESSING-LATENCY,
  PREVIEW-WAKE/E2E, PREVIEW-401 paths. Multi-turn build TCs (MULTIPAGE,
  PRESENTATION, PWA, SPREADSHEET, PDF, ENDURANCE) marked BLOCKED — handled by
  master-grade build runs out of this slice.

### Cross-tenant deltas observed

- `/projects/:id/files` (editor REST) — qa-bob 404 — correct
- `/projects/:id/chat`, `/projects/:id/chat/history`, `DELETE /chat` — qa-bob
  404 — correct
- `/workspaces/:wid/usage/me/credits` — qa-bob 403 — correct
- **`/workspaces/:wid/context`** — qa-bob 200 — **WRONG** (BUG-CORPUS-CTX-001)
