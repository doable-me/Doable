# TC-AI-CHAT-ATTACH — Attachments & file uploads

Covers chat-attached docs (doc, docx, xls, xlsx, csv, pdf): upload endpoint, MIME validation, size limits, malicious file rejection, content extraction, association to message, render, deletion.

## TC-AI-CHAT-ATTACH-001 — Upload pdf attaches to chat (smoke)
- **Pre:** authenticated; sample.pdf 2MB
- **Steps:** POST /chat/:sessionId/attachments multipart sample.pdf
- **Expected:** 200 with attachmentId; row in attachments table; storage object created
- **Severity:** smoke

## TC-AI-CHAT-ATTACH-002 — Upload docx attaches
- **Steps:** upload .docx
- **Expected:** 200; mimeType saved correctly
- **Severity:** high

## TC-AI-CHAT-ATTACH-003 — Upload doc legacy format attaches
- **Steps:** upload .doc
- **Expected:** 200; extraction succeeds via legacy parser OR graceful fallback
- **Severity:** medium

## TC-AI-CHAT-ATTACH-004 — Upload xlsx attaches and parses
- **Steps:** upload .xlsx
- **Expected:** 200; sheets extracted with row counts in metadata
- **Severity:** high

## TC-AI-CHAT-ATTACH-005 — Upload xls legacy format attaches
- **Steps:** upload .xls
- **Expected:** 200; parsed
- **Severity:** medium

## TC-AI-CHAT-ATTACH-006 — Upload csv attaches and previews
- **Steps:** upload .csv
- **Expected:** 200; first 50 rows in preview metadata
- **Severity:** smoke

## TC-AI-CHAT-ATTACH-007 — Upload .exe rejected
- **Steps:** upload exe
- **Expected:** HTTP 415 with allowed types listed
- **Severity:** critical

## TC-AI-CHAT-ATTACH-008 — Upload .js rejected (not whitelisted)
- **Steps:** upload .js as attachment
- **Expected:** HTTP 415 (project file uploads use different endpoint)
- **Severity:** medium

## TC-AI-CHAT-ATTACH-009 — Upload zero-byte file rejected
- **Steps:** upload empty.csv
- **Expected:** HTTP 400 file_empty
- **Severity:** medium

## TC-AI-CHAT-ATTACH-010 — Upload at exact max size succeeds
- **Pre:** maxSize=25MB
- **Steps:** upload 25MB pdf
- **Expected:** 200
- **Severity:** high

## TC-AI-CHAT-ATTACH-011 — Upload over max size rejected
- **Steps:** upload 26MB
- **Expected:** HTTP 413
- **Severity:** high

## TC-AI-CHAT-ATTACH-012 — Upload with mismatched extension/MIME
- **Steps:** rename .exe → .pdf
- **Expected:** server inspects magic bytes; rejects
- **Severity:** critical

## TC-AI-CHAT-ATTACH-013 — Upload corrupt pdf
- **Steps:** truncated pdf
- **Expected:** stored but extraction marks status=failed; user warned
- **Severity:** medium

## TC-AI-CHAT-ATTACH-014 — Password-protected pdf
- **Steps:** upload encrypted pdf
- **Expected:** extraction fails; UI prompts "encrypted, can't extract"
- **Severity:** medium

## TC-AI-CHAT-ATTACH-015 — Macro-enabled docx (.docm) handled
- **Steps:** upload .docm
- **Expected:** rejected OR extracted with macros stripped per policy
- **Severity:** high

## TC-AI-CHAT-ATTACH-016 — XXE in docx rejected
- **Steps:** upload doc with XXE payload
- **Expected:** parser disables external entities; no SSRF
- **Severity:** critical

## TC-AI-CHAT-ATTACH-017 — Zip-bomb docx rejected
- **Steps:** upload nested-zip docx
- **Expected:** decompression cap triggers rejection; no DoS
- **Severity:** critical

## TC-AI-CHAT-ATTACH-018 — Unicode filename preserved
- **Steps:** upload "résumé文档.pdf"
- **Expected:** filename stored utf8; download works
- **Severity:** low

## TC-AI-CHAT-ATTACH-019 — Path traversal in filename sanitized
- **Steps:** filename "../../etc/passwd"
- **Expected:** sanitized; stored at safe key
- **Severity:** critical

## TC-AI-CHAT-ATTACH-020 — Multiple attachments per message
- **Steps:** upload 3, send message referencing all
- **Expected:** assistant references all; metadata.attachments[3]
- **Severity:** high

## TC-AI-CHAT-ATTACH-021 — Attachment limit per message enforced
- **Pre:** maxAttachments=10
- **Steps:** attach 11
- **Expected:** HTTP 400 too_many_attachments
- **Severity:** medium

## TC-AI-CHAT-ATTACH-022 — Attachment count visible in UI
- **Expected:** input bar shows count badge
- **Severity:** low

## TC-AI-CHAT-ATTACH-023 — Detach attachment before send
- **Steps:** click X on attachment chip
- **Expected:** removed; not sent; not deducted from quota
- **Severity:** smoke

## TC-AI-CHAT-ATTACH-024 — Attachment used by chat is referenced in ai_messages
- **Steps:** inspect row
- **Expected:** attachments jsonb has ids, types, sizes
- **Severity:** medium

## TC-AI-CHAT-ATTACH-025 — Attachment extracted text injected into prompt
- **Steps:** debug log
- **Expected:** extracted text appears with `<attachment name="x.pdf">…</attachment>` wrapper
- **Severity:** high

## TC-AI-CHAT-ATTACH-026 — Extracted text truncated when oversize
- **Pre:** 1M-char extract
- **Expected:** truncated; metadata.truncated=true
- **Severity:** medium

## TC-AI-CHAT-ATTACH-027 — Attachment download URL signed
- **Steps:** GET /chat/attachments/:id/download
- **Expected:** signed URL TTL ≤ 1h; not directly browsable bucket
- **Severity:** high

## TC-AI-CHAT-ATTACH-028 — Cross-tenant attachment access denied
- **Steps:** another user requests download
- **Expected:** HTTP 403
- **Severity:** critical

## TC-AI-CHAT-ATTACH-029 — Delete attachment before send
- **Steps:** DELETE /chat/attachments/:id
- **Expected:** 204; storage object deleted
- **Severity:** medium

## TC-AI-CHAT-ATTACH-030 — Delete attachment after send (orphan handling)
- **Pre:** message references attachment
- **Steps:** delete
- **Expected:** soft-delete only; chat history retains text but file no longer downloadable
- **Severity:** medium

## TC-AI-CHAT-ATTACH-031 — Attachment list endpoint returns user's attachments
- **Steps:** GET /chat/attachments?sessionId=
- **Expected:** array; pagination supported
- **Severity:** low

## TC-AI-CHAT-ATTACH-032 — Upload returns extracted preview synchronously when small
- **Steps:** upload tiny csv
- **Expected:** response includes preview rows
- **Severity:** medium

## TC-AI-CHAT-ATTACH-033 — Upload returns async extraction job for large
- **Steps:** upload large pdf
- **Expected:** response status=queued; client polls until ready
- **Severity:** medium

## TC-AI-CHAT-ATTACH-034 — Extraction job timeout
- **Pre:** extraction stuck >2min
- **Expected:** marked failed; user shown retry CTA
- **Severity:** medium

## TC-AI-CHAT-ATTACH-035 — Drag-drop into chat input creates upload
- **Steps:** drag pdf onto input
- **Expected:** upload kicks off; chip appears
- **Severity:** smoke

## TC-AI-CHAT-ATTACH-036 — Paste image clipboard rejected (chat attach is doc-only)
- **Steps:** paste image
- **Expected:** rejected with toast; image goes via separate upload path if any
- **Severity:** low

## TC-AI-CHAT-ATTACH-037 — Network drop during upload
- **Steps:** kill network at 50%
- **Expected:** upload fails; partial cleaned up; chip removed
- **Severity:** medium

## TC-AI-CHAT-ATTACH-038 — Resumable upload supported (if implemented)
- **Steps:** continue after drop
- **Expected:** resume works OR clear restart UX
- **Severity:** low

## TC-AI-CHAT-ATTACH-039 — Per-user storage quota enforced
- **Pre:** storage near cap
- **Expected:** HTTP 413 storage_full
- **Severity:** medium

## TC-AI-CHAT-ATTACH-040 — Attachment retained after session delete (per policy) OR removed
- **Steps:** delete session; observe storage
- **Expected:** matches retention policy; documented behavior
- **Severity:** medium
