# R10 — Failures by route

BASE_URL: https://dev-api.doable.me
Total assertions: 1194
Duration: 33.9s

| Verb+Route | Fails | Total | Sample |
|---|---:|---:|---|
| `POST /auth/mfa/enroll/start` | 5 | 14 | qa-owner/empty → 200 (expected 400|401|415|422); qa-owner/invalid-shape → 200 (expected 400|401|415|422); qa-owner/junk → 200 (expected 400|401|415|422) |
