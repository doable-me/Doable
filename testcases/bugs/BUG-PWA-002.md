# BUG-PWA-002 — `POST /projects` silently ignores `workspace_id` and routes into caller's personal workspace

- **Severity:** medium (data-isolation correctness; UX)
- **Env:** env1 (https://zantaz-api.doable.me)
- **Surfaced by:** TC-AI-CHAT-PWA setup step
- **Date:** 2026-05-09

## Symptom

A `POST /projects` request from `qa-owner` with body
`{"workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"app-pwa","framework_id":"vite-react"}`
returned `201` but with `data.workspace_id` set to `e860bfcb-36ce-4cfe-823f-a1660e0e1514` — the caller's personal workspace, **not** the requested QA workspace `4bbd6afe-…`. No error or warning was returned.

Caller is a member (owner) of both workspaces, so the request was authorized for either; the issue is that `workspace_id` was silently overridden.

## Repro

```
TOK=$(jq -r '."qa-owner".access' _tokens-env1.json)

curl -s -X POST https://zantaz-api.doable.me/projects \
  -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"bug-pwa-002-repro","framework_id":"vite-react"}' | jq '.data | {workspace_id, name}'
# → {"workspace_id":"<personal ws id>","name":"bug-pwa-002-repro"}
```

## Why it matters

QA harnesses, the UI's "Create project in this workspace" picker, and any
multi-workspace user will assume the body field is honored. Silent fallback
to the personal workspace breaks data-isolation expectations and makes
`/projects?workspaceId=…` listings appear inconsistent (project not found
where the user thought they put it).

## Suggested fix

- Validate `body.workspace_id` against the caller's memberships and either:
  - honor it when valid (preferred), or
  - return `400 {"error":"workspace_id not allowed"}` when the caller is not a member,
- and **never** silently rewrite the field. If the route is meant to ignore
  the field, `omit` it from the Zod schema so callers get a clear `unrecognized_keys` warning.

## Evidence

- API response body for the create call (above).
- `GET /projects?workspaceId=4bbd6afe-…` does **not** list the new project.
- `GET /projects/<new-id>` returns it with `workspace_id` = personal.
