# TC-GH-PROJECTS-PREFIX-AND-START — `/projects/:id/github/*` mount + `/auth/github/repo/start`

API endpoints under test:
- `GET https://${ENV}-api.doable.me/auth/github/repo/start`
- `GET https://${ENV}-api.doable.me/projects/{id}/github/status`
- `GET https://${ENV}-api.doable.me/projects/{id}/github/commits`

Source: `services/api/src/routes.ts`,
`services/api/src/routes/auth/oauth.ts`,
`services/api/src/routes/github/project-routes.ts`.

Related bugs:
- `testcases/bugs/2026-05-14-github-001.md` (BUG-GH-001)
- `testcases/bugs/2026-05-14-github-003.md` (BUG-GH-003)

---

## TC-GH-REPO-START-001 — Anonymous `/auth/github/repo/start` → 401, never 500

**Severity:** high

**Request:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://${ENV}-api.doable.me/auth/github/repo/start"
```

## Acceptance
- **Status assertion:** `status === 401`.
- Body envelope: `{"error":"Unauthorized"}`. NEVER 500 with raw `error: undefined` / postgres trace.

---

## TC-GH-REPO-START-002 — Authenticated `/auth/github/repo/start` → 302 to GitHub

**Severity:** high

**Request:**
```bash
curl -sS -I -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  -H "Authorization: Bearer <tok>" \
  "https://${ENV}-api.doable.me/auth/github/repo/start"
```

## Acceptance
- **Status assertion:** `status === 302`.
- **Redirect URL regex:**
  ```
  ^https://github\.com/login/oauth/authorize\?
  ```
- Query string contains `scope=repo` (or `scope=repo+read%3Auser`).

---

## TC-GH-PROJECTS-PREFIX-001 — `/projects/{id}/github/status` returns 200

**Severity:** high (BUG-GH-003 — historically 404)

**Request:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <tok>" \
  "https://${ENV}-api.doable.me/projects/{id}/github/status"
```

## Acceptance
- **Status assertion:** `status === 200`.

---

## TC-GH-PROJECTS-PREFIX-002 — `/projects/{id}/github/commits` returns 200

**Severity:** high

**Request:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <tok>" \
  "https://${ENV}-api.doable.me/projects/{id}/github/commits"
```

## Acceptance
- **Status assertion:** `status === 200`.

---

## TC-GH-PROJECTS-PREFIX-003 — Legacy bare prefix `/{id}/github/*` still works

**Severity:** medium (backwards-compat regression guard)

**Request:**
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <tok>" \
  "https://${ENV}-api.doable.me/{id}/github/status"
```

## Acceptance
- **Status assertion:** `status === 200`.
