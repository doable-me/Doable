# Bug triage roll-up — <env> run 2026-05-10

| BUG ID | Severity | Status | Retest |
|---|---|---|---|
| BUG-WS-001 | medium | FIXED + DEPLOYED | PASS — `GET /workspaces/not-a-uuid` → 400 `{"error":"Invalid workspace id"}` |
| BUG-WS-002 | low (doc) | OPEN | TC corpus path mismatch (/versions vs /projects/:id/versions); needs corpus update only |
| BUG-WS-003 | medium | FIXED + DEPLOYED | PASS — `GET /templates` unauth → 401; authed → 200 |
| BUG-AI-001 | medium | NOT-A-BUG | TC drift; corpus expects `chat` mode, API has agent/plan/visual-edit (recommendation: update TC) |
| BUG-AI-002 | medium | FIXED + DEPLOYED | PASS — whitespace-only content → 400 (stops credit burn on empty prompts) |
| BUG-AI-003 | high | FIXED + DEPLOYED | PASS — POST chat to fresh nonexistent UUID → 404; opt-in `createIfMissing:true` still 200 (closes phantom-project credit leak) |
| BUG-ADMIN-001 | low | OPEN (coverage gap) | Many admin routes (`/admin/audit`, `/admin/runtime`, `/admin/feature-flags` etc) return 404 — some are intentional (admin sub-views call different endpoints), some are impl gaps |
| BUG-WEB-AI-001 | medium | OPEN (fix-web-ux running) | First-run AI-not-configured shows raw SDK error in chat — needs friendly "Connect AI provider" CTA |
| BUG-WEB-ADMIN-001 | medium | OPEN (fix-web-ux running) | `/admin/audit` page hangs on "Loading..." when underlying API returns 404 — needs error/empty state |

## Retest commands (<env>)
```bash
TOK=$(python3 -c "import json; print(json.load(open('testcases/evidence/_tokens-env1.json'))['qa-owner']['access'])")
NONCE=$(python3 -c "import uuid; print(uuid.uuid4())")

# WS-001 — expect 400
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" -H "Authorization: Bearer $TOK" https://<env>-api.doable.me/workspaces/not-a-uuid

# WS-003 — expect 401
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" https://<env>-api.doable.me/templates

# AI-002 — expect 400
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"content":"   \n\t  "}' https://<env>-api.doable.me/projects/$NONCE/chat

# AI-003 — expect 404
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"content":"hi"}' https://<env>-api.doable.me/projects/$NONCE/chat
```
