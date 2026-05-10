# Chrome Browser Sweep — env1 — 2026-05-10
**Tester:** Claude Code (master, Opus 4.7) via Chrome MCP
**Target:** https://zantaz.doable.me / https://zantaz-api.doable.me
**Account:** qa-owner (platform admin), with role-switches via JWT injection for RBAC tests

| TC ID | Path | Action | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC-AUTH-LOGIN-FORM | /login | Render | email + password + Sign in + GitHub + Google buttons present | All present | PASS |
| TC-AUTH-SIGNUP-FORM | /signup | Render | email + password + submit + h1 "Create your account" | h1 = "Create your account", inputs present | PASS |
| TC-AUTH-FORGOT-FORM | /forgot-password | Render | email input + submit | Both present | PASS |
| TC-AUTH-LOGIN-SUBMIT | /login → /dashboard | Fill qa-owner creds + form.requestSubmit() | Redirect to /dashboard, doable_auth_user populated | URL=/dashboard, user=qa-owner@doable.test | PASS |
| TC-WEB-DASHBOARD | /dashboard | Render | h1 personalised, "All projects" tab, New project button | h1="Let's make it Doable, QA?", "All projects 4", New project button present | PASS |
| TC-WEB-NEW-PROJECT-CLICK | /dashboard | Click New project button | Modal opens with form | Click registered, modal shows "Create a new project" | PASS |
| TC-WEB-NEW-PROJECT-MODAL | /dashboard | Inspect modal | Blank/From prompt/Template options + Framework + Name/Slug/Description + Cancel/Create | All fields present + Framework=React (Vite) | PASS |
| TC-EDITOR-CONTROLS | /editor/:id | Render | iframe preview + Share/Deploy/Design View buttons + Ask Doable chat | iframe src=zantaz-api.../preview/, controls + chat all present | PASS |
| TC-ADMIN-LANDING | /admin | Render (qa-owner) | "System Administration" h1 + 8 subnav tabs | h1 + Feature Flags / Users & AI / Integrations / Plans / AI Tools / Thumbnails / Sessions / Email | PASS |
| TC-ADMIN-PROJECTS-PAGE | /admin/projects | Render | h1 "All Projects (N)" + table | h1="All Projects (37)", 37 rows | PASS |
| TC-ADMIN-AUDIT-PAGE | /admin/audit | Render | h1 + search form + session count | h1="Prompt & conversation audit", search form, 27 sessions | PASS |
| TC-ADMIN-CHAT-PAGE | /admin/chat | Render | h1 "Chat Sessions (N)" + table | h1="Chat Sessions (27)", 27 rows | PASS |
| TC-ADMIN-RUNTIME-PAGE | /admin/runtime | Render | h1 "Runtime" + dev-server table | h1="Runtime", table present, 1 row (live dev-server) | PASS |
| TC-WEB-SETTINGS | /settings | Render | h1 "Settings" + 5 sections | h1="Settings", sections=Profile/Security/Active Sessions/Appearance/Danger Zone | PASS |
| TC-WEB-MARKETPLACE | /marketplace | Render | h1 + categories | h1="Marketplace", 3 categories | PASS |
| TC-WEB-DISCOVER | /discover | Render | h1 + content | h1="Discover", body content present | PASS |
| TC-WEB-ADMIN-INTEGRATIONS | /admin?tab=integrations | Render | Supabase card + Enable buttons | Supabase card present, 532 Enable buttons (Activepieces catalog) | PASS |
| TC-RBAC-MEMBER-ADMIN | /admin (as qa-member) | Render | "Access Denied" or 403 | "Access Denied" text shown | PASS |
| TC-GH-OAUTH-LIVE-INIT | /github/connect | Browser navigate (qa-owner) | 302 → github.com/login/oauth/select_account | Tab on github.com with client_id=Ov23lit7kxbVL6k8Y4Iv, redirect_uri HTTPS, scope `repo read:user` | PASS |

## From earlier session (per-turn DOM + click tests)
| TC ID | Result |
|---|---|
| TC-AI-CHAT-COUNTER-T1 (counter app +1/-1/Reset; 0→3→2→0 click verified) | PASS |
| TC-AI-CHAT-COUNTER-T2 (×2 button; 2→4 click verified) | PASS |
| TC-AI-CHAT-COUNTER-T3 (history list; [4,2,1] verified) | PASS |
| TC-AI-CHAT-COUNTER-T4 (localStorage persist; counter+history survive reload) | PASS |
| TC-AI-CHAT-COUNTER-T5 (max/min badges; max=5, min=0 after sequence) | PASS |
| TC-AI-CHAT-COUNTER-T6 (dark/light toggle; localStorage.theme="dark") | PASS |
| TC-AI-CHAT-PRESENTATION (5 slides; Next click → slide 2 of 5) | PASS |
| TC-AI-CHAT-SPREADSHEET (10×6 grid + Save as CSV) | PASS |
| TC-AI-CHAT-MULTIPAGE (Home/About/Dashboard/Settings nav + 3 feature cards) | PASS |
| TC-AI-CHAT-TODO (textbox + Add + 3 todos rendered: Buy milk/Pay rent/Call mom) | PASS |
| TC-WEB-EDITOR-AI-FLOW-001 (dashboard omnibar → /editor/:id → MiniMax responds) | PASS |

## Totals
- 19 new browser TCs in this sweep
- 11 from earlier session
- **30 PASS / 0 FAIL** browser-driven TCs
- 0 new bugs surfaced in this sweep (all defects were caught in earlier curl-based corpus runs and already filed/fixed)

## RBAC matrix (Chrome-verified)
- qa-owner → /admin → 200 + System Administration ✅
- qa-member → /admin → "Access Denied" ✅
- qa-member → /admin/users (API) → 403 ✅
- qa-member → /admin/projects (API) → 403 ✅
- qa-bob → /:pid/github/status (qa-owner's project) → 404 "Project not found" ✅ (after BUG-CORPUS-GH-001 fix)
- qa-viewer → POST /projects in shared WS → 403 ✅
- qa-viewer → /workspaces/:shared/members → 200 ✅ (read-only allowed)
