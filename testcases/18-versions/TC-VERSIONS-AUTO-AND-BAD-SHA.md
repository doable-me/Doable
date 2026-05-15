# TC-VERSIONS-AUTO-AND-BAD-SHA — `versions/auto` literal + invalid SHA must not 500

API endpoints:
- `GET https://${ENV}-api.doable.me/projects/{id}/versions/auto`
- `POST https://${ENV}-api.doable.me/projects/{id}/versions/{badSha}/restore`

Source: `services/api/src/routes/versions.ts`
Related bugs:
- `testcases/bugs/2026-05-14-versions-001.md` (BUG-VER-001)
- `testcases/bugs/2026-05-14-versions-002.md` (BUG-VER-002)
- `testcases/bugs/BUG-CORPUS-VERSIONS-001.md`

Regression guard for two related regressions: the GET handler used to pass
`:versionId` straight to a UUID-typed DB lookup, so probes for the literal
sibling segment `"auto"` crashed postgres with `invalid input syntax for type
uuid`. The restore handler used to surface raw git stderr (`reference is not
a tree: <sha>`) as 500, hiding the fact that the version simply doesn't
exist. After the fix, both must respond with 404 — never 500.

---

## TC-VER-AUTO-001 — GET versions/auto must be 404, never 500

**Severity:** high (server crash on user-probable URL)

**Preconditions:** authenticated user; any valid project UUID.

**Request:**
```bash
curl -sS -H "Authorization: Bearer <tok>" \
  "https://${ENV}-api.doable.me/projects/{id}/versions/auto"
```

## Acceptance

- **Status assertion:** `status === 404` — any 5xx is a hard fail.
- **Negative regex (must NOT match):**
  ```
  invalid input syntax for type uuid|postgres|relation .* does not exist
  ```
- **Positive regex (body envelope):**
  ```
  "error"\s*:\s*"Version not found"
  ```

**Evolution log:**
- 2026-05-15: created to lock in BUG-VER-001 fix.

---

## TC-VER-RESTORE-BAD-SHA-001 — Restore with unknown SHA → 404, never 500

**Severity:** medium

**Preconditions:** authenticated user; any scaffolded project that uses git.

**Request:**
```bash
curl -sS -X POST -H "Authorization: Bearer <tok>" \
  -H "Content-Type: application/json" \
  -d '{"restoredBy":"u"}' \
  "https://${ENV}-api.doable.me/projects/{id}/versions/deadbeef1234567890abcdef1234567890abcdef/restore"
```

## Acceptance

- **Status assertion:** `status === 404`.
- **Negative regex (must NOT match):**
  ```
  reference is not a tree|fatal:|/root/|EACCES|permission denied
  ```

**Evolution log:**
- 2026-05-15: created to lock in BUG-VER-002 fix.

---

## TC-VER-CREATED-BY-FROM-AUTH-001 — `createdBy` derived from auth, body ignored

**Severity:** high (security — privilege-attribution escalation)

**Preconditions:** authenticated user (whose id is `<MY-UID>`); scaffolded project.

**Request:**
```bash
curl -sS -X POST -H "Authorization: Bearer <tok>" \
  -H "Content-Type: application/json" \
  -d '{"createdBy":"some-other-user"}' \
  "https://${ENV}-api.doable.me/projects/{id}/versions"
```

## Acceptance

- **Status assertion:** `status === 201` (no longer 400 / 500).
- **Body assertion:** when the row is fetched back via
  `GET /projects/{id}/versions`, the new entry's `created_by` is the caller's
  user id, NOT the value supplied in the body.

**Evolution log:**
- 2026-05-15: created to lock in BUG-CORPUS-VERSIONS-001 fix and prevent
  re-introduction of body-supplied `createdBy`.
