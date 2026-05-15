# TC-AI-CHAT-MODES-LIST — `GET /chat/modes` returns canonical mode catalog

**Area:** AI Chat
**Endpoint:** `GET /chat/modes`
**Auth:** none (read-only spec endpoint)
**Bug:** BUG-AI-018

## Goal
Verify that the server exposes the canonical list of chat modes so the UI and tester tooling can introspect them instead of hard-coding the enum. The four entries returned MUST match the `mode` z.enum in `services/api/src/routes/chat/send-handler.ts` (`sendMessageSchema`).

## Steps
1. `curl -sS https://<env>-api.doable.me/chat/modes` (no auth header).
2. Read the JSON response.

## Expected
- HTTP `200`.
- Body shape: `{"data":[ {id,label,description,default?}, ... ]}`.
- Exactly 4 entries with these `id`s: `agent`, `plan`, `visual-edit`, `chat`.
- The `agent` entry has `default: true`.
- Each entry has non-empty `label` and `description`.

## Regression
- A new mode added to `sendMessageSchema` MUST also be added here, otherwise this TC fails on count.
- A removed/renamed mode MUST also be removed here.

## Evidence (2026-05-15)
- `testcases/evidence/dev/verify-2026-05-15/ai-chat/chat-modes.json` — passing response from dev.
