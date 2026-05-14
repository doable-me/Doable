# R13 PDF E2E fix — verified live on dev.doable.me

Branch: building locally on `fix/editor-chat-live-streaming-watchdog`
Migration: `077_ai_messages_attachments.sql` — applied directly via psql (the project's `pnpm db:migrate` is broken on a stale migration 014, unrelated).

## Files changed
- `packages/db/migrations/077_ai_messages_attachments.sql` (new) — adds `attachments jsonb DEFAULT '[]'::jsonb` to `ai_messages`
- `services/api/src/routes/chat/message-persistence.ts` — `saveUserMessage` gains an `attachments` param, persists lightweight `{type,name,mimeType?,fileType?,size?}` descriptors (no base64)
- `services/api/src/routes/chat/send-handler.ts` — passes request-body `attachments` through to `saveUserMessage`
- `services/api/src/routes/chat/misc-routes.ts` — `/chat/history` SELECT includes `attachments` column (3 SELECT sites)
- `apps/web/src/app/editor/[projectId]/page.tsx` — `loadFromApi` hydrates `msg.attachments` from server descriptors so chips survive reload

## Probe results (US-007 + US-008)

### POST /chat with PDF containing secret token `PDFE2E_TOKEN_M9X1`
- chatStatus: 200
- pid: `2e89deda-a6fa-49bc-883d-a2e242d82b91`

### GET /chat/history at t=18s
- msgCount: 2
- user row: hasAttachments=**true**, attachmentCount=1, attachmentNames=`["stopwatch-spec.pdf"]`, attachmentTypes=`["application/pdf"]`
- assistant row (mid-stream): thinkingLen ~1082 chars

### Assistant thinking (verbatim, first 600 chars)
> The user wants me to build a stopwatch app named "PDFE2E_TOKEN_M9X1" with millisecond precision and lap functionality. Let me start by checking the current project structure and then build the app.

→ The AI extracted the secret token from the PDF and the "lap" feature (both ONLY in PDF, not in prompt).

### UI verification (full page reload)
- Editor at `/editor/2e89deda-a6fa-49bc-883d-a2e242d82b91`
- Chat panel renders: user message with PDF chip showing **"stopwatch-spec.pdf"** + prompt text
- Preview iframe shows the built app: title "PDFE2E_TOKEN_M9X1", subtitle "Precision Stopwatch", timer 00:00.00 Ready, **Lap** button + **Start** button

## Verdict
R13 acceptance criteria met:
- ✓ Backend column added + migration idempotent
- ✓ `saveUserMessage` persists lightweight attachment descriptors
- ✓ `/chat/history` returns `attachments`
- ✓ Editor `loadFromApi` hydrates chips from server
- ✓ AI consumed PDF content (token + lap feature came from PDF only)
- ✓ Chip survives page reload
- ✓ Live streaming UI (R12 watchdog) still works — chat panel rendered tool actions live

