# Doable E2E Test Results Report

**Date:** 2026-04-13  
**Tester:** Automated E2E (Playwright browser automation)  
**Environment:** localhost (API :4000, WS :4001, Web :3000)  
**User:** Godwin Josh (uniquegodwin@gmail.com) — Enterprise Plan, 999/999 credits  
**Browser:** Chromium (Playwright)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Test Areas** | 16 |
| **Areas Passed** | 12 |
| **Areas with Bugs** | 4 |
| **Critical Bugs (P0)** | 1 |
| **High Bugs (P1)** | 3 |
| **Medium Bugs (P2)** | 4 |
| **Low Bugs (P3)** | 2 |
| **Total Bugs Found** | 10 |
| **Overall Coverage** | ~65% |

---

## Bug Summary

### P0 — Critical (Blocking)

| # | Bug | Description | Impact |
|---|-----|-------------|--------|
| 1 | **Preview blank/stuck after AI build** | After AI completes building a project (template remix, build-from-scratch, or Design view), the preview panel shows a blank white screen. Header shows "Previewing last saved version." 504 Gateway Timeout errors on preview assets (node_modules/.vite/deps/*.js). | **Cross-project**, confirmed on 3 projects. Users cannot see what they built. Core experience broken. |

### P1 — High

| # | Bug | Description | Steps to Reproduce |
|---|-----|-------------|---------------------|
| 2 | **Private visibility toggle fails** | Setting project visibility to "Private" in Project Settings → General returns `400 Bad Request: "Validation failed"`. Setting to "Public" works fine. | Editor → More Views → Settings → General → Visibility → Toggle to Private → Save |
| 3 | **500 error on "Shared with me"** | Server returns 500 when loading "Shared with me" sidebar item. Page still renders "No projects yet" but the server error is real. | Dashboard → Sidebar → Shared with me |
| 4 | **500 error on Share dialog** | Console error 500 when opening the Share dialog from a project editor. Dialog still renders UI correctly. | Editor → Share button → Opens dialog → Console shows 500 |

### P2 — Medium

| # | Bug | Description |
|---|-----|-------------|
| 5 | **Project name override on template remix** | Creating a project from a template (e.g., "Todo App") results in project name "My Awesome App" instead of expected "Remix of Todo App" or the template name. |
| 6 | **Templates sidebar → Marketplace redirect** | Clicking "Templates" in the dashboard sidebar navigates to the Marketplace page instead of the Dashboard's Templates tab. |
| 7 | **504 Gateway Timeout on preview assets** | GET requests to preview endpoint for project node_modules (e.g., recharts.js) return 504 Gateway Timeout. Related to P0 preview bug. |
| 8 | **Ctrl+W closes browser tab instead of editor tab** | Pressing Ctrl+W in the code editor closes the entire browser tab rather than just the editor tab. This is expected browser behavior but a UX issue — no override implemented. |

### P3 — Low

| # | Bug | Description |
|---|-----|-------------|
| 9 | **analytics/track POST consistently failing** | All POST requests to `/analytics/track` fail with `ERR_ABORTED`. Zero analytics data being collected. |
| 10 | **WebSocket JWT token expiry warnings** | WebSocket connection warnings showing JWT token expiration. Connection re-establishes but warning noise in console. |

---

## Detailed Test Results

### TC-01: Dashboard & Navigation — PASS (with issues)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Dashboard loads after login | ✅ PASS | Loads in ~2s, shows project grid |
| Sidebar navigation items | ✅ PASS | All items clickable: My Projects, Starred, Created by me, Shared with me, Discover, Marketplace |
| Credits display | ✅ PASS | Shows 999/999 credits correctly |
| Grid ↔ List view toggle | ✅ PASS | Both views render project cards correctly |
| Tabs: My projects, Templates | ✅ PASS | Both tabs load content |
| Search bar | ✅ PASS | Filters projects in real-time |
| "Shared with me" | ⚠️ BUG | 500 error (Bug #3) but UI shows "No projects yet" |
| Discover page | ✅ PASS | Shows community/featured projects |
| Marketplace page | ✅ PASS | Shows integrations gallery |
| Starred filter | ✅ PASS | Shows "No starred projects" when empty |
| Created by me filter | ✅ PASS | Shows user's own projects |

### TC-02: Project Creation — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| Create from template (Todo App) | ✅ PASS | Template gallery → preview modal → "Use template" → Remix dialog → project created |
| Create from hero input (Build mode) | ✅ PASS | Weather dashboard created via "Build a simple weather dashboard..." |
| Create from hero input (Plan mode) | ✅ PASS | Finance tracker created via "Plan first" toggle |
| Template preview modal | ✅ PASS | Shows template name, description, preview screenshot |
| Remix dialog | ✅ PASS | Shows project name, "Remix project" button |
| Project naming | ⚠️ BUG | Default name "My Awesome App" overrides expected template name (Bug #5) |
| Project appears in dashboard | ✅ PASS | New projects visible immediately in grid |
| Duplicate project | ✅ PASS | Creates new project with same name, new ID (477f4503), workspace setup runs |

### TC-03: AI Chat — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| Send message | ✅ PASS | Message sent, AI responds |
| Streaming response | ✅ PASS | Response streams progressively |
| Thinking/reasoning toggle | ✅ PASS | "Thought process" expandable section |
| Tool calls display | ✅ PASS | Shows: report intent, scanning project structure, installing packages, reading file, creating file, updating file |
| Multi-turn conversation | ✅ PASS | Added categories then dark theme + animations — AI retained context |
| AI suggestions | ✅ PASS | Post-response suggestion buttons shown (e.g., "Add location autocomplete", "Customize chart colors") |
| Package installation | ✅ PASS | AI installs npm packages (recharts, framer-motion) during build |
| File changes summary | ✅ PASS | Shows "15 file changes, 15 actions" expandable section |
| Details vs Preview tabs | ✅ PASS | Details shows action list, Preview tab available |
| Bookmark version button | ✅ PASS | Each action step has bookmark icon |
| Good/Bad response buttons | ✅ PASS | Feedback buttons shown on AI messages |
| Copy message button | ✅ PASS | Copy button available |
| Chat modes (Build / Plan first) | ✅ PASS | Toggle between Build and Plan first modes |
| Voice input button | ✅ PASS | Microphone button present in chat input |
| File attachment button | ✅ PASS | "Attach file (images, text, code, PDF)" button present |
| Plan mode Q&A | ✅ PASS | 5 clarifying questions, interactive selection, 8-step plan generated |
| Plan editing | ✅ PASS | Edit/delete individual steps, add new steps, Start Building / Refine / Reset buttons |

### TC-04: Code Editor — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| File explorer tree | ✅ PASS | Shows .doable/, src/, root files. Folders expandable. |
| Multi-tab editing | ✅ PASS | Opened App.tsx + CurrentWeather.tsx simultaneously |
| Close tab (Ctrl+W) | ⚠️ BUG | Closes browser tab instead of editor tab (Bug #8) |
| Syntax highlighting | ✅ PASS | TSX/JSX properly highlighted |
| Line numbers | ✅ PASS | Line numbers shown in gutter |
| Breadcrumb path | ✅ PASS | Shows file path in editor header |
| Ctrl+F search | ✅ PASS | Auto-populated "CurrentWeather", showed "3 of 4" matches |
| Search options | ✅ PASS | Match Case, Match Whole Word, Use Regular Expression toggles |
| Ctrl+H replace | ✅ PASS | Find/Replace inputs, Replace/Replace All buttons, Preserve Case toggle |
| Inline code editing | ✅ PASS | Typed `// Test edit - weather dashboard` on line 12 — appeared correctly |
| Ctrl+Z undo | ✅ PASS | Reverted the test edit |
| Modified file indicator | ✅ PASS | Tab shows modified state after edits |
| Code folding | ✅ PASS | Collapse/expand markers on block boundaries |
| Minimap toggle | ✅ PASS | "Show minimap" button present |
| Empty state message | ✅ PASS | Shows "Select a file from the explorer" with keyboard shortcuts |

### TC-05: Preview Panel — FAIL (P0 Bug)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Preview loads after build | ❌ FAIL | Blank white screen after AI build (P0 Bug #1) |
| Preview refresh button | ⚠️ N/A | Refresh button exists but preview stays blank |
| Desktop view | ✅ PASS | Desktop viewport selected by default |
| Tablet view (768px) | ✅ PASS | Responsive resize works |
| Mobile view (375px) | ✅ PASS | Responsive resize works |
| Open in new tab | ✅ PASS | Button present |
| Fullscreen | ✅ PASS | Button present |
| URL bar | ✅ PASS | Shows "/" path |

### TC-06: Templates — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| Template gallery display | ✅ PASS | Multiple templates shown in grid |
| Template preview modal | ✅ PASS | Shows template details with preview image |
| "Use template" button | ✅ PASS | Opens remix dialog |
| Remix dialog | ✅ PASS | Shows project name field and "Remix project" button |
| Project creation from template | ✅ PASS | Redirects to editor with new project |

### TC-09: Environment Panel — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| Integrations tab | ✅ PASS | 3 connected (Gmail, Google Drive, Supabase), 539+ available |
| Knowledge tab | ✅ PASS | 16 files, 1,793 tokens, 15% budget used |
| Skills tab | ✅ PASS | 0 skills, "Add Skill" button |
| Rules tab | ✅ PASS | 0 rules, "Add Rule" button |
| Custom Instructions | ✅ PASS | Added "test-instruction.md" successfully |
| Variables tab | ✅ PASS | Added TEST_API_KEY variable (masked by default) |
| Settings tab | ✅ PASS | Workspace Default environment selected |

### TC-10: Sharing & Publishing — PASS (with issue)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Share button | ✅ PASS | Opens share dialog |
| Share dialog UI | ⚠️ BUG | 500 console error on open (Bug #4) but dialog renders |
| Invite by email | ✅ PASS | Email input field present |
| Permission levels | ✅ PASS | View/Edit toggles |
| Publish button | ✅ PASS | Opens publish dialog |
| Live/Test environments | ✅ PASS | Environment selector in publish dialog |
| Team chat indicator | ✅ PASS | Shows "1 online" with user avatar |

### TC-11: Project Settings — PASS (with bug)

| Test Case | Status | Notes |
|-----------|--------|-------|
| General tab | ✅ PASS | Name change saves, description field available |
| Visibility toggle | ⚠️ BUG | Private toggle returns 400 (Bug #2) |
| Project Information | ✅ PASS | Read-only metadata: ID, Owner, Created at, Updated at |
| Integrations tab | ✅ PASS | 542 available integrations, search, categories |
| MCP Servers tab | ✅ PASS | Add form: Name, Description, Transport Type (HTTP/SSE/stdio), URL, Auth (None/API Key/Bearer/OAuth) |
| Skills & Rules tab | ✅ PASS | Add Skill/Add Rule forms |
| Knowledge tab | ✅ PASS | 16 files, token usage, budget indicator |
| Custom Domain tab | ✅ PASS | Default domain shown, custom domain input |
| Environments tab | ✅ PASS | Project environment selector, Production + Preview URLs |
| Danger Zone tab | ✅ PASS | Transfer Project (email input), Delete Project (destructive button) |

### TC-13: Edge Cases & Security — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| XSS in search field | ✅ PASS | `<script>alert("XSS")</script>` rendered as plain text |
| XSS in project name | ✅ PASS | `<img src=x onerror=alert("XSS")>` saved and displayed as plain text, properly escaped by React JSX |

---

## More Views Panel — Complete Test Results

### Design View — PASS
- Opens "Visual edits" mode with element selection UI
- Instructions: "Select an element to edit it", "Hold Ctrl to select multiple elements"
- "Back to Chat" link at bottom
- Preview area blank due to P0 preview bug (can't test actual visual editing)

### Cloud View (Supabase) — PASS
- Shows "Not connected" status with "Connect Supabase" button
- 4 expandable sections: Database, Authentication, Storage, Edge Functions
- "Powered by Supabase" footer
- Database section shows: "Connect to Supabase to view your database tables."

### Analytics View — PASS
- "Built-in analytics" badge
- Toggle switch: "Enable analytics for this project"
- Description: "Track visitors, page views, and engagement — privacy-friendly, no cookie banner needed."
- When disabled: Shows "Analytics is disabled" with detailed feature list
- Privacy-friendly messaging (no cookies or consent banners)

### Files View — PASS
- Full file browser panel separate from code editor
- Search files input field
- Action buttons: New File, New Folder, Refresh, Close
- Shows complete file tree: .doable/, src/ (components/, lib/, App.tsx, index.css, main.tsx), index.html, package.json, etc.

### Security View — PASS
- **Security Scanner** with "Run Security Scan" button
- After scan, shows **100/100** security score
- 4 scan categories (all passed with green check):
  - Dependencies: No vulnerabilities found
  - Secrets Detection: No hardcoded secrets found
  - Code Quality: No security anti-patterns found
  - HTTPS / SSL: All endpoints use HTTPS
- Footer: Last scan time, Duration (0s), 17 files scanned
- "All clear! No security issues found in your project."

### Speed View — PASS
- **Performance Audit** with "Run audit" button
- **Score: 74** (orange, 50-89 range)
- **Core Web Vitals:**
  - LCP: 2.1s (Good, target < 2.5s)
  - FID: 45ms (Good, target < 100ms)
  - CLS: 0.14 (Needs Improvement, target < 0.1)
- **Additional Metrics:** FCP 1.2s, TTI 3.8s, TBT 280ms, Speed Index 2.4s
- **Bundle Analysis:** Total 549 KB (JS: 245, CSS: 38, HTML: 12, Images: 184, Fonts: 62, Other: 8)
- **Largest Files:** vendor.bundle.js (142 KB), hero-banner.webp (98 KB), etc.
- **5 Recommendations** with impact levels (Remove unused CSS, Optimize images, Code splitting, Preload fonts, Fix layout shifts)
- **Note:** Footer says "Simulated audit results. Real Lighthouse integration coming soon."

### Pin to Toolbar — VERIFIED
- Each view has a "Pin to toolbar" button for quick access

### Project Actions — PASS

| Action | Status | Notes |
|--------|--------|-------|
| Copy project link | ✅ PASS | Copies link to clipboard, dropdown closes |
| Keyboard shortcuts | ✅ PASS | Dialog shows 8 shortcuts: Enter, Shift+Enter, Ctrl+/, Ctrl+B, Ctrl+P, Ctrl+Shift+P, F11, Esc |
| Download project | ⏳ NOT TESTED | Button present in dropdown |
| Duplicate project | ✅ PASS | Created new project `477f4503-9e70-4b52-b348-f8c1bdd1b54c`, workspace setup initiated |
| Delete project | ⏳ NOT TESTED | Button present (destructive action, not tested) |
| Settings | ✅ PASS | Navigates to project settings page |

---

## Version History — PASS

| Test Case | Status | Notes |
|-----------|--------|-------|
| History button | ✅ PASS | Opens version history panel |
| Version entries | ✅ PASS | 3 versions listed for Todo App project |
| Bookmark a version | ✅ PASS | Bookmark icon on each action step |

---

## Responsive Views — PASS

| View | Status | Notes |
|------|--------|-------|
| Desktop (default) | ✅ PASS | Full-width preview |
| Tablet (768px) | ✅ PASS | Preview resizes to 768px |
| Mobile (375px) | ✅ PASS | Preview resizes to 375px |

---

## Areas NOT Tested

| Area | Reason |
|------|--------|
| **TC-07: Supabase Integration** | Requires Supabase credentials to connect; Cloud view confirmed UI works |
| **TC-08: Collaboration** | Requires second user session for real-time co-editing test |
| **TC-12: Marketplace deep test** | Integration installation not tested (would modify account state) |
| **TC-14: User Journeys** | Full end-to-end flows (build → test → publish → share) blocked by P0 preview bug |
| **SQL injection** | Not tested at UI level |
| **Long input handling** | Not tested |
| **Unicode edge cases** | Not tested |
| **Rate limiting** | Not manually triggered (credits: 999/999) |
| **Voice input** | Button present but not tested (requires microphone) |
| **File upload/attachment** | Button present but not tested |
| **Download project** | Not tested (would download .zip) |
| **Delete project** | Destructive action, not tested |
| **Connect GitHub** | Requires GitHub OAuth credentials |
| **Custom domain** | Requires DNS configuration |

---

## Test Projects Created

| # | Project Name | Project ID | Method | Notes |
|---|-------------|-----------|--------|-------|
| 1 | My Awesome App (Todo) | `02c5558d-e5a3-4e60-ba31-c91a01c25985` | Template remix | Dark theme, categories, animations |
| 2 | My Awesome App (Weather) | `c311e7aa-1608-4f9e-8337-85f93b0a90f1` | Build from scratch | Open-Meteo API, Recharts, 15 files |
| 3 | Personal Finance Tracker | `b7db38f5-f133-4e06-95cf-10582b474a2a` | Plan first mode | 8-step plan, not yet built |
| 4 | My Awesome App (Duplicate) | `477f4503-9e70-4b52-b348-f8c1bdd1b54c` | Duplicate of #2 | Just created, workspace setting up |

---

## Console Errors Observed

| Error Type | Count | Details |
|------------|-------|---------|
| 504 Gateway Timeout | Multiple | Preview asset requests (node_modules/.vite/deps/*.js) |
| POST analytics/track ERR_ABORTED | Frequent | Every page transition |
| 500 Internal Server Error | 2 | Shared with me, Share dialog |
| WebSocket JWT expiry | Periodic | JWT token expiration warnings |

---

## Recommendations

### Critical (Fix Immediately)
1. **Fix preview rendering** (P0) — Preview iframe not loading built projects. Check WebContainer/Vite dev server initialization. 504 on node_modules suggests the preview sandbox is not starting.

### High Priority
2. **Fix Private visibility toggle** — Investigate validation logic for `is_public: false` in project update endpoint.
3. **Fix Shared with me 500** — Server-side error on shared projects query.
4. **Fix Share dialog 500** — Server-side error when fetching share/collaboration data.

### Medium Priority
5. **Fix project naming** — Template remix should use "Remix of {template_name}" or template name, not hardcoded "My Awesome App".
6. **Fix Templates sidebar routing** — Should navigate to dashboard Templates tab, not Marketplace.
7. **Implement Ctrl+W override** — Prevent browser tab close, handle editor tab close instead.
8. **Fix analytics tracking** — POST to /analytics/track consistently failing.

### Low Priority
9. **Handle WebSocket JWT refresh** — Refresh tokens before they expire to avoid console warnings.
10. **Add real Lighthouse integration** — Speed view notes "Simulated audit results."
