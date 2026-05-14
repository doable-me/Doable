# R10 — Failures by route

BASE_URL: https://dev-api.doable.me
Total assertions: 1194
Duration: 38.1s

| Verb+Route | Fails | Total | Sample |
|---|---:|---:|---|
| `POST /auth/password-reset` | 5 | 14 | qa-owner/empty → 404 (expected 400|401|415|422|429); qa-owner/invalid-shape → 404 (expected 400|401|415|422|429); qa-owner/junk → 404 (expected 400|401|415|422|429) |
| `POST /auth/mfa/enroll/start` | 5 | 14 | qa-owner/empty → 429 (expected 200|400|409); qa-owner/empty → 500 (expected 400|401|415|422); qa-owner/invalid-shape → 429 (expected 400|401|415|422) |
| `GET /projects/22222222-2222-2222-2222-222222222222/files` | 1 | 3 | qa-owner/none → 200 (expected 400|401|403|404) |
