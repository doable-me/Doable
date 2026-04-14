# E2E Test Results — dev.doable.me

**Date:** 2026-04-14  
**Tester:** Automated (Test Admin — testadmin@doable.me)  
**Environment:** dev.doable.me (dodev.fid.pw)  
**Workspace:** Godwin Josh's workspace (with Copilot account `computersrmyfriends`)

---

## Bugs Found & Fixed This Session

### BUG-11: Projects created from dashboard don't pass workspaceId (FIXED)
- **Severity:** High
- **Commit:** f4f45e5
- **Issue:** When creating a project via the dashboard prompt, `use-dashboard.ts`, `use-template-dialog.tsx`, and `import-github-project-dialog.tsx` didn't pass `workspaceId` to `apiCreateProject()`. The API fell back to the user's first workspace — if that workspace had no Copilot account, AI failed with "Session was not created with authentication info."
- **Fix:** Read `localStorage.getItem("doable_active_workspace_id")` and pass as `workspaceId` in all three callers.

### BUG-12: Dashboard project list doesn't pass workspaceId (FIXED)
- **Severity:** High
- **Commit:** 48838eb
- **Issue:** `fetchProjects()` and `fetchRecentlyViewed()` in `use-dashboard.ts`, plus sidebar `apiListProjects()` calls in `sidebar.tsx`, didn't pass the active workspace ID. The API fell back to user's first workspace, so projects from the selected workspace didn't appear.
- **Fix:** Pass `localStorage.getItem("doable_active_workspace_id")` as `workspaceId` to `apiListProjects()` and `apiListRecentlyViewed()`. Also added `workspaceId` param to `apiListRecentlyViewed()` in `api-projects.ts`.

### BUG-13: Workspace switch doesn't refresh project list (NOT FIXED — Minor)
- **Severity:** Low
- **Issue:** Switching workspaces via sidebar dropdown changes localStorage and sidebar label, but the dashboard's project list doesn't re-fetch. Requires page reload to see correct projects. The `fetchProjects` callback reads `workspaceId` from localStorage but doesn't re-run when localStorage changes.
- **Workaround:** Reload the page after switching workspaces.

---

## Test Results Summary

| Area | Status | Notes |
|------|--------|-------|
| Login (email/password) | ✅ PASS | testadmin@doable.me, testuser@doable.me both work |
| Dashboard — navigation | ✅ PASS | Home, Search, Templates, Discover, Marketplace all navigate |
| Dashboard — project listing | ✅ PASS | After fix, shows correct projects per workspace |
| Dashboard — project cards | ✅ PASS | Thumbnails, titles, timestamps, status badges |
| Dashboard — sidebar | ✅ PASS | Recent projects, folders, workspace info, credits |
| Dashboard — search | ✅ PASS | Search bar present and functional |
| AI Chat — project creation | ✅ PASS | "Build a counter app" → project created with working AI |
| AI Chat — follow-up messages | ✅ PASS | "Add more features" → AI generated custom step, min/max, color, keyboard shortcuts, history log |
| AI Chat — thought process | ✅ PASS | Expandable thought process section |
| AI Chat — suggested actions | ✅ PASS | "Improve styling", "Add responsive design", "Add more features", "Fix any issues" |
| AI Settings inheritance | ✅ PASS | Test users inherit Copilot account from Godwin's workspace |
| Code Editor (Monaco) | ✅ PASS | File explorer, syntax highlighting, line numbers, tabs |
| Preview — Desktop | ✅ PASS | Live preview renders and updates |
| Preview — Tablet (768px) | ✅ PASS | Responsive view works |
| Preview — Mobile (375px) | ✅ PASS | App renders at mobile width |
| Version History | ✅ PASS | 3 versions shown with diffs, timestamps, commit hashes, restore/diff buttons |
| Share dialog | ✅ PASS | Collaboration link, preview URL, embed code, toggle |
| Templates tab | ✅ PASS | Template cards with "Official" badges, "Browse all" link |
| Discover page | ✅ PASS | "No community projects" placeholder, search, tabs |
| Marketplace | ✅ PASS | Category tabs, search, sort (Popular/Newest/Rating) |
| Settings — Profile | ✅ PASS | Display name, email, Security section |
| Admin — Feature Flags | ✅ PASS | AI Chat, AI Settings, Analytics, Billing, Code Editor, Connectors |
| Admin — Users | ✅ PASS | 8 users with roles, plans, Copilot info |
| Admin — Copilot Sessions | ✅ PASS | 0/20 engines, RSS, Heap, Uptime metrics |
| Workspace switcher | ⚠️ PARTIAL | Dropdown works, but project list doesn't refresh without reload (BUG-13) |

---

## Test Users

| User | Email | Password | Role | Workspace |
|------|-------|----------|------|-----------|
| Test Admin | testadmin@doable.me | Test@dmin2026! | Platform Admin | Member of Godwin Josh's workspace |
| Test User | testuser@doable.me | Test@user2026! | User | Member of Godwin Josh's workspace |

## Commits

| Hash | Description |
|------|-------------|
| f4f45e5 | fix: pass active workspaceId when creating projects from dashboard |
| 48838eb | fix: pass active workspaceId when listing projects on dashboard and sidebar |
