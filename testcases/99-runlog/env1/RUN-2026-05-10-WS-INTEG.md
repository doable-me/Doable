# RUN-2026-05-10 WS+Integ+Skills+Comments+Notif (<env>)

Start: 2026-05-09T18:56:13Z
Target: https://<env>-api.doable.me  WS: wss://<env>-ws.doable.me
Runner: 5-min hard cap, curl/node only.

| TC | Time | Result | Notes |
|----|------|--------|-------|
| TC-WS-AUTH-002 | 2026-05-09T18:56:55Z | FAIL | node:internal/modules/package_json_reader:316
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURL |
| TC-WS-AUTH-005 | 2026-05-09T18:56:55Z | FAIL | node:internal/modules/package_json_reader:316
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURL |
| TC-WS-AUTH-001 | 2026-05-09T18:56:56Z | FAIL | node:internal/modules/package_json_reader:316
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null); |
| TC-WS-AUTH-003 | 2026-05-09T18:56:56Z | FAIL | node:internal/modules/package_json_reader:316
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURL |
| TC-WS-AUTH-032 | 2026-05-09T18:57:29Z | PASS | /health 200 |
| TC-INTEG-LIST-001 | 2026-05-09T18:57:30Z | FAIL | got 404 |
| TC-INTEG-LIST-038 | 2026-05-09T18:57:30Z | PASS | anon=401 |
| TC-INTEG-LIST-026 | 2026-05-09T18:57:32Z | FAIL | got 400 |
| TC-INTEG-LIST-040 | 2026-05-09T18:57:32Z | PASS | 404 not_found |
| TC-NOTIF-LIST-001 | 2026-05-09T18:57:33Z | FAIL | got 404 |
| TC-COMMENTS-CRUD-LIST | 2026-05-09T18:57:34Z | FAIL | got 404 |
| TC-SKILLS-LIST-001 | 2026-05-09T18:57:37Z | PASS | 200 |
