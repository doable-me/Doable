# BUG-AI-003 — POST `/projects/{nonexistent-uuid}/chat` returns 200 + runs agent

**Severity:** high (tenant isolation + credit leak)
**Found:** 2026-05-10 by qa-ai on https://zantaz-api.doable.me
**Test:** TC-AI-CHAT-SEND-010

## Reproduction
```
curl -X POST -H "Authorization: Bearer <qa-owner>" \
  -H "Content-Type: application/json" \
  -d '{"content":"hi"}' \
  https://zantaz-api.doable.me/projects/00000000-0000-0000-0000-000000000000/chat
```

## Expected
HTTP 404 (project does not exist). No SSE stream, no scaffolding, no credit deduction.

## Actual
HTTP 200, full SSE stream:
```
data: {"type":"thinking","data":"Preparing workspace..."}
data: {"type":"status","data":{"phase":"scaffolding","message":"Creating project files..."}}
...
```
Server scaffolds a phantom project, kicks off dev server, and likely deducts credit — all for a project ID that doesn't exist in `projects`. This is a project-existence/ownership check gap in the chat send handler. Combined with no auth scoping, a user could spend credits on / influence stale or forged project IDs.

## Suggested fix
Before scaffolding, `SELECT 1 FROM projects WHERE id = $1 AND <accessible-by-user>`; reject 404/403 if missing.
