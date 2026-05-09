# TC-API-TEAM-CHAT — /team-chat HTTP coverage

Mounted at `/team-chat` (`services/api/src/routes.ts:111`). Source: `services/api/src/routes/team-chat.ts`.

Endpoints (verified in source):
- `GET    /team-chat/:projectId/internal`        — internal (X-Internal-Secret)
- `POST   /team-chat/:projectId/internal`        — internal persist
- `GET    /team-chat/:projectId`                 — auth required
- `POST   /team-chat/:projectId`                 — save + WS broadcast

---

## TC-API-TC-001 — GET /team-chat/:projectId 200
- **Pre:** Auth, project exists.
- **Steps:** GET.
- **Expected:** 200 `{data:[messages]}` ordered.
- **Severity:** smoke

## TC-API-TC-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-TC-003 — GET project not found → 404
- **Expected:** 404 `{error:"Project not found"}`.
- **Severity:** smoke

## TC-API-TC-004 — GET ?limit=10 200
- **Expected:** 200 with up to 10 messages.
- **Severity:** smoke

## TC-API-TC-005 — GET ?limit=invalid → handled (parseInt → NaN)
- **Steps:** ?limit=foo.
- **Expected:** Falls back to default 50 (parseInt returns NaN, JS default).
- **Severity:** medium

## TC-API-TC-006 — GET ?limit=-5 → 0 or default
- **Expected:** Document.
- **Severity:** medium

## TC-API-TC-007 — GET ?limit=10000 capped
- **Expected:** Capped server-side.
- **Severity:** medium

## TC-API-TC-008 — Path SQL injection on :projectId
- **Expected:** 400.
- **Severity:** smoke

## TC-API-TC-009 — POST /:projectId 200
- **Steps:** POST `{content:"hello"}`.
- **Expected:** 200 `{data:{message}}`; broadcast to WS.
- **Severity:** smoke

## TC-API-TC-010 — POST 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-TC-011 — POST project not found → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-TC-012 — POST empty content → 400/422
- **Steps:** content "".
- **Expected:** 400 (depends on validation; record actual).
- **Severity:** high

## TC-API-TC-013 — POST very long content (10 KB) 200
- **Expected:** 200; persisted.
- **Severity:** medium

## TC-API-TC-014 — POST content 1 MB → 400/413
- **Expected:** 400/413 size cap.
- **Severity:** high

## TC-API-TC-015 — POST with displayName containing HTML stripped
- **Steps:** displayName `<script>alert(1)</script>QA`.
- **Expected:** 200; saved displayName has tags removed (per source: `replace(/<[^>]*>/g, "")`).
- **Severity:** smoke

## TC-API-TC-016 — POST with empty displayName after strip → null
- **Steps:** displayName `<b></b>`.
- **Expected:** displayName saved as null.
- **Severity:** medium

## TC-API-TC-017 — POST with messageType:"system" 200
- **Expected:** 200; type stored.
- **Severity:** medium

## TC-API-TC-018 — POST with messageType invalid enum → 400
- **Steps:** messageType:"god".
- **Expected:** 400.
- **Severity:** high

## TC-API-TC-019 — POST with mentions array 200
- **Steps:** mentions: `["user-uuid"]`.
- **Expected:** 200; mentions stored; mentioned users notified via WS.
- **Severity:** high

## TC-API-TC-020 — POST mentions with non-UUID → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-TC-021 — POST mentions with 100+ entries → 400
- **Expected:** 400 max length.
- **Severity:** medium

## TC-API-TC-022 — POST with parentId (reply) 200
- **Pre:** parent message exists.
- **Steps:** parentId: `<existing-msg-id>`.
- **Expected:** 200; reply linked.
- **Severity:** medium

## TC-API-TC-023 — POST with parentId from another project → 400/404
- **Expected:** 400/404.
- **Severity:** high

## TC-API-TC-024 — POST malformed JSON → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-TC-025 — POST extra field ignored
- **Expected:** 200; ignored.
- **Severity:** low

## TC-API-TC-026 — POST broadcasts to /internal/broadcast WS
- **Steps:** POST and verify WS bridge call to `${WS_INTERNAL_URL}/internal/broadcast` with `X-Internal-Secret`.
- **Expected:** WS receives `chat:message` event.
- **Severity:** smoke

## TC-API-TC-027 — POST when WS server down → 200 still saved
- **Pre:** Stop WS service.
- **Expected:** Message saved; broadcast errors logged but request succeeds.
- **Severity:** high

## TC-API-TC-028 — Internal GET correct secret 200
- **Steps:** GET /:projectId/internal with `X-Internal-Secret`.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-TC-029 — Internal GET wrong secret → 403
- **Expected:** 403 `{error:"Forbidden"}`.
- **Severity:** smoke

## TC-API-TC-030 — Internal GET no secret → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-TC-031 — Internal POST persists 200
- **Expected:** 200 with saved message.
- **Severity:** smoke

## TC-API-TC-032 — Internal POST mass-assign userId allowed (trusted)
- **Steps:** POST with arbitrary userId.
- **Expected:** 200; userId saved as-is (internal endpoint trusts WS).
- **Severity:** high

## TC-API-TC-033 — Internal POST when secret leaks (rotation needed)
- **Steps:** POST with stale secret.
- **Expected:** 403; verify rotation flow exists.
- **Severity:** smoke

## TC-API-TC-034 — Internal POST sanitizes displayName too
- **Steps:** displayName with HTML.
- **Expected:** 200; tags stripped (per source).
- **Severity:** medium

## TC-API-TC-035 — Internal endpoint not exposed via Cloudflare tunnel
- **Steps:** Try calling `/team-chat/<id>/internal` from public.
- **Expected:** Should be reachable but auth via secret only; document allowlist.
- **Severity:** smoke

## TC-API-TC-036 — Wrong method PATCH on /:projectId → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-TC-037 — Wrong content-type form → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-TC-038 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-TC-039 — Header CRLF on X-Internal-Secret
- **Expected:** 400/sanitized.
- **Severity:** medium

## TC-API-TC-040 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-TC-041 — Idempotency-Key on POST → single message
- **Expected:** Single row.
- **Severity:** medium

## TC-API-TC-042 — Pagination by limit only — no cursor support yet
- **Expected:** 200; oldest pages may be inaccessible if >limit. Document.
- **Severity:** medium

## TC-API-TC-043 — DB unavailable during POST → 500 JSON
- **Expected:** 500.
- **Severity:** medium

## TC-API-TC-044 — Edit own message — endpoint exists?
- **Steps:** Try PUT /:projectId/messages/:mid.
- **Expected:** 404 if not implemented; if implemented, 200 with content updated.
- **Severity:** medium

## TC-API-TC-045 — Delete own message — endpoint exists?
- **Steps:** DELETE /:projectId/messages/:mid.
- **Expected:** 404 if missing; record actual API surface.
- **Severity:** medium
