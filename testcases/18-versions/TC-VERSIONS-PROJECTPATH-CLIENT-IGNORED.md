# TC-VERSIONS-PROJECTPATH-CLIENT-IGNORED — Server must derive projectPath; client value must be ignored/sanitised

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/versions`
Source: `services/api/src/routes/versions/` (handler near `scandir`/`readdir` calls)
Related bug: `testcases/bugs/BUG-R11-VERSIONS-EACCES-500-001.md`
Fix branch: `fix/r11-versions-projectpath-server-derived`

Verifies that the versions create handler never uses a client-supplied `projectPath` to scan the
filesystem, that path-traversal strings are rejected or silently replaced with the server-derived
path, and that internal filesystem paths are never echoed in error responses.

Motivated by BUG-R11-VERSIONS-EACCES-500-001 where `POST /versions` with `projectPath: "/"`
caused the handler to `scandir('/boot/lost+found')` and return HTTP 500 with the raw OS path.

---

## TC-VER-PATH-001 — Smoke: client projectPath "/" → never 500, never leaks OS path

**Severity:** smoke (gates the suite — a 500 here is a security+reliability regression)

**Preconditions:** authenticated platform admin; any existing project ID.

**Request:**
```bash
curl -X POST https://${ENV}-api.doable.me/projects/{id}/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"u","projectPath":"/"}'
```

**Steps:**
1. Send the request above.
2. Inspect HTTP status code and response body.

## Acceptance

- **Literal (display in report):** HTTP 201 (version created with server-derived path) or HTTP 400 (project not scaffolded); NEVER HTTP 500. Response body must not contain OS filesystem paths.
- **Status assertion:** `status === 201 || status === 400` — any 5xx is a hard fail.
- **Negative regex (applied to response body — must NOT match):**
  ```
  /boot|/etc|/var/lib|/home|/root|lost\+found|EACCES|scandir|readdir
  ```
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created after BUG-R11-VERSIONS-EACCES-500-001 confirmed `/boot/lost+found` in error body.

---

## TC-VER-PATH-002 — High: path traversal string "../../etc/passwd" → silently sandboxed

**Severity:** high

**Preconditions:** same as TC-VER-PATH-001.

**Request:**
```json
POST /projects/{id}/versions
{ "createdBy": "u", "projectPath": "../../etc/passwd" }
```

**Steps:**
1. POST the traversal string.
2. Assert status and response body.
3. If 201, verify the created version's stored path is within the project sandbox (does NOT start with `/etc`, `/root`, etc.).

## Acceptance

- **Literal (display in report):** 201 with a server-derived, sandbox-scoped path — the traversal string is neither honoured nor echoed. OR 400 if the API rejects client-supplied paths entirely.
- **Status assertion:** `status === 201 || status === 400`; never 500.
- **Negative regex (applied to entire response body):**
  ```
  \.\./|etc/passwd|/root|/boot|/home|/var/lib|EACCES
  ```
- **If 201 — path field assertion:** `response.projectPath` (or equivalent) must match:
  ```
  (?i)projects?[/\\][0-9a-f\-]{36}
  ```
  (i.e. confined to the project's UUID-keyed sandbox directory).
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created to explicitly cover the traversal vector that the EACCES bug opened.

---

## TC-VER-PATH-003 — High: no projectPath in body → server derives path (201)

**Severity:** high

**Preconditions:** project that has been scaffolded (file tree exists on server).

**Request:**
```json
POST /projects/{id}/versions
{ "createdBy": "u" }
```

**Steps:**
1. POST with no `projectPath` key at all.
2. Assert HTTP 201.
3. Assert response body contains the created version (sha or id present).

## Acceptance

- **Literal (display in report):** 201; response contains a version object with a non-empty `sha` or `id`; no filesystem path leak.
- **Status assertion:** `status === 201`.
- **Regex (applied to response body — version object must contain either field):**
  ```
  "sha"\s*:\s*"[0-9a-f]{7,40}"|"id"\s*:\s*"[0-9a-f\-]{36}"
  ```
- **Negative regex:**
  ```
  /boot|/etc|/var|EACCES|scandir
  ```
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created to confirm the happy path works without client sending `projectPath` at all, which is the intended contract after the fix.

---

## TC-VER-PATH-004 — Smoke: 5xx envelope sanitisation — no OS paths in any error body

**Severity:** smoke (security regression guard)

**Preconditions:** authenticated; use an invalid project ID format to provoke a handler-level error.

**Requests (run both):**

Variant A — malformed UUID:
```bash
curl -X POST https://${ENV}-api.doable.me/projects/NOT-A-UUID/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"u"}'
```

Variant B — non-existent but well-formed UUID:
```bash
curl -X POST https://${ENV}-api.doable.me/projects/00000000-0000-0000-0000-000000000000/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"u","projectPath":"/"}'
```

**Steps:**
1. Send both variants.
2. For variant A: expect 400 (validation) or 404 — never 500.
3. For variant B: expect 404 — never 500.
4. In any case where a 5xx does occur (regression scenario), assert the body is sanitised.

## Acceptance

- **Literal (display in report):** Variant A → 400 or 404; Variant B → 404. If any 5xx surfaces the body must be a sanitised envelope — no raw OS paths, no `EACCES`, no `/boot`.
- **Status assertions:**
  - Variant A: `status < 500`
  - Variant B: `status === 404`
- **Negative regex (applied to ALL response bodies regardless of status):**
  ```
  /boot|/etc|/var/lib|/home|/root|lost\+found|EACCES|permission denied|scandir|readdirSync
  ```
- **Sanitised envelope regex (if 5xx occurs — body must match this instead):**
  ```
  (?i)"error"\s*:\s*"[^"]{3,100}"|"message"\s*:\s*"[^"]{3,100}"
  ```
  and must NOT contain a filesystem path fragment.
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created as a regression guard so that future handler changes cannot re-introduce raw OS-path leakage in error envelopes, as was observed in BUG-R11-VERSIONS-EACCES-500-001.

---

## Runner invocation

```bash
ENV_NAME=dev API_BASE_URL=https://dev-api.doable.me \
  PROJECT_ID=<project-id> TEST_NAME=versions-projectpath \
  bash testcases/evidence/run-granular-turn.sh
```

Evidence dir: `testcases/evidence/${ENV}/versions-projectpath/`
Run log: `testcases/99-runlog/${ENV}/versions-projectpath.md`
