# TC-AI-CHAT-PDF-SRS-FULL — Real SRS PDF attachment → AI-generated app (integration smoke + edge cases)

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`, `services/api/src/ai/attachments.ts`
Runner: `testcases/evidence/run-granular-turn.sh`
Related bug: `testcases/bugs/BUG-R11-PDF-ATTACHMENT-IGNORED-001.md`
Evolved from: `testcases/05-ai-chat/TC-AI-CHAT-PDF.md` (jsPDF multi-turn)

Verifies that the pdf-parse extraction pipeline (commit 8f20970) is not just tokenising the PDF
but actually having the AI *use* the PDF content to generate a domain-specific app rather than
the default Doable "Dream it. Build it." splash. Also covers corrupted-PDF and empty-prompt
edge cases that were missed in R10.

---

## TC-AI-CHAT-PDF-SRS-001 — Smoke: SRS PDF → system-name H1

**Severity:** smoke (gates the suite — if this fails, SRS content is not reaching the model)

**Preconditions:**
1. Authenticated as platform admin.
2. Fresh vite-react project created via `POST /projects`.
3. `srs_example_2010_group2.pdf` available (≈3 MB, §2/§3 carry feature list, §4 carries entities).

**Request:**
```json
POST /projects/{id}/chat
{
  "content": "Read the attached SRS PDF carefully. Identify the system name from the cover page or introduction. Build a single-page React app whose <h1> is that exact system name and whose first card lists at least three features taken from section 2 or section 3 of the document.",
  "mode": "agent",
  "attachments": [{
    "type": "application/pdf",
    "data": "<base64 of srs_example_2010_group2.pdf>",
    "name": "srs_example_2010_group2.pdf"
  }]
}
```

**Steps:**
1. POST the request above; stream SSE to `[DONE]`.
2. Read `src/App.tsx` from the generated project.
3. Assert acceptance conditions below.

## Acceptance

- **Literal (display in report):** `src/App.tsx` h1 contains a domain-specific system name (e.g. "Library Management System") and a feature list — NOT the default Doable splash text.
- **Regex (used by runner — applied to generated `src/App.tsx`):**
  ```
  (?i)(library|hostel|hotel|inventory|booking|registration|course|student|attend|grade|enrollment|management\s+system)
  ```
- **Negative regex (must NOT match — fail if present):**
  ```
  Dream it\. Build it\.|Doable splash|Your app starts here
  ```
- **DOM target (preview iframe):** first `<h1>` `textContent` must match the system-name regex above.
- **Extra assertion:** `prompt_tokens` in the trace for this chat turn MUST be ≥ 10 000 (confirms PDF text was inlined, not ignored).

**Evolution log:**
- 2026-05-14 (R11): created. Motivated by BUG-R11-PDF-ATTACHMENT-IGNORED-001 where 128 595 prompt tokens were consumed but `App.tsx` still showed the Doable splash.

---

## TC-AI-CHAT-PDF-SRS-002 — High: SRS PDF → TypeScript entity interfaces

**Severity:** high

**Preconditions:** same project as TC-AI-CHAT-PDF-SRS-001 (or a fresh one).

**Request:**
```json
POST /projects/{id}/chat
{
  "content": "Using the attached SRS PDF, identify at least 5 entities described in the document (e.g. users, books, rooms, courses). For each entity write a TypeScript interface in src/types/entities.ts. Each interface must have at least 2 typed fields.",
  "mode": "agent",
  "attachments": [{
    "type": "application/pdf",
    "data": "<base64 of srs_example_2010_group2.pdf>",
    "name": "srs_example_2010_group2.pdf"
  }]
}
```

**Steps:**
1. POST the request; stream SSE to `[DONE]`.
2. Check that `src/types/entities.ts` exists in the project tree.
3. Read `src/types/entities.ts` and assert acceptance conditions.

## Acceptance

- **Literal (display in report):** `src/types/entities.ts` contains ≥ 3 `interface` declarations, each with at least one common SRS field name.
- **Regex (file must match ALL three):**
  1. File exists: `src/types/entities\.ts` present in `GET /projects/{id}/files` listing.
  2. Interface count: count of `/^interface\s+\w+/m` matches ≥ 3 (runner counts occurrences).
  3. Field names: `(?i)(id|name|email|date|status|priority|description|title|type|role|password|phone|address)`
- **DOM target:** n/a (source-file assertion only).

**Evolution log:**
- 2026-05-14 (R11): created to stress-test entity extraction from a real SRS document after R10 PDF-parse fix.

---

## TC-AI-CHAT-PDF-SRS-003 — Medium: Corrupted (truncated) PDF → graceful error message

**Severity:** medium

**Preconditions:** fresh project; prepare a corrupted PDF by truncating `srs_example_2010_group2.pdf` to the first 1 024 bytes.

**Request:**
```json
POST /projects/{id}/chat
{
  "content": "Read the attached PDF and build an app from it.",
  "mode": "agent",
  "attachments": [{
    "type": "application/pdf",
    "data": "<base64 of truncated 1 KB stub>",
    "name": "corrupted.pdf"
  }]
}
```

**Steps:**
1. POST the request; stream SSE to `[DONE]` or first error event.
2. Read the assistant message from the SSE stream or from `GET /projects/{id}/chat/history`.
3. Assert acceptance conditions.

## Acceptance

- **Literal (display in report):** API returns HTTP 200; assistant reply acknowledges the file could not be read (e.g. "I was unable to read the PDF" or "the attachment appears to be corrupted") — does NOT silently generate the default Doable splash.
- **Regex (applied to assistant message text):**
  ```
  (?i)(unable\s+to\s+read|could\s+not\s+(parse|extract|process)|corrupt|invalid\s+(pdf|file)|no\s+text\s+(found|extracted)|attachment.{0,40}(unreadable|failed))
  ```
- **Negative regex (must NOT match in `src/App.tsx`):**
  ```
  Dream it\. Build it\.|Doable splash|Your app starts here
  ```
- **DOM target:** assistant chat bubble `textContent` in preview; must contain an acknowledgement phrase.

**Evolution log:**
- 2026-05-14 (R11): created to cover the "silently ignores bad PDF" failure mode observed when the AI produced a generic splash with a valid PDF. Corrupted input makes the failure mode unambiguous.

---

## TC-AI-CHAT-PDF-SRS-004 — Medium: PDF attachment + empty user content → 400

**Severity:** medium

**Preconditions:** any project; valid PDF attachment; `content` field blank.

**Request (variant A — empty string):**
```json
POST /projects/{id}/chat
{
  "content": "",
  "mode": "agent",
  "attachments": [{
    "type": "application/pdf",
    "data": "<base64 of srs_example_2010_group2.pdf>",
    "name": "srs_example_2010_group2.pdf"
  }]
}
```

**Request (variant B — whitespace only):**
```json
{ "content": "   ", "mode": "agent", "attachments": [...] }
```

**Steps:**
1. POST variant A; assert HTTP status.
2. POST variant B; assert HTTP status.
3. Check that no new version was created for the project (file tree unchanged).

## Acceptance

- **Literal (display in report):** HTTP 400 with an error body containing a "prompt is required" style message; project not mutated.
- **Regex (applied to HTTP response body):**
  ```
  (?i)(prompt|content|message).{0,60}(required|missing|empty|blank|must\s+not\s+be)
  ```
- **Status assertion:** HTTP status code must be `400` (not 200, not 422, not 500).
- **Mutation check:** `GET /projects/{id}/versions` count before and after must be equal.
- **DOM target:** n/a (API-layer assertion only).

**Evolution log:**
- 2026-05-14 (R11): created to ensure the attachment path does not bypass content-validation, which was previously untested when an attachment was present.

---

## Runner invocation

```bash
ENV_NAME=dev API_BASE_URL=https://dev-api.doable.me \
  PROJECT_ID=<project-id> TEST_NAME=pdf-srs-full TURN=1 \
  ACCEPT_PHRASES="(?i)(library|hostel|hotel|inventory|booking|registration|course|student|attend|grade|enrollment)" \
  PROMPT="Read the attached SRS PDF carefully..." \
  PDF_PATH="testcases/fixtures/srs_example_2010_group2.pdf" \
  bash testcases/evidence/run-granular-turn.sh
```

Evidence dir: `testcases/evidence/${ENV}/pdf-srs-full/`
Run log: `testcases/99-runlog/${ENV}/pdf-srs-full.md`
