# TC-WS-SETTINGS-AI — Workspace settings & AI settings

API:
- PATCH `/workspaces/:id` (admin+) for name, description, avatarUrl
- AI settings live under `/ai-settings/*` (provider, models, copilot connection)

## TC-WS-SET-001 — Update workspace name surfaces in member listing
- **Steps:** PATCH name.
- **Expected:** GET /workspaces shows new name.
- **Severity:** smoke

## TC-WS-SET-002 — Update description visible in workspace detail
- **Severity:** medium

## TC-WS-SET-003 — Update avatarUrl with valid https URL
- **Steps:** PATCH avatarUrl `https://cdn.example/x.png`.
- **Expected:** 200; URL stored.
- **Severity:** medium

## TC-WS-SET-004 — Update avatarUrl with javascript: scheme → 400
- **Steps:** PATCH avatarUrl `javascript:alert(1)`.
- **Expected:** 400 (zod url() rejects).
- **Severity:** smoke

## TC-WS-SET-005 — Update avatarUrl with data: scheme
- **Steps:** PATCH `data:image/png;base64,xxx`.
- **Expected:** zod url() likely accepts (URL constructor parses); but should ideally reject. Document.
- **Severity:** high

## TC-WS-SET-006 — Update avatarUrl with http:// (insecure)
- **Steps:** PATCH `http://example/x.png`.
- **Expected:** Accepted; document if mixed-content would be a concern in UI.
- **Severity:** low

## TC-WS-SET-007 — Update workspace name with HTML tags
- **Steps:** PATCH name `<script>x</script>Workspace`.
- **Expected:** 200; stored as raw HTML (zod doesn't sanitize). Frontend must escape on render — see TC-SEC-XSS.
- **Severity:** high

## TC-WS-SET-008 — Update workspace description with markdown
- **Steps:** PATCH description containing `**bold** [link](javascript:alert(1))`.
- **Expected:** 200; render in UI must escape javascript: links.
- **Severity:** high

## TC-WS-SET-009 — Update workspace name length 0 → 400
- **Severity:** medium

## TC-WS-SET-010 — Update workspace via member → 403
- **Severity:** smoke

## TC-WS-SET-011 — Workspace settings show plan correctly
- **Severity:** smoke

## TC-WS-SET-012 — Workspace settings show member list with roles
- **Severity:** smoke

## TC-WS-SET-013 — AI settings: GET workspace AI provider
- **Steps:** GET /ai-settings (logged in member of ws).
- **Expected:** 200 with current provider/model.
- **Severity:** smoke

## TC-WS-SET-014 — AI settings: change model (admin+)
- **Steps:** POST/PATCH /ai-settings as admin.
- **Expected:** 200; persisted.
- **Severity:** smoke

## TC-WS-SET-015 — AI settings: change model from member → 403
- **Severity:** smoke

## TC-WS-SET-016 — AI settings: invalid model name → 400
- **Severity:** medium

## TC-WS-SET-017 — AI settings: model not in AI_SUPPORTED_MODELS rejected
- **Steps:** Set model `gpt-3.5-foo`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-SET-018 — AI settings: connect Copilot via OAuth flow
- **Steps:** /auth/github/copilot from /ai-settings.
- **Expected:** Redirects, callback stores token in workspace AI config.
- **Severity:** smoke

## TC-WS-SET-019 — AI settings: token storage encrypted at rest
- **Steps:** Inspect DB column.
- **Expected:** Encrypted or hashed; not plaintext token.
- **Severity:** high

## TC-WS-SET-020 — AI settings: switching provider clears stale credentials
- **Severity:** medium

## TC-WS-SET-021 — AI settings: bring-your-own-key (BYOK) accepted (provider bridge PRD)
- **Severity:** medium

## TC-WS-SET-022 — AI settings: BYOK invalid key fails fast
- **Steps:** Save bogus key, attempt AI chat.
- **Expected:** Clean error surface, no leakage of key.
- **Severity:** medium

## TC-WS-SET-023 — AI settings keys never surfaced in /workspaces list response
- **Severity:** smoke

## TC-WS-SET-024 — AI settings keys never logged in xray spans
- **Severity:** high

## TC-WS-SET-025 — Workspace AI defaults applied when ws.plan=free
- **Pre:** Auto-applied via `applyPlatformAiDefault` on signup.
- **Steps:** Inspect.
- **Expected:** Default model assigned.
- **Severity:** smoke

## TC-WS-SET-026 — Workspace AI defaults change after plan upgrade
- **Severity:** medium

## TC-WS-SET-027 — Workspace settings show 2-factor / SSO toggles (if implemented)
- **Note:** Document availability.
- **Severity:** low

## TC-WS-SET-028 — Workspace name update bumps `updated_at`
- **Severity:** low

## TC-WS-SET-029 — Workspace slug update endpoint not exposed
- **Steps:** PATCH `{slug:"new"}`.
- **Expected:** Slug unchanged (zod schema strips). File enhancement if slug-rename desired.
- **Severity:** medium

## TC-WS-SET-030 — Workspace deletion archives projects (if implemented) or hard-deletes
- **Severity:** medium
