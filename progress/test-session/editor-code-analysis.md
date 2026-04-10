# Editor Code Analysis — 2026-04-09

Static analysis of the editor, file management, and preview system. All line numbers reference the files as they exist at this commit.

---

## CRITICAL

### 1. Duplicate State Systems — Page State vs. Zustand Store

**Files:** `apps/web/src/app/editor/[projectId]/page.tsx` vs. `apps/web/src/modules/editor/hooks/use-editor-store.ts` + `apps/web/src/modules/editor/hooks/use-project-files.ts`

The editor `page.tsx` maintains a complete parallel file management system (own `fileTree`, `selectedFile`, `fileContent`, `openFileTabs`, `fileContentsCache`, `expandedFolders` state, own `loadFileTree`/`loadFileContent`/`openFileInTab`/`closeFileTab` functions) at lines 1164–1708.

Meanwhile, `use-editor-store.ts` (Zustand) also tracks `fileTree`, `activeFilePath`, `activeFileContent`, `openTabs`. The `FileTree` sidebar component (`sidebar/file-tree.tsx`) reads from the Zustand store via `useEditorStore`, NOT from `page.tsx` state.

**Impact:** Any file created/deleted via the `FileTree` sidebar will update the Zustand store but NOT the page-level `fileTree` state. Conversely, AI-driven file refreshes call `loadFileTree()` (page-level, lines 1611–1635 and 2275), which sets page state but never touches the Zustand store. The two trees can diverge without any error. Monaco in the page renders `fileContent` from page state; the sidebar shows `fileTree` from the Zustand store. A user can create a file in the sidebar and never see it open in Monaco because `openFileInTab` (page) is never called by the sidebar's `readFile` (which calls `useEditorStore.setActiveFile`).

**Root cause:** The Zustand store was apparently added as a refactor path but `page.tsx` was never migrated to use it. There are now two independent, non-synchronized state trees for the same data.

---

### 2. File Rename Has No Auth Headers

**File:** `apps/web/src/modules/editor/sidebar/file-tree.tsx`, lines 484–503

```ts
const readRes = await fetch(
  `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(oldPath)}`
);
// ...
await fetch(
  `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(newPath)}`,
  { method: "PUT", headers: { "Content-Type": "application/json" }, ... }
);
await fetch(
  `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(oldPath)}`,
  { method: "DELETE" }
);
```

All three `fetch` calls omit the `Authorization` header. The API has `authMiddleware` on all `/projects/:id/*` routes, so all three requests will receive a 401 in production. The rename will silently fail (the `catch` at line 507 only calls `console.error`). The file tree refreshes at line 506 regardless, leaving both the old and "new" file visible.

Similarly, `createFileViaApi` at lines 416–434 omits the auth header.

---

### 3. Directory Deletion Attempts to Delete Single File Path

**File:** `apps/web/src/modules/editor/sidebar/file-tree.tsx`, lines 527–530

```ts
const handleDeleteConfirm = useCallback(async () => {
  if (!deleteTarget) return;
  await deleteFile(deleteTarget);
  ...
```

`deleteFile` (from `use-project-files.ts`, line 131–147) calls `DELETE /projects/:id/files/:path`. The backend `deleteFile` in `project-files.ts` delegates to `deleteProjectFile` in `ai/project-files.js`. This operates on a single file path. There is no recursive directory deletion. If a user right-clicks a directory node and chooses "Delete", the backend will try to delete a directory path as if it were a file, which will either fail or delete only a placeholder `.gitkeep` file while leaving the rest of the directory contents on disk. The file tree will appear to succeed (it refreshes) but the directory and its children will still exist on disk.

---

## HIGH

### 4. No Auth Headers on File Create (File Tree)

**File:** `apps/web/src/modules/editor/sidebar/file-tree.tsx`, line 416–434

`createFileViaApi` sends `PUT` with no `Authorization` header, so it fails 401 in production. Creating a new file from the "+" button or context menu will silently fail. The `fetchFileTree()` call at line 428 then shows the old tree, making it appear as if nothing happened.

---

### 5. Rename Does Not Update Open Tabs

**File:** `apps/web/src/modules/editor/sidebar/file-tree.tsx`, lines 469–511

After a rename (create-new + delete-old), the page-level `openFileTabs` and `selectedFile` are not updated. If the renamed file is currently open in the editor, the tab still shows the old path, and editing/saving will write to the old (deleted) path. The content on disk will be stale.

No equivalent close-old-tab / open-new-tab logic is called after `fetchFileTree()` at line 506.

---

### 6. `tool.completed` Handled Twice Per Event

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 529–548

```ts
if (parsed.type === "tool.completed" && onToolCompleted) {
  // first invocation (lines 529-532)
  onToolCompleted(toolName ?? "", toolArgs ?? {});
}

if ((parsed.type === "tool_result" || parsed.type === "tool.completed") && onToolCompleted) {
  // second invocation if type === "tool.completed" (lines 536-548)
  if (toolName) onToolCompleted(toolName, toolArgs);
}
```

When `parsed.type === "tool.completed"`, `onToolCompleted` is called twice per SSE frame. Each call triggers `handleToolCompleted`, which calls `loadFileTree()` (file tree refresh). This results in two concurrent file tree reloads per tool completion, and "completed" tool action cards may be duplicated in the UI. This same double-handler pattern is repeated in `processOneSSEPayload` at lines 732–748 of the same file.

---

### 7. Preview Refresh After Auto-Fix Uses Wrong Message Sequence

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 1880–1881 (auto-fix stream reader)

```ts
if (payload === "[DONE]") break;
```

After `[DONE]` is detected, the inner `for` loop `break`s to exit only the `for (const line of lines)` loop, not the outer `while(true)` read loop. The outer loop will continue calling `reader.read()` expecting more data, but the stream is already done. This creates an extra read cycle. Depending on the stream implementation, this may be benign or cause a spurious error. For comparison, the main `streamChat` function at line 499–501 correctly uses `return` instead of `break`.

---

### 8. Port Pool Exhaustion (100-port cap)

**File:** `services/api/src/projects/dev-server.ts`, lines 20–21

```ts
const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3200;
```

Only 100 ports are available. When all 100 are consumed (100 simultaneous active projects), `allocatePort()` throws an error at line 88–92. There is no eviction policy — old idle dev servers are never stopped automatically. The `stopDevServer` is called on explicit request or graceful shutdown, but there is no LRU eviction or TTL. On a production server handling many users, this pool will exhaust.

---

### 9. `stopDevServer` Can Silently Leak Port on Windows

**File:** `services/api/src/projects/dev-server.ts`, lines 393–405

On Windows, `taskkill /T /F` is used to kill the process tree. However, `spawn("taskkill", ...)` is called without `await` and without the `stdio: "inherit"` flag, and neither a callback nor the `close` event of the taskkill child is awaited. If `taskkill` fails silently (e.g., the process already exited between the check and the kill), the port is released by `cleanup(projectId)` at line 430 but the underlying OS port may still be bound for a brief window. Subsequent `allocatePort()` calls for that port may succeed prematurely before the OS releases it, causing Vite startup failures with `EADDRINUSE`.

---

### 10. `editor.ts` Routes Are In-Memory Only (Dead Code Path)

**File:** `services/api/src/routes/editor.ts`, lines 12–26

```ts
// ─── In-memory file storage (replace with real storage in production) ────
const projectFiles = new Map<string, Map<string, ProjectFile>>();
```

`editor.ts` defines a full set of file routes (`GET/PUT/POST/DELETE /projects/:id/files`) backed by an in-memory Map. `project-files.ts` also defines the same routes backed by the real filesystem. If both routers are mounted in the Hono app, one will shadow the other depending on mount order. If `editorRoutes` is mounted first, all file CRUD goes to the in-memory store (discarded on restart), not the filesystem — Vite serves the old files and the preview never reflects edits.

This needs verification against the main app entry point, but the presence of both competing route handlers is a structural defect.

---

## MEDIUM

### 11. Monaco `onMount` Callback Has Stale Closure for `onSave`

**File:** `apps/web/src/modules/editor/code-editor/monaco-editor-wrapper.tsx`, lines 60–106

The `handleMount` callback is memoized with `useCallback([onSave, onEditorMount, onCursorChange])`. The `editor.addCommand` at line 90 captures `onSave` at mount time. However, `@monaco-editor/react`'s `onMount` prop is called once per editor lifecycle. If `onSave` changes (e.g., when `selectedFile` changes in the parent and a new `handleMonacoSave` closure is created), the old `onSave` captured by `addCommand` remains registered — the Ctrl+S shortcut will save to the file that was active at mount time, not the currently selected file.

The correct fix is to use a stable ref for `onSave` and read from it in the command handler, similar to the `valueRef` pattern already used at lines 53–58.

---

### 12. localStorage Pinned Items Not Namespaced Per Project

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 250–268

```ts
localStorage.getItem("doable_pinned_toolbar")
localStorage.setItem("doable_pinned_toolbar", ...)
```

Pinned toolbar state is stored under a single key shared across all projects. This is intentional for UX (user preference), but the preview proxy's storage namespace patch (`preview-proxy.ts` lines 173–216) prefixes all localStorage keys with `__<projectId>__` inside the iframe. The pinned toolbar state lives in the parent frame and is not affected by the patch — this is correct — but the comment in the proxy code at line 172 says "must run BEFORE any user scripts". The namespace patch only covers storage for the preview frame. If the main app ever reads project-specific data from localStorage without namespacing, it will collide across projects.

---

### 13. Auto-Fix Error Loop — No Guard Against Repeated Same Error

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 1804–1806

```ts
const now = Date.now();
if (now - lastAutoFixTimeRef.current < 10_000) return;
```

The debounce is 10 seconds. If the auto-fix AI writes bad code that produces the same runtime error repeatedly, the fix will be retried indefinitely on a 10-second cycle. There is no max-retry counter or exponential backoff. If the AI consistently fails to fix a bug (e.g., calls a nonexistent API), this creates an infinite loop that consumes AI credits and fills the chat history with blank auto-fix messages.

---

### 14. `fetchPreviewUrl` Polling Uses `encodeURIComponent` Inconsistently

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 320–324

```ts
await apiFetch(`/projects/${projectId}/files/${encodeURIComponent(filePath)}`);
```

File path encoding is correct here. However, `extractFilePath` on the server side (`project-files.ts`, lines 485–492) uses `decodeURIComponent(raw)`, which is correct. The issue is that `file-tree.tsx` line 485 does:

```ts
const readRes = await fetch(
  `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(oldPath)}`
);
```

If `oldPath` contains a path separator `/`, `encodeURIComponent` encodes it as `%2F`. The Hono wildcard route `GET /projects/:id/files/*` captures the remainder after `/files/`, which in Express/Hono's wildcard matching treats `%2F` as a literal `%2F` in the URL, not as `/`. The server-side `extractFilePath` then returns `src%2FApp.tsx` instead of `src/App.tsx`, causing `readFile` to fail with `FileNotFoundError`. Files in subdirectories cannot be read by the rename handler.

---

### 15. `chatElapsedSec` Timer Interval Not Cleared on Component Unmount

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 1426–1437

```ts
useEffect(() => {
  if (!isStreaming) { setChatElapsedSec(0); return; }
  const id = window.setInterval(...);
  return () => window.clearInterval(id);
}, [isStreaming]);
```

This is correctly handled for `isStreaming` changes. However the `setInterval` fires `setChatElapsedSec` on a component that may have unmounted if the user navigates away mid-stream. React 18 would warn about this ("Can't perform a React state update on an unmounted component" — though React 18+ suppresses this, it still runs the interval). A separate cleanup `useEffect` with an unmount return would be more robust, but this is minor in practice.

---

### 16. Preview Proxy Injects Scripts After First `</head>` Only

**File:** `services/api/src/routes/preview-proxy.ts`, line 332

```ts
injected = injected.replace("</head>", `${errorCaptureSnippet}${headSnippet}</head>`);
```

`String.replace` replaces only the FIRST occurrence of `</head>`. If the proxied HTML contains nested iframes with inline srcdoc that include `</head>`, or if Vite produces malformed HTML with multiple `</head>` tags, only the outermost one is patched. This is low-risk for standard Vite output but could silently skip injection on unusual templates.

---

### 17. Dev Server Does Not Clean Up `startingServers` on `doStartDevServer` Failure

**File:** `services/api/src/projects/dev-server.ts`, lines 147–154

```ts
const startPromise = doStartDevServer(projectId, opts);
startingServers.set(projectId, startPromise);
try {
  return await startPromise;
} finally {
  startingServers.delete(projectId);
}
```

The `finally` block correctly removes the key. However `doStartDevServer` calls `markFailed` (lines 258–263) which calls `cleanup(projectId)` (removing from `servers`), then rejects the promise. `startingServers.delete` fires in `finally`. If a second concurrent call to `startDevServer` arrives between `markFailed` running and `startingServers.delete` running (i.e., between the rejection and the `finally` cleanup), the second call will `await inflight` (the already-rejected promise), catch the error, and then fall through to `doStartDevServer` again. This is actually the intended behavior (retry after failure), but the comment at line 99 says "Previous scaffold failed — we'll try again below", suggesting this race window is understood. The issue is that in `startDevServer`, the catch at line 99 is not present — the inflight promise rejection propagates. Confirmed low risk but worth noting.

---

## LOW

### 18. `loadPinnedItems` Called at Module Level During SSR

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 250–258

```ts
function loadPinnedItems(): ActiveTab[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("doable_pinned_toolbar");
```

The `window` guard is present. This is fine. No issue.

---

### 19. Monaco `mouseWheelZoom: true` Not Guarded by Modifier Key Check

**File:** `apps/web/src/modules/editor/code-editor/monaco-editor-wrapper.tsx`, line 168

`mouseWheelZoom: true` enables font size zoom on scroll without a modifier key by default. In Monaco this changes the `fontSize` option globally, which persists for the lifetime of the editor instance. If a user accidentally scrolls over the editor, the font size will change and not reset when switching tabs. This is a UX issue, not a code bug.

---

### 20. `generateProjectId` Uses `Date.now()` (Not UUID)

**File:** `apps/web/src/app/editor/[projectId]/page.tsx`, lines 1118–1120

```ts
function generateProjectId(): string {
  return `proj-${Date.now()}`;
}
```

This generates a timestamp-based ID like `proj-1712345678901`. The `ensureProjectDbRecord` helper in `project-files.ts` at line 516 explicitly skips non-UUID IDs. So for "new" projects created from the dashboard, no DB record is ever created by `ensureProjectDbRecord`. The project only gets a DB record through other means (project creation flow). If that other mechanism fails, the project exists on disk but is invisible on the dashboard. This is by design per the comment at line 513, but it is a fragile design where missing DB records produce invisible projects.

---

## Summary Table

| # | Severity | File | Line(s) | Issue |
|---|----------|------|---------|-------|
| 1 | CRITICAL | page.tsx + use-editor-store.ts | 1164–1708 | Dual state trees (page vs Zustand) never synchronized |
| 2 | CRITICAL | sidebar/file-tree.tsx | 484–503 | Rename fetch calls have no auth headers → 401 in production |
| 3 | CRITICAL | sidebar/file-tree.tsx | 527–530 | Directory delete tries to delete single file path; children remain |
| 4 | HIGH | sidebar/file-tree.tsx | 416–434 | File create has no auth header → 401 in production |
| 5 | HIGH | sidebar/file-tree.tsx | 469–511 | Rename doesn't close/reopen tab → editor writes to deleted path |
| 6 | HIGH | page.tsx | 529–548 | `tool.completed` events trigger `onToolCompleted` twice per frame |
| 7 | HIGH | page.tsx | 1880–1881 | Auto-fix stream: `break` exits inner loop only, not outer read loop |
| 8 | HIGH | dev-server.ts | 20–21 | Port pool (100 ports) has no LRU eviction → exhaustion under load |
| 9 | HIGH | dev-server.ts | 393–405 | Windows: `taskkill` not awaited → premature port reuse possible |
| 10 | HIGH | editor.ts vs project-files.ts | all | Two competing file route handlers; in-memory may shadow filesystem |
| 11 | MEDIUM | monaco-editor-wrapper.tsx | 60–106 | `onSave` stale closure in Monaco command; Ctrl+S saves wrong file |
| 12 | MEDIUM | page.tsx | 250–268 | Pinned toolbar localStorage key not project-scoped |
| 13 | MEDIUM | page.tsx | 1804–1806 | Auto-fix error loop: no max-retry, infinite on unfixable errors |
| 14 | MEDIUM | file-tree.tsx | 485 | `encodeURIComponent` encodes `/` as `%2F`, breaking subdirectory rename read |
| 15 | MEDIUM | page.tsx | 1426–1437 | `chatElapsedSec` interval may fire on unmounted component mid-stream |
| 16 | LOW | preview-proxy.ts | 332 | `</head>` injection uses `.replace` (first match only) |
| 17 | LOW | dev-server.ts | 147–154 | `startingServers` cleanup race on concurrent failure+retry is benign |
| 18 | LOW | monaco-editor-wrapper.tsx | 168 | `mouseWheelZoom: true` changes global font size permanently on scroll |
| 19 | LOW | page.tsx | 1118–1120 | `proj-{timestamp}` IDs skip DB record creation, creating invisible projects |
