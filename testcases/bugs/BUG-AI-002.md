# BUG-AI-002 — Whitespace-only chat content accepted; credit deducted

**Severity:** medium
**Found:** 2026-05-10 by qa-ai on https://zantaz-api.doable.me
**Test:** TC-AI-CHAT-SEND-005

## Reproduction
```
POST /projects/{id}/chat
{"content":"   \n\t  "}
```

## Expected
HTTP 400 — content must be non-empty after trim. No DB writes, no credit deduction.

## Actual
HTTP 200 with full SSE stream (scaffolding/dev-server/etc kicked off). The server only validates `min(1)` on raw string length, not trimmed length, so whitespace-only prompts pass validation, run agents, and burn credits.

## Suggested fix
Add `.trim().min(1)` (or refine) to the content schema.
