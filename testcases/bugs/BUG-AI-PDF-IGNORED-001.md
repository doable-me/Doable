# BUG-AI-PDF-IGNORED-001 — Chat attachments: PDF file attached but text never extracted

**Severity:** high
**Status:** FIXED 2026-05-13
**Target:** https://dev-api.doable.me/projects/{id}/chat (chat endpoint with attachments)
**Found:** 2026-05-13 by Ralph R9 (AI multi-turn trace + QA-tester)
**Fixed by:** commit 8f20970, fix/pdf-attach-text-extraction branch

## Summary
User attaches a PDF to a chat message (e.g., "Build the app described in this SRS document. Read it fully."). The PDF reaches the API and is saved to the temp directory, but the text extraction step is completely missing. The model receives a chat augmentedPrompt with 0 additional characters from the PDF body. Generated output ignores the document entirely.

## Reproduction
1. Create a project on dev.doable.me.
2. Open editor chat.
3. Click attachment icon; upload a multi-page PDF (e.g., 50KB+ SRS document).
4. Type in chat: "Build the app described in this document. Read it fully."
5. Send message.
6. Observe: generated output has zero references to PDF content.
7. Inspect network request to `/projects/{id}/chat` — request body shows attachment mediaId.
8. Trace through services/api/src/ai/attachments.ts lines 264–278 (PDF branch).

## Expected
- PDF is base64-decoded and saved to temp file (as it is now) ✓
- PDF text is extracted from the file.
- Extracted text (e.g., 50,000+ chars from 50KB PDF) is pushed into fileSections array.
- fileSections is spliced into augmentedPrompt before sending to LLM.
- Model receives full document context in the prompt.

## Actual
- PDF is base64-decoded and saved to temp file ✓
- Text extraction is completely skipped (no function call).
- fileSections remains empty for PDF attachments.
- augmentedPrompt gains 0 additional characters.
- LLM prompt is missing the document entirely.

## Root Cause (CONFIRMED)
**File:** `services/api/src/ai/attachments.ts`, lines 264–278 (PDF branch).

The PDF branch only performs base64 decode + save to temp:
```typescript
const data = Buffer.from(part.data.data, 'base64');
await saveToTempFile(data, filename);
```

No call to text extraction, no push to `fileSections`. The correct pattern already exists in the **Document branch** (lines 282–308), which:
1. Calls `extractDocumentText()` (mammoth for .docx, xlsx for .xlsx).
2. Pushes result into `fileSections` array.
3. Falls back to temp file if extraction fails.

The PDF branch was never ported to match this pattern.

## Fix Applied
**PR:** fix/pdf-attach-text-extraction (commit 8f20970)

1. Added new dependency: `pdf-parse@2.4.5` (MIT licensed).
2. Created `extractPdfText(filePath: string): Promise<string>` helper in `services/api/src/ai/attachments.ts`.
3. Replaced PDF branch (lines 264–278) with the document-branch pattern:
   ```typescript
   const text = await extractPdfText(tempPath);
   fileSections.push({ filename, text });
   ```
4. Added fallback: if extractPdfText fails, use temp file as before.

## Verification
- **Typecheck:** `pnpm typecheck` → 0 errors.
- **Unit test:** `scripts/test-pdf-attach.ts` confirms:
  - 74,569-char SRS PDF extracts to 50,139 chars.
  - `augmentedPrompt.includes('Lorem ipsum...')` → true.
  - `srs_body_inlined: yes` (test passes).
- **Regression:** Document and XLSX attachments still pass existing tests.

## Evidence
- Commit 8f20970: attachments.ts changes + pdf-parse dependency.
- `scripts/test-pdf-attach.ts` test output.
- Parallel traces by tracer + qa-tester agents (both confirmed zero PDF text in augmentedPrompt before fix).

## Filed by
Ralph R9 (AI multi-turn trace round)

## Filed date
2026-05-13
