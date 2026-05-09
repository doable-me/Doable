# BUG-CORPUS-EDT-001 — Editor route mount path doc drift

**Severity:** low (TC corpus correctness)
**Filed:** 2026-05-10 (env1 / zantaz)
**Status:** OPEN — TC docs need update

## Symptom

`testcases/04-editor/TC-EDITOR-FILE-OPS.md` describes endpoints as
`GET/PUT/POST/DELETE /editor/projects/:id/files[/...]`, but the actual mount
in `services/api/src/routes.ts` is `app.route("/", editorRoutes)` and
`editorRoutes` itself uses `/projects/:id/files`. So the live endpoints are
`https://zantaz-api.doable.me/projects/:id/files`, not `/editor/...`.

Hitting `/editor/projects/:id/files` returns 404 across the board (this
masked as a fleet-wide failure during a 5-min run).

## Repro
```
curl -i -H "Authorization: Bearer $TOK" https://zantaz-api.doable.me/editor/projects/<pid>/files   # 404
curl -i -H "Authorization: Bearer $TOK" https://zantaz-api.doable.me/projects/<pid>/files          # 200
```

## Fix

Update `TC-EDITOR-FILE-OPS.md` header note to reflect the mount-at-root path.
No server change required — wiring is correct, the corpus instruction string
is wrong.
