# CORPUS-FULL-15 — env1 — 2026-05-10T11:59:21Z

| TC | HTTP | Result | Note |
|---|---|---|---|
| TC-GH-COMMITS-LOG | 200 | PASS | GET https://github.com/ |
| TC-GH-CONNECT-REPO | - | SKIP | no URL parseable |
| TC-GH-IMPORT | 404 | AUTH_OR_404 | GET https://github.com/org/repo |
| TC-GH-OAUTH | 302 | INFO | GET https://github.com/login/oauth/authorize?client_id=...&scope=repo&state= |
| TC-GH-PULL | - | SKIP | no URL parseable |
| TC-GH-PUSH | - | SKIP | no URL parseable |
| TC-GH-TENANT-ISOLATION | - | SKIP | no URL parseable |
| TC-GH-WEBHOOK | 401 | AUTH_OR_404 | GET https://api.doable.me/github/webhook |
