# BUG-CORPUS-DC-001 — design-comments POST has no input validation; 500 ISE on bad body

- **Severity:** HIGH (data-integrity + 500 leak)
- **Component:** `services/api/src/routes/design-comments.ts`
- **Found by:** corpus-delta agent, 2026-05-10
- **Env:** env1 (zantaz, https://zantaz-api.doable.me)
- **Status:** OPEN

## Summary

`POST /design-comments/:projectId` does **no validation** on the request body before forwarding to the database. Three observed failure modes:

1. **xPercent out of [0,1]** is silently persisted. Sending `{"xPercent":1.5,"yPercent":0.5,"content":"hi","pagePath":"home"}` returns **201** with `x_percent=1.5` stored. Anchored comments will render off-canvas; downstream callers can poison rows for any project member.
2. **Empty `content`** accepted. `{"xPercent":0.5,"yPercent":0.5,"content":"","pagePath":"home"}` returns **201**. Empty comment rows pollute lists.
3. **Missing required fields → 500 ISE.** `POST` with `{}` returns `500 {"error":"Internal Server Error"}` instead of a 4xx with field-level message. This is a server-error leak: a stack-trace path is hit for routine bad-input.

## Reproduction

Token: `qa-owner` from `testcases/evidence/_tokens-env1.json`.  
Project: `bd1184f4-335c-4752-ac52-938fee58f915`.

```pwsh
$h = @{Authorization = "Bearer $owner"}
$api = "https://zantaz-api.doable.me"
$proj = "bd1184f4-335c-4752-ac52-938fee58f915"

# (1) xPercent out of range — should be 400, got 201
Invoke-WebRequest -Uri "$api/design-comments/$proj" -Method POST `
  -Body '{"xPercent":1.5,"yPercent":0.5,"content":"hi","pagePath":"home"}' `
  -ContentType 'application/json' -Headers $h -SkipHttpErrorCheck

# (2) Empty content — should be 400, got 201
Invoke-WebRequest -Uri "$api/design-comments/$proj" -Method POST `
  -Body '{"xPercent":0.5,"yPercent":0.5,"content":"","pagePath":"home"}' `
  -ContentType 'application/json' -Headers $h -SkipHttpErrorCheck

# (3) Empty body — should be 400, got 500
Invoke-WebRequest -Uri "$api/design-comments/$proj" -Method POST `
  -Body '{}' -ContentType 'application/json' -Headers $h -SkipHttpErrorCheck
```

Evidence rows persisted under `qa-owner` on env1:
- `id=5151bce3-d7d1-489f-9396-71685659cd8e` (x_percent=1.5)
- `id=9b585a06-2f37-4025-accc-42f8c5d66865` (content="")

## Root cause

`services/api/src/routes/design-comments.ts:60-80` — the POST handler reads `body` via `c.req.json()` and forwards `xPercent`, `yPercent`, `content`, etc. directly to `comments.create(...)` with **no schema validation, no range checks, no required-field guards**. When the DB column is NOT NULL and `body.content === undefined`, Postgres throws → unhandled in handler → Hono returns its default 500.

Compare with `routes/design-comments.ts:23-42` (internal endpoint) which is just as un-validated; same risk if any caller can hit it with the internal secret.

## Suggested fix (root cause, not workaround)

1. Add a Zod (or hand-rolled) schema at the top of the file:
   ```ts
   const CreateCommentSchema = z.object({
     xPercent: z.number().min(0).max(1),
     yPercent: z.number().min(0).max(1),
     content: z.string().trim().min(1).max(4096),
     pagePath: z.string().trim().max(512).optional(),
     selector: z.string().max(2048).nullish(),
     parentId: z.string().uuid().nullish(),
     displayName: z.string().max(120).nullish(),
     userColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
   });
   ```
2. In both POST handlers (auth + internal), parse `body` with `safeParse`; on failure return `c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)`.
3. Wrap the `comments.create(...)` call in `try/catch` and return `500 {error}` only for genuinely unexpected DB errors — never for missing required fields.

## Regression test

Add `testcases/20-design-comments/TC-COMMENTS-CRUD.md` rows:
- `TC-COMMENTS-CRUD-V01` — POST xPercent=1.5 → expect 400.
- `TC-COMMENTS-CRUD-V02` — POST empty content → expect 400.
- `TC-COMMENTS-CRUD-V03` — POST `{}` → expect 400 (not 500).

## Notes

- Earlier corpus runs covered TC-COMMENTS-CRUD/EDIT/RESOLVE/DELETE happy-path only. Validation gap was missed.
- Likely propagates to PUT/PATCH on the same router; not yet probed in this run window.
- No data-loss or auth bypass; just dirty rows + 500 leak. HIGH because it surfaces as confusing UX (off-canvas pins, empty bubbles) and a server-error class for any malformed client.
