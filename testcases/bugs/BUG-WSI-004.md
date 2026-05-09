# BUG-WSI-004 — Notifications API completely missing

## Environment
- zantaz: https://zantaz-api.doable.me
- 2026-05-10 ~18:58Z
- Test corpus: `testcases/22-notifications/`

## Reproduction
```bash
curl -i -H "Authorization: Bearer $OWNER" https://zantaz-api.doable.me/notifications
# HTTP/2 404
# {"error":"Not Found","path":"/notifications"}
```

## Source-code verification
`services/api/src/routes.ts` has **no** notification import or mount. Searched whole `services/api/src/routes/` — only one match (`chat/stream-recovery.ts`, unrelated).

## Test corpus expectations
`testcases/22-notifications/_INDEX.md` enumerates:
- TC-NOTIF-LIST: GET /notifications
- TC-NOTIF-PUSH: push subscriptions
- TC-NOTIF-TYPES: typed payloads

None of these endpoints exist.

## Severity
high — feature documented in corpus is entirely unimplemented OR served from a different service (push-only via WS broadcast?). Needs product clarification:
1. If notifications are WS-only, corpus must be rewritten against `/internal/broadcast` + WS message types.
2. If a REST API was planned, file feature ticket.

## Recommended action
- Confirm with PM whether notifications are scoped to WS broadcasts only.
- Either implement REST routes or remove the corpus.
