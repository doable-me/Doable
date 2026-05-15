# R13 PDF Attachment E2E Verification Report

**Date**: 2026-05-15  
**Agent**: R13 QA Tester  
**Target**: https://dev-api.doable.me (HEAD ~96e0aa13, includes PR #19 fix + PR #35 + PR #39)  
**Bug**: BUG-R11-PDF-ATTACHMENT-IGNORED-001  
**Verdict**: ZAPPED

---

## Environment

- Session: PowerShell direct (PSMUX nesting prevented tmux; ran inline)
- API: https://dev-api.doable.me
- Test PDF: C:\Users\gj\Downloads\srs_example_2010_group2.pdf (2,370,740 bytes, 2.26 MB)
- Auth: owner-pro@doable.me (Pro plan, 168/200 daily credits at test time)
- Run 2 project ID: ff206268-2992-43aa-a6c8-bcd7bf7b38f3 (R13-Run2-PDF-095928)

---

## Test Cases

### TC1: Fix-logic verification (30 assertions)

- **Command**: `pnpm exec tsx scripts/r11-test-pdf-attachment-fix.ts`
- **Expected**: 30/30 pass
- **Actual**: 30/30 pass — all six sub-tests passed (processAttachments with docs, without docs, multi-doc, static PDF fallback check, setSessionId guard, persistSessionToDb + workspace_id)
- **Status**: PASS

### TC2: E2E PDF chat — HTTP 200 and SSE stream completes

- **Command**: `pnpm exec tsx scripts/r13-e2e-run2.ts` (resilient wrapper around r11-pdf-attach-test logic)
- **Expected**: POST /projects/:id/chat returns 200, SSE [DONE] received
- **Actual**: HTTP 200 after 1801ms. [DONE] sentinel received at +34,951ms. Stream ended cleanly (done=true).
- **Status**: PASS

### TC3: prompt_tokens > 50,000

- **Expected**: > 50,000 (confirms PDF text was inlined into the LLM prompt)
- **Actual**: **57,979** prompt tokens
- **Status**: PASS

### TC4: completion_tokens > 0 and tool calls made

- **Expected**: completion_tokens > 0, tool_call_count >= 1
- **Actual**: completion_tokens = **1,324**, tool_call_count = **1** (create_file for src/App.tsx)
- **Status**: PASS

### TC5: App.tsx contains SRS-derived content (not default splash)

- **Expected**: App.tsx references system name from PDF cover, features from §2-§3, data entity from §4
- **Actual**: App.tsx (3,731 chars) contains:
  - Title: `"Amazing Lunch Indicator"` — exact system name from SRS cover
  - Subtitle: `"GPS-based Restaurant Discovery Application"` — from SRS §1
  - Features array sourced verbatim from `"Section 2.2 — Product Functions"`:
    - "Search for restaurants by price, destination, restaurant type, and specific dish"
    - "Multi-language support: Swedish, English, Spanish, and French"
    - 7 other SRS features
  - Data entity: `restaurantEntity` with fields `restaurant_name`, `address`, `phone_number`, `email_address`, `type_of_food`, `average_price`, `menu` — all from SRS §3-§4
  - `app_is_splash: false` — confirmed NOT the "Dream it. Build it." default
  - SRS terms found: `["Restaurant", "Lunch", "Indicator"]`
- **Status**: PASS

### TC6: Chat history non-empty

- **Expected**: GET /projects/:id/chat/history returns >= 2 messages (user + assistant)
- **Actual**: 2 messages returned (user message with PDF attachment metadata + assistant message)
- **Status**: PASS

### TC7: Version committed

- **Expected**: AI-generated version sha present
- **Actual**: version_created event with sha `74e50e3d597215a28ae4dbcb60f42b3936779d17` received at +37,008ms
- **Status**: PASS

---

## 5 Key Metrics (Run 2 — ff206268)

| Metric | Value | Threshold | Pass? |
|--------|-------|-----------|-------|
| prompt_tokens | 57,979 | > 50,000 | YES |
| completion_tokens | 1,324 | > 0 | YES |
| response_chars (App.tsx) | 3,731 | > 100 | YES |
| tool_call_count | 1 | >= 1 | YES |
| App.tsx contains SRS content | YES (Amazing Lunch Indicator, 9 features verbatim, Restaurant entity) | SRS content present | YES |
| history non-empty | 2 messages | >= 1 | YES |
| done_received | true | true | YES |

---

## Classification: ZAPPED

All four ZAPPED criteria met:
- prompt_tokens > 50k: 57,979 — CONFIRMED
- response_chars > 100: 3,731 — CONFIRMED
- App.tsx contains SRS content: Amazing Lunch Indicator, verbatim features from §2.2, Restaurant entity with SRS field names — CONFIRMED
- history non-empty: 2 messages — CONFIRMED

---

## Run 1 Note (R13 attempt 1 — b78fdd64)

The first R13 attempt used the existing `r11-pdf-attach-test.ts` script which crashed with `TypeError: terminated / UND_ERR_SOCKET` at +30s when the server-side SSE connection closed. The AI DID generate a rich app (62,536-char App.tsx with Restaurant system, multi-language support, SearchCriteria types) for that project as well, but the script crashed before writing the summary/events files or fetching token metrics. This is a client-side connection handling issue in the test script, not a server bug.

---

## Previous State (R12 — pre-fix verification gap)

R12 confirmed fix-logic (30/30) but timed out before E2E completion. The historical 00-summary.json from 2026-05-13 showed `augmented_prompt_length: 0`, `pdf_text_detected_in_prompt: false`, App.tsx = default splash — those are from a pre-fix run. R13 Run 2 conclusively shows the fix works end-to-end.

---

## Evidence Files

- `testcases/evidence/dev/ai-pdf-r11/r13-run2/00-summary.json` — full metrics
- `testcases/evidence/dev/ai-pdf-r11/r13-run2/03-sse-events.json` — 61 SSE events
- `testcases/evidence/dev/ai-pdf-r11/r13-run2/04-chat-history.json` — 2 messages
- `testcases/evidence/dev/ai-pdf-r11/r13-run2/06-src_App.tsx` — generated SRS app
- `testcases/evidence/dev/r13-pdf-e2e-verify.md` — this report

---

## Cleanup

- No tmux sessions created (PSMUX nesting prevented tmux; PowerShell direct used)
- Test scripts: `scripts/r13-e2e-run2.ts` (temporary probe, can be deleted)
- No artifacts requiring removal
