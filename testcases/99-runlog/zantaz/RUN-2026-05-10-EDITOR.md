# RUN 2026-05-10 — EDITOR / WS / MCP / SKILLS / DESIGN-COMMENTS — zantaz

Owner: editor agent
Target: https://zantaz-api.doable.me · WS: wss://zantaz-ws.doable.me
Started: 2026-05-10T (UTC, see rows)

| TC-ID | Time | Result | Notes |
| --- | --- | --- | --- |
| TC-EDITOR-FILES-001 | 2026-05-09T18:43:53Z | PASS | got=200 exp=200 — GET file tree fresh proj · {"data":[]} |
| TC-EDITOR-FILES-014 | 2026-05-09T18:43:55Z | PASS | got=200 exp=200 — PUT upsert new file · {"data":{"path":"upsert.md","size":5,"updatedAt":"2026-05-09T18:43:54.226Z"}} |
| TC-EDITOR-FILES-005 | 2026-05-09T18:43:56Z | PASS | got=200 exp=200 — GET existing file · {"data":{"path":"upsert.md","content":"hello"}} |
| TC-EDITOR-FILES-006 | 2026-05-09T18:43:58Z | PASS | got=404 exp=404 — GET non-existent → 404 · {"error":"File not found: nope.txt"} |
| TC-EDITOR-FILES-009 | 2026-05-09T18:43:59Z | PASS | got=403 exp=403 — Path traversal blocked · {"error":"Access to '..' is forbidden"} |
| TC-EDITOR-FILES-010 | 2026-05-09T18:44:01Z | PASS | got=403 exp=403 — URL-encoded traversal blocked · {"error":"Access to '..' is forbidden"} |
| TC-EDITOR-FILES-015 | 2026-05-09T18:44:06Z | PASS | got=400 exp=400 — PUT non-string content → 400 · {"error":"Content must be a string"} |
| TC-EDITOR-FILES-021 | 2026-05-09T18:44:07Z | PASS | got=400 exp=400 — PUT missing content key → 400 · {"error":"Content must be a string"} |
| TC-EDITOR-FILES-016 | 2026-05-09T18:44:07Z | PASS | got=200 exp=200 — PUT empty string ok · {"data":{"path":"empty.md","size":0,"updatedAt":"2026-05-09T18:44:06.683Z"}} |
| TC-EDITOR-FILES-DEL | 2026-05-09T18:44:08Z | PASS | got=200 exp=200 — DELETE existing file · {"data":{"deleted":true,"path":"upsert.md"}} |
| TC-EDITOR-FILES-DEL2 | 2026-05-09T18:44:09Z | PASS | got=404 exp=404 — DELETE missing → 404 · {"error":"File not found: nope.md"} |
| TC-EDITOR-FILES-AUTH-A | 2026-05-09T18:44:10Z | PASS | got=401 exp=401 — GET without auth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-EDITOR-FILES-AUTH-B | 2026-05-09T18:44:11Z | PASS | got=401 exp=401 — GET with garbage bearer → 401 · {"error":"Invalid token"} |
| TC-EDITOR-FILES-VIEWER | 2026-05-09T18:44:11Z | FAIL | got=404 exp=403 — Viewer cannot PUT · {"error":"Project not found"} |
| TC-WS-AUTH-001 | 2026-05-09T18:44:34Z | FAIL | opened= close= exp_open=true exp_close= — valid JWT in query |
| TC-WS-AUTH-002 | 2026-05-09T18:44:38Z | FAIL | opened= close= exp_open=false exp_close=4001 — no token → 4001 |
| TC-WS-AUTH-003 | 2026-05-09T18:44:39Z | FAIL | opened= close= exp_open=false exp_close=4001 — empty token → 4001 |
| TC-WS-AUTH-005 | 2026-05-09T18:44:41Z | FAIL | opened= close= exp_open=false exp_close=4002 — garbage token → 4002 |
| TC-WS-AUTH-007 | 2026-05-09T18:44:43Z | FAIL | opened= close= exp_open=false exp_close=4002 — wrong-secret token → 4002 |
| TC-WS-AUTH-021 | 2026-05-09T18:44:44Z | FAIL | opened= close= exp_open=true exp_close= — two valid tokens accept |
| TC-MCP-CONNECTOR-LIST | 2026-05-09T18:44:52Z | FAIL | got=404 exp=200 — List connectors · {"error":"Not Found","path":"/mcp/connectors"} |
| TC-MCP-BUILTIN-CATALOG | 2026-05-09T18:44:53Z | FAIL | got=404 exp=200 — Get connector catalog · {"error":"Not Found","path":"/mcp/catalog"} |
| TC-MCP-CONNECTOR-AUTH-MISSING | 2026-05-09T18:44:53Z | PASS | got=401 exp=401 — List connectors no auth · {"error":"Missing or invalid Authorization header"} |
