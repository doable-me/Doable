# BUG-CORPUS-EDT-002 — POST /projects/:id/files accepts traversal in `path` field

**Severity:** high (path-injection / namespace pollution)
**Filed:** 2026-05-10 (env1 / zantaz)
**Status:** FIXED 2026-05-10 (local; not yet deployed)

## Symptom

`POST /projects/:id/files` with body `{"path":"../../escape.txt","content":"pwn"}`
returns 201 and registers the literal key `../../escape.txt` in the in-memory
file store (no sanitization on the input path). Fresh test project on env1.

## Repro
```
curl -sS -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"path":"../../escape.txt","content":"pwn"}' \
  https://zantaz-api.doable.me/projects/<pid>/files
# → 201 {"data":{"path":"../../escape.txt","updatedAt":"..."}}
```

## Why it matters

- The in-memory store is keyed by raw path; this only pollutes that map today.
- BUT the same input flows into `services/api/src/projects/file-manager.ts` and
  AI tool handlers (`ai/tools/create-file.ts`, `edit-file.ts`) that DO write to
  disk. Any path that joins this string into a project root is at risk if any
  callsite forgets to enforce path containment.
- TC-EDITOR-FILES-031 in the corpus documents this as a "file gap"; we now have
  live evidence on env1.

## Fix sketch

Reject any `path` containing `..`, leading `/`, drive letters, or NUL — return
400 with `error:"invalid_path"`. Apply at the route handler in
`services/api/src/routes/editor.ts` POST handler before insert.

## Fix landed (2026-05-10, local only)

Shared helper: `services/api/src/projects/path-safety.ts`
  - `validatePathSafe(path, projectId)` rejects: empty, NUL, absolute (POSIX
    or Windows drive letter / UNC), backslash chars, `..` segments after
    POSIX-normalize, and any resolved path outside `<projectsRoot>/<projectId>`.
  - Also exports `assertPathSafe` + `UnsafePathError` for non-route callers.

Wired in at every user-controlled boundary:
  - `services/api/src/routes/editor.ts` — POST/PUT/GET/DELETE all call
    `validatePathSafe` and return 400 `{error:"invalid_path", message}` on fail.
  - `services/api/src/routes/project-files/file-crud.ts` — GET/PUT/DELETE same.
  - `services/api/src/ai/project-files.ts` — `validatePath` now also calls
    `validatePathSafe` so AI `create_file` / `edit_file` / `delete_file` /
    `read_file` tools (which all flow through `readProjectFile` /
    `writeProjectFile` / `deleteProjectFile`) are protected even if a future
    handler skips the route layer.

Test case: `testcases/04-editor/TC-EDITOR-PATH-TRAVERSAL.md`.

## Evidence

`testcases/evidence/env1/TC-EDITOR-FILES-031r.body`
