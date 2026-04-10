# BUG-121: Preview "Building your app..." Overlay Never Clears After AI Finishes

**Severity:** CRITICAL (Users never see their app in the editor preview)
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Chrome E2E testing)
**Component:** apps/web/src/app/editor/[projectId]/page.tsx (preview overlay logic)

## Summary
After the AI finishes building (quick action buttons appear, "Stop Doable" disappears), the preview iframe continues showing "Building your app... AI is writing code" overlay. The actual app renders correctly when the preview URL is accessed directly in a new tab, proving the Vite dev server and the generated code work fine.

## Evidence
- AI completed building at ~650s, quick action buttons visible
- Preview still shows "Building your app..." after AI stopped
- Clicking "Refresh preview" doesn't clear the overlay
- Direct access to `http://localhost:4000/preview/{projectId}/` shows a fully working Task Manager app
- The overlay is rendered INSIDE the iframe (not by the editor React code) — confirmed by checking DOM for overlay elements (found none outside iframe)

## Root Cause
The "Building your app..." page is likely the initial HTML served by the preview proxy before the Vite dev server starts. When the dev server starts, Vite should hot-reload the iframe to show the actual app. But:
1. The preview proxy may be serving a cached "starting" page
2. The iframe may not be refreshing when Vite finishes compilation
3. The preview-proxy.ts injects a custom HTML page for "starting" state that doesn't self-update once the dev server is ready

## Impact
- Users NEVER see their app in the editor preview
- They have to manually open the preview URL in a new tab to see their work
- The entire editor UX is broken — preview is the core value proposition

## Fix
1. The "starting preview" page should poll/SSE until the dev server responds, then reload
2. After AI stream ends, force-refresh the preview iframe
3. Consider removing the blocking overlay entirely and letting Vite's native HMR handle updates
