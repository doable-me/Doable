# BUG-AI-001 — `chat` mode rejected as invalid enum

**Severity:** medium
**Found:** 2026-05-10 by qa-ai on https://zantaz-api.doable.me
**Test:** TC-AI-CHAT-SEND-003

## Reproduction
```
POST /projects/{id}/chat
{"content":"explain monads","mode":"chat"}
```

## Expected
Per TC-AI-CHAT-SEND-003 / TC-AI-CHAT-MODES, `chat` mode should be a valid mode.

## Actual
HTTP 400, body:
```
{"success":false,"error":{"issues":[{"received":"chat","code":"invalid_enum_value","options":["agent","plan","visual-edit"],...}]}}
```

The Zod schema only accepts `agent | plan | visual-edit`. There is no `chat` mode in the API. Either the spec is wrong or the implementation is missing the mode. UI label vs. backend enum mismatch is likely.
