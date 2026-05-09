# TC-API-CHAT — /chat (Copilot) route group

Mounted at `/` (`services/api/src/routes.ts:72`). Source: `services/api/src/routes/chat/index.ts` and siblings.

Endpoints (typical):
- `GET    /chat/:projectId/sessions`
- `POST   /chat/:projectId/sessions`
- `GET    /chat/:projectId/sessions/:sid`
- `DELETE /chat/:projectId/sessions/:sid`
- `POST   /chat/:projectId/messages`           — send message (SSE)
- `GET    /chat/:projectId/messages`
- `POST   /chat/:projectId/messages/:mid/stop` — abort streaming
- `GET    /chat/:projectId/stream`             — SSE
- `POST   /chat/:projectId/regenerate`
- `POST   /chat/:projectId/feedback`
- `GET    /chat/:projectId/skills/active`

---

## TC-API-CHAT-001 — POST /chat/:projectId/messages 200 SSE
- **Steps:** Auth, send `{role:"user", content:"hello"}`.
- **Expected:** 200; `Content-Type: text/event-stream`; SSE frames `event: token` then `event: done`.
- **Severity:** smoke

## TC-API-CHAT-002 — POST messages 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CHAT-003 — POST messages other user's project → 403/404
- **Expected:** 403/404.
- **Severity:** smoke

## TC-API-CHAT-004 — POST messages empty content → 400
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-CHAT-005 — POST messages 1MB content → 400/413
- **Expected:** 400 max length or 413.
- **Severity:** high

## TC-API-CHAT-006 — POST messages role missing → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-CHAT-007 — POST messages role invalid enum → 400
- **Steps:** role:"system_root".
- **Expected:** 400.
- **Severity:** high

## TC-API-CHAT-008 — POST messages provider not configured → 400
- **Pre:** Workspace has no AI provider configured.
- **Steps:** POST.
- **Expected:** 400 `{error:"No AI provider configured"}`.
- **Severity:** high

## TC-API-CHAT-009 — POST messages provider key invalid → 502/400
- **Pre:** Provider has bad key.
- **Steps:** POST.
- **Expected:** 400 or 502 from upstream provider error.
- **Severity:** high

## TC-API-CHAT-010 — POST messages credit exhausted → 402/422
- **Pre:** No credits left.
- **Steps:** POST.
- **Expected:** 402 Payment Required or 422 `{error:"Out of credits"}`.
- **Severity:** smoke

## TC-API-CHAT-011 — POST messages emits build event when tool runs
- **Pre:** Skill auto-invoke triggers code edit.
- **Expected:** Build-stream SSE shows `event: file_changed` plus token stream.
- **Severity:** medium

## TC-API-CHAT-012 — POST regenerate 200
- **Pre:** Existing message.
- **Steps:** POST /regenerate `{messageId}`.
- **Expected:** 200 SSE replay.
- **Severity:** medium

## TC-API-CHAT-013 — POST regenerate non-existent message → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-CHAT-014 — POST /messages/:mid/stop 200
- **Pre:** Stream in flight.
- **Steps:** Stop.
- **Expected:** 200; original SSE closes with `event: aborted`.
- **Severity:** high

## TC-API-CHAT-015 — POST stop after stream ended → 404/409
- **Expected:** 404 or 409.
- **Severity:** medium

## TC-API-CHAT-016 — GET /sessions 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-CHAT-017 — GET /sessions paginated
- **Expected:** 200 with cursor.
- **Severity:** medium

## TC-API-CHAT-018 — POST /sessions create 201
- **Expected:** 201.
- **Severity:** medium

## TC-API-CHAT-019 — DELETE /sessions/:sid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-CHAT-020 — DELETE /sessions/:sid wrong project → 404
- **Steps:** sid from another project.
- **Expected:** 404.
- **Severity:** high

## TC-API-CHAT-021 — GET /messages 200
- **Expected:** 200 list ordered by createdAt.
- **Severity:** smoke

## TC-API-CHAT-022 — GET /messages?since=ISO returns delta
- **Expected:** 200 newer messages.
- **Severity:** medium

## TC-API-CHAT-023 — GET /messages?cursor=invalid → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-CHAT-024 — Mention/Skill `/skill-name` slash trigger
- **Steps:** content `"/skill-name do thing"`.
- **Expected:** 200; skill invoked, evidence in context.
- **Severity:** high

## TC-API-CHAT-025 — Mention non-existent skill → 200 plain message
- **Expected:** 200 message stored as plain text; no skill triggered.
- **Severity:** medium

## TC-API-CHAT-026 — Attach context_skill_files in payload
- **Steps:** POST with `{contextSkillFileIds:[...]}`.
- **Expected:** 200; skill files included in prompt.
- **Severity:** medium

## TC-API-CHAT-027 — POST messages with `attachments` array
- **Steps:** include image base64 attachment.
- **Expected:** 200; multimodal support if provider permits.
- **Severity:** medium

## TC-API-CHAT-028 — POST messages with malformed JSON → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-CHAT-029 — POST messages with extra unknown field
- **Expected:** 200; field ignored.
- **Severity:** low

## TC-API-CHAT-030 — Slow client / chunked encoding upload
- **Steps:** Trickle JSON body.
- **Expected:** 408 timeout or successful 200 if within limit.
- **Severity:** medium

## TC-API-CHAT-031 — Provider switch mid-conversation
- **Steps:** Switch workspace provider, then continue chat.
- **Expected:** 200; new messages use new provider.
- **Severity:** high

## TC-API-CHAT-032 — Per-user override provider applies
- **Pre:** User-level BYOK set.
- **Steps:** Send chat.
- **Expected:** Uses user's override.
- **Severity:** high

## TC-API-CHAT-033 — POST feedback {messageId, rating:"up"} 200
- **Expected:** 200.
- **Severity:** low

## TC-API-CHAT-034 — POST feedback invalid rating → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-CHAT-035 — GET /skills/active 200
- **Expected:** 200 list of skills auto-attached to project.
- **Severity:** medium

## TC-API-CHAT-036 — GET /skills/active includes parent rules
- **Expected:** workspace + project + user skills merged.
- **Severity:** medium

## TC-API-CHAT-037 — SSE keep-alive pings every 15s
- **Steps:** Keep stream open.
- **Expected:** `: ping` comments at intervals.
- **Severity:** medium

## TC-API-CHAT-038 — SSE survives client reconnect
- **Steps:** Disconnect during stream, reconnect with `Last-Event-Id`.
- **Expected:** Resumes from id+1.
- **Severity:** medium

## TC-API-CHAT-039 — Concurrent streams per project (concurrency cap)
- **Steps:** Two parallel `/messages` POSTs in same project.
- **Expected:** Both 200 if isolated CLIs; or 409/queued. Document.
- **Severity:** high

## TC-API-CHAT-040 — Stop abort via WS broadcast
- **Steps:** Stop via API; verify WS clients receive `chat:aborted`.
- **Expected:** Both API + WS see abort.
- **Severity:** medium

## TC-API-CHAT-041 — Path SQL injection on :projectId
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CHAT-042 — :sid extra suffix
- **Expected:** 404.
- **Severity:** low

## TC-API-CHAT-043 — Wrong content-type form-encoded → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-CHAT-044 — Wrong method PUT /messages → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-CHAT-045 — Header X-Skill-Override CRLF injection
- **Expected:** 400 or sanitized.
- **Severity:** medium

## TC-API-CHAT-046 — CORS preflight allow staging.doable.me
- **Expected:** 204.
- **Severity:** smoke

## TC-API-CHAT-047 — CORS from disallowed origin
- **Expected:** No allow header.
- **Severity:** smoke

## TC-API-CHAT-048 — Server error returns SSE `event: error`
- **Pre:** Force provider 500.
- **Expected:** SSE emits error event then closes.
- **Severity:** high

## TC-API-CHAT-049 — Body 1MB cap
- **Expected:** 413.
- **Severity:** high

## TC-API-CHAT-050 — Pagination of /messages cursor beyond end
- **Expected:** 200 empty.
- **Severity:** medium

## TC-API-CHAT-051 — Filter combination matrix on /messages (role, since, sessionId)
- **Steps:** 3×3 combos.
- **Expected:** Correct subset.
- **Severity:** medium

## TC-API-CHAT-052 — Idempotency-Key on POST /messages
- **Expected:** Single message created.
- **Severity:** medium

## TC-API-CHAT-053 — Auto-tracing X-Trace-Id
- **Steps:** Send custom `X-Trace-Id`.
- **Expected:** Echoed in response and trace.
- **Severity:** medium

## TC-API-CHAT-054 — DB unavailable mid-stream
- **Pre:** Stop DB after first token.
- **Expected:** SSE `event: error` then close; no half-written assistant message.
- **Severity:** high
