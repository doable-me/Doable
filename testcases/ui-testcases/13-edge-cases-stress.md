# TC-13: Edge Cases, Error Handling, Stress & Security

## 13.1 Authentication Edge Cases (P0)

### TC-13.1.1 — Expired JWT token
- **Steps**: Wait for JWT to expire (or manually invalidate). Try to navigate.
- **Expected**: Auto-refresh attempted. If refresh fails, redirect to login. No error page.

### TC-13.1.2 — Multiple tabs with same session
- **Steps**: Open dashboard in 5 tabs. Use different features in each.
- **Expected**: All tabs functional. Token refresh doesn't cause logout in other tabs.

### TC-13.1.3 — Logout from one tab
- **Steps**: Logout in tab 1. Try to use tab 2.
- **Expected**: Tab 2 redirects to login on next API call. No stale data shown.

### TC-13.1.4 — Direct URL access without auth
- **Steps**: Open incognito → go to `http://localhost:3000/editor/some-project-id`.
- **Expected**: Redirect to login page. After login, redirect back to the editor.

### TC-13.1.5 — Invalid project ID in URL
- **Steps**: Go to `http://localhost:3000/editor/invalid-uuid-here`.
- **Expected**: 404 page or "Project not found". No crash. No error page with stack trace.

## 13.2 Network Error Handling (P0)

### TC-13.2.1 — API server down
- **Steps**: Stop the API server → try to load dashboard.
- **Expected**: Error message: "Cannot connect to server". Retry button. No indefinite spinner.

### TC-13.2.2 — WebSocket disconnection
- **Steps**: Stop WS server during active collaboration.
- **Expected**: "Connection lost" indicator. Auto-reconnect attempts. Changes buffered locally.

### TC-13.2.3 — Slow network simulation
- **Steps**: Throttle network (Chrome DevTools → Slow 3G). Use dashboard and editor.
- **Expected**: Loading states shown. No infinite spinners. Timeout messages if requests exceed limits.

### TC-13.2.4 — Large payload handling
- **Steps**: Create a project with very large files (100KB+ React component).
- **Expected**: Editor handles large files. No OOM. Syntax highlighting may lag but doesn't crash.

## 13.3 State Management Edge Cases (P1)

### TC-13.3.1 — Rapid project switching
- **Steps**: Click between 5 different projects rapidly (within 10s).
- **Expected**: Each project loads correctly. No stale data from previous project. No race conditions.

### TC-13.3.2 — Browser back/forward navigation
- **Steps**: Dashboard → Editor → Templates → back → forward.
- **Expected**: Navigation works correctly. State restored on each page. No white screens.

### TC-13.3.3 — Hard refresh (Ctrl+Shift+R)
- **Steps**: In editor with active session → hard refresh.
- **Expected**: Page reloads. Chat history restored. Files loaded. Preview starts.

### TC-13.3.4 — New project while AI is streaming
- **Steps**: While AI is streaming on project A, navigate to dashboard and create a new project.
- **Expected**: Project A's stream aborted cleanly. New project starts fresh. No cross-contamination.

## 13.4 Content Edge Cases (P1)

### TC-13.4.1 — XSS prevention in project name
- **Steps**: Create project with name: `<script>alert('xss')</script>`.
- **Expected**: Name sanitized or escaped. No script execution. Name displays as text.

### TC-13.4.2 — XSS in chat messages
- **Steps**: Send chat message: `<img src=x onerror=alert('xss')>`.
- **Expected**: HTML escaped. No script execution. Message shows as text.

### TC-13.4.3 — Unicode in project names
- **Steps**: Create project named "🚀 My App — 日本語テスト".
- **Expected**: Unicode renders correctly. No encoding issues. Searchable.

### TC-13.4.4 — Very long project name
- **Steps**: Create project with a 200+ character name.
- **Expected**: Name truncated in UI with ellipsis. Full name in tooltip/settings. No layout break.

### TC-13.4.5 — Empty project name
- **Steps**: Try to create project with empty name.
- **Expected**: Validation error. Cannot create without a name.

### TC-13.4.6 — SQL injection in search
- **Steps**: Search for `'; DROP TABLE projects; --`.
- **Expected**: No SQL injection. Search returns no results. Database intact.

## 13.5 Concurrent Operations (P1)

### TC-13.5.1 — Two users editing same line
- **Steps**: User A and B type at the exact same position simultaneously.
- **Expected**: CRDT merges both inputs. No data loss. Both users' text present.

### TC-13.5.2 — AI editing while user is editing
- **Steps**: Send AI a prompt while manually typing in the same file.
- **Expected**: Both edits applied. AI edits merge with user edits via CRDT. No corruption.

### TC-13.5.3 — Multiple AI requests queued
- **Steps**: Send message → immediately send another.
- **Expected**: First processed. Second queued (or error "Still processing"). No crash.

## 13.6 Performance & Stress (P2)

### TC-13.6.1 — 100+ projects in dashboard
- **Steps**: View dashboard with 100+ projects.
- **Expected**: List loads. Scrolling smooth. Pagination or virtual scroll if needed.

### TC-13.6.2 — Project with 50+ files
- **Steps**: Open a project with 50+ files in file tree.
- **Expected**: File tree renders. No performance issues. Files openable.

### TC-13.6.3 — Chat with 50+ messages
- **Steps**: Have a long conversation (50+ messages). Scroll through history.
- **Expected**: All messages loaded (possibly paginated). Scrolling smooth.

### TC-13.6.4 — Multiple browser tabs
- **Steps**: Open 10 tabs of different projects.
- **Expected**: All tabs functional. No excessive memory usage. WS connections managed.

### TC-13.6.5 — Fast clicking (debounce testing)
- **Steps**: Rapidly click "Build" button 10 times.
- **Expected**: Only one build triggered. Debouncing prevents multiple creations.

## 13.7 Security Verification (P0)

### TC-13.7.1 — CSRF protection
- **Steps**: Check if API requests include CSRF tokens or use SameSite cookies.
- **Expected**: API uses JWT Bearer tokens (not cookies), so CSRF is inherently prevented.

### TC-13.7.2 — Path traversal in file operations
- **Steps**: Try to create file with path `../../../etc/passwd`.
- **Expected**: Path validation rejects it. No file created outside project directory.

### TC-13.7.3 — Rate limiting on auth endpoints
- **Steps**: Send 50 rapid login requests.
- **Expected**: Rate limited after threshold. 429 error returned.

### TC-13.7.4 — Secrets not exposed in frontend
- **Steps**: Check browser source, localStorage, network responses for API keys or JWT secrets.
- **Expected**: No secrets in client-side code. API keys stored server-side only. JWT secret not in responses.

### TC-13.7.5 — Unauthorized API access
- **Steps**: Call API endpoints without auth token.
- **Expected**: 401 Unauthorized for all protected routes.

### TC-13.7.6 — Cross-project access
- **Steps**: User A tries to access User B's private project via direct URL.
- **Expected**: 403 Forbidden or 404. No data leakage.

## 13.8 Accessibility (P3)

### TC-13.8.1 — Keyboard navigation
- **Steps**: Navigate dashboard using only Tab, Enter, Escape, Arrow keys.
- **Expected**: All interactive elements focusable. Focus indicators visible. Can create project and navigate.

### TC-13.8.2 — Screen reader basics
- **Steps**: Check for ARIA labels on key elements.
- **Expected**: Buttons, links, inputs have appropriate labels. Landmarks defined.

## 13.9 Error Recovery (P1)

### TC-13.9.1 — Recover from crash
- **Steps**: If error boundary triggers, observe the error page.
- **Expected**: Error page shows with "Go back" or "Retry" button. Not a blank white screen.

### TC-13.9.2 — Failed file save recovery
- **Steps**: If file save fails (API error), try again.
- **Expected**: Error message shown. Unsaved data not lost. Retry possible.

### TC-13.9.3 — Failed publish recovery
- **Steps**: Publish fails mid-deploy.
- **Expected**: Error shown with reason. Previous published version still live. Retry available.
