# TC-EDITOR-MONACO — Monaco editor UI behavior

UI lives in `apps/web/src/app/editor/[projectId]/page.tsx`. Monaco is loaded lazily; file tree and tabs surrounding it.

These tests must run in Chrome (or chrome-via-mcp) and verify visible UI plus underlying network calls.

---

## TC-MONACO-001 — Open editor page for valid project
- **Steps:** navigate to `/editor/<id>` while authenticated and a workspace member.
- **Expected:** Monaco editor renders within 5s; file tree on left; default file tab opens (e.g. README or index file).
- **Severity:** smoke

## TC-MONACO-002 — Open editor for non-existent project → 404 page
- **Steps:** navigate to `/editor/<random-uuid>`.
- **Expected:** "Project not found" UI.
- **Severity:** smoke

## TC-MONACO-003 — Open editor for inaccessible project (private, non-member) → 404
- **Severity:** high

## TC-MONACO-004 — Open editor for public project → auto-join collab; Monaco renders
- **Severity:** high

## TC-MONACO-005 — Loading state visible before Monaco mounts
- **Severity:** low

## TC-MONACO-006 — File tree lists template files
- **Steps:** create new Vite project, navigate to editor.
- **Expected:** file tree shows `index.html`, `src/`, `package.json`, etc.
- **Severity:** smoke

## TC-MONACO-007 — Click file in tree opens it in editor with content loaded
- **Severity:** smoke

## TC-MONACO-008 — Click directory toggles expand/collapse
- **Severity:** medium

## TC-MONACO-009 — File tree refreshes when AI agent creates new file
- **Severity:** high

## TC-MONACO-010 — Empty editor when no file selected
- **Severity:** low

## TC-MONACO-011 — Multiple tabs open simultaneously, switching preserves cursor
- **Steps:** open file A, scroll to line 50, open file B, switch back to A.
- **Expected:** cursor at line 50 in A.
- **Severity:** medium

## TC-MONACO-012 — Close tab via X button
- **Severity:** medium

## TC-MONACO-013 — Close last tab leaves placeholder
- **Severity:** low

## TC-MONACO-014 — Closing tab with unsaved changes prompts confirm
- **Severity:** high

## TC-MONACO-015 — Syntax highlighting for TypeScript file
- **Steps:** open `.ts` file; inspect that keywords colored.
- **Expected:** TS tokens highlighted (function, const, etc.).
- **Severity:** smoke

## TC-MONACO-016 — Syntax highlighting for TSX file (JSX-aware)
- **Severity:** medium

## TC-MONACO-017 — Syntax highlighting for JSX file
- **Severity:** medium

## TC-MONACO-018 — Syntax highlighting for JavaScript
- **Severity:** medium

## TC-MONACO-019 — Syntax highlighting for JSON
- **Severity:** medium

## TC-MONACO-020 — Syntax highlighting for CSS
- **Severity:** medium

## TC-MONACO-021 — Syntax highlighting for HTML
- **Severity:** medium

## TC-MONACO-022 — Syntax highlighting for Markdown (and preview side)
- **Severity:** low

## TC-MONACO-023 — Syntax highlighting for Python
- **Severity:** low

## TC-MONACO-024 — Syntax highlighting for YAML
- **Severity:** low

## TC-MONACO-025 — Plain text fallback for unknown extension (.weird)
- **Severity:** low

## TC-MONACO-026 — Edit file: type characters update editor immediately
- **Steps:** focus editor, type "hello".
- **Expected:** editor shows new chars; dirty state indicator on tab.
- **Severity:** smoke

## TC-MONACO-027 — Save via Ctrl/Cmd+S triggers PUT request
- **Steps:** edit, press Ctrl+S; observe network panel.
- **Expected:** 200 PUT with new content; dirty indicator cleared.
- **Severity:** smoke

## TC-MONACO-028 — Auto-save debounce: typing for 2s issues at most 1 PUT after pause
- **Severity:** high

## TC-MONACO-029 — Fast-paced typing 200wpm — debounce coalesces
- **Steps:** Robot/script types continuously for 10s.
- **Expected:** PUT count ≤ 10 (debounce coalescing).
- **Severity:** high

## TC-MONACO-030 — Editor remains responsive during save
- **Severity:** high

## TC-MONACO-031 — Save failure displays toast/error and keeps dirty
- **Steps:** simulate 500 from API.
- **Expected:** error visible; can retry.
- **Severity:** high

## TC-MONACO-032 — Save retries with exponential backoff (if implemented)
- **Severity:** medium

## TC-MONACO-033 — Undo (Ctrl+Z) reverses local edit
- **Severity:** high

## TC-MONACO-034 — Undo across save still works (Yjs undo manager)
- **Severity:** medium

## TC-MONACO-035 — Redo (Ctrl+Y / Ctrl+Shift+Z)
- **Severity:** medium

## TC-MONACO-036 — Find (Ctrl+F) in current file
- **Severity:** medium

## TC-MONACO-037 — Find & Replace (Ctrl+H)
- **Severity:** medium

## TC-MONACO-038 — Multi-cursor (Alt+Click)
- **Severity:** low

## TC-MONACO-039 — Select all and delete clears file content; PUT with empty content
- **Severity:** medium

## TC-MONACO-040 — Paste large clipboard content (~500KB)
- **Steps:** copy large text, paste.
- **Expected:** editor accepts; save works.
- **Severity:** medium

## TC-MONACO-041 — Paste binary content (e.g. screenshot via Cmd+V)
- **Expected:** Monaco handles or rejects; document.
- **Severity:** medium

## TC-MONACO-042 — Paste content with tab characters
- **Severity:** low

## TC-MONACO-043 — Paste content with mixed line endings (CRLF + LF)
- **Severity:** low

## TC-MONACO-044 — Paste malformed UTF-8 sequence (via clipboard or upload)
- **Steps:** craft a string with lone surrogate.
- **Expected:** editor sanitizes or rejects; save preserves intent.
- **Severity:** medium

## TC-MONACO-045 — Paste content with NUL bytes
- **Severity:** medium

## TC-MONACO-046 — Open file >1MB
- **Steps:** add a 1MB file via API, open in editor.
- **Expected:** editor renders within 3s; scrolling smooth.
- **Severity:** medium

## TC-MONACO-047 — Open file >5MB
- **Expected:** Monaco may show "large file" warning or refuse; document threshold.
- **Severity:** high

## TC-MONACO-048 — Open file >10MB
- **Expected:** rejection / read-only mode.
- **Severity:** high

## TC-MONACO-049 — Open binary file (.png)
- **Expected:** editor refuses or shows hex/preview; does not crash.
- **Severity:** high

## TC-MONACO-050 — Open binary file (.zip)
- **Severity:** medium

## TC-MONACO-051 — Open binary file (.pdf)
- **Severity:** medium

## TC-MONACO-052 — Binary upload — does upload route reject or accept?
- **Severity:** medium

## TC-MONACO-053 — Switch between files quickly (10x in 1s) doesn't break editor state
- **Severity:** medium

## TC-MONACO-054 — Right-click context menu on file in tree
- **Expected:** options: Rename, Delete, Duplicate, New file, New folder.
- **Severity:** medium

## TC-MONACO-055 — Rename file via context menu — UI prompt → API DELETE+POST or PATCH
- **Severity:** high

## TC-MONACO-056 — Rename to existing name → error toast, no destructive action
- **Severity:** high

## TC-MONACO-057 — Rename with invalid chars → error
- **Severity:** medium

## TC-MONACO-058 — Delete file via context menu → confirmation → DELETE call
- **Severity:** high

## TC-MONACO-059 — Delete file with unsaved changes — prompt
- **Severity:** medium

## TC-MONACO-060 — Create new file via tree "+" button
- **Severity:** smoke

## TC-MONACO-061 — Create new folder via tree "+" button (if supported)
- **Severity:** medium

## TC-MONACO-062 — Drag-and-drop file in tree to move folder
- **Severity:** medium

## TC-MONACO-063 — Move file into nested folder via drag
- **Severity:** medium

## TC-MONACO-064 — Editor remembers open tabs across page reload
- **Severity:** medium

## TC-MONACO-065 — Editor restores cursor position across page reload (if persisted)
- **Severity:** low

## TC-MONACO-066 — Word wrap toggle
- **Severity:** low

## TC-MONACO-067 — Theme matches dashboard theme (dark/light)
- **Severity:** low

## TC-MONACO-068 — Font size adjusts via Cmd/Ctrl + +/-
- **Severity:** low

## TC-MONACO-069 — Format document (Shift+Alt+F) for TS/JS files
- **Severity:** medium

## TC-MONACO-070 — Go-to-definition (F12) within same file
- **Severity:** low

## TC-MONACO-071 — IntelliSense suggestions appear after typing `.`
- **Severity:** medium

## TC-MONACO-072 — Diagnostics (red squiggle) on syntax error
- **Severity:** medium

## TC-MONACO-073 — Reading from a file as a viewer collaborator (read-only mode)
- **Pre:** caller is viewer.
- **Expected:** editor in read-only mode; PUT not issued; UI shows badge.
- **Severity:** high

## TC-MONACO-074 — Editor unmount cancels pending debounce save
- **Severity:** medium

## TC-MONACO-075 — Editor route param projectId mismatch handles gracefully
- **Severity:** low
