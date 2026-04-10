# BUG-110: Editor Has Dual State Systems (Page vs Zustand) — File Tree Desyncs

**Severity:** CRITICAL
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** apps/web/src/app/editor/[projectId]/page.tsx vs apps/web/src/modules/editor/hooks/use-editor-store.ts

## Summary

The editor page.tsx maintains its own complete file management state (`fileTree`, `selectedFile`, `fileContent`, `openFileTabs`, `fileContentsCache`). Meanwhile, the Zustand store (`use-editor-store.ts`) also tracks `fileTree`, `activeFilePath`, `activeFileContent`, `openTabs`. The FileTree sidebar reads from Zustand; Monaco reads from page state.

## Impact

- Files created via sidebar don't appear in Monaco
- AI-driven file refreshes update page state but not Zustand
- The two file trees can diverge silently
- Users see inconsistent state between sidebar and editor

## Fix

Migrate page.tsx to use the Zustand store exclusively, or remove the Zustand store and use page state everywhere. One source of truth.
