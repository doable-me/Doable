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
| BUG-WEB-AI-001 | medium | RE-PATCHED + DEPLOYED | 2nd-pass patch removed `msg.isError` gate, added data-testid="ai-not-configured-cta", primary CTA → /admin?tab=users (real route). Trigger pending: now that all qa workspaces have MiniMax provider, the error condition no longer fires for normal runs — CTA stays dormant. Verify via dev tools: `document.querySelector('[data-testid="ai-not-configured-cta"]')` should be non-null when condition is forced. |
| BUG-WEB-ADMIN-001 | medium | RESOLVED | After deploy /admin/audit renders fully (4 sessions, 8 messages, 2 users); error/empty-state card stays dormant for future genuine 404s |
| BUG-PUB-001 | high | FIXED + DEPLOYED + VERIFIED | PASS — `/billing/balance`, `/billing/topup/packages`, `/billing/topup`, `/billing/invoices` all return 200 with proper schemas (4 packages: small/medium/large/xlarge; balance returns dailyRemaining/dailyMax/etc) |
| BUG-PUB-004 | critical | FIRST-PATCH-INSUFFICIENT | First fix added install-step before build but gated by `node_modules missing`. Retest revealed scaffold install runs --omit=dev so node_modules is partial (missing vite/typescript). Second-pass fix-pub-004b agent in flight: A) drop --omit=dev from scaffold install B) probe build-tool presence in builder gate |
| BUG-PUB-002 | medium | OPEN | /billing/portal returns 400 on empty body in Stripe-bypass mode; should 503 |
| BUG-PUB-003 | high | OPEN | /marketplace anon → 401; should be public per docs (workaround: /marketplace/listings) |
| BUG-WSI-001..004 | mixed | OPEN | WS room.join no presence ack; /integrations/connections requires workspaceId; /design-comments/:id 308 redirect; /notifications API unmounted |
| BUG-AI-PREVIEW-001 | **CRITICAL** | RCA-IN-FLIGHT (fix-preview-spawn) | Live preview never spawns. AI writes correct code (verified — counter app exact match), files land on disk, but no vite process starts; `pgrep vite` 0 results, /admin/dev-servers empty, /preview-proxy/<id>/ 404. The "Compiling project… (Xs)" SSE messages are synthetic timer output, not real process state. End-user value-prop ("see your app live") is NON-FUNCTIONAL on this build. |

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
