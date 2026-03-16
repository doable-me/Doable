# Doable Feature Parity Progress — 2026-03-15

## Overview

This session focused on closing the feature gap between Doable and Lovable.dev. The user assessed Doable at ~25% functional parity. Two waves of parallel worktree agents (17 total) were deployed to build out missing features across the entire stack.

**Starting point**: Basic editor with visual-only buttons, minimal dashboard, no settings page, no code editor, basic chat, stub API endpoints.

**End point**: Full-featured editor with 7 panel views, polished dashboard with folders/search, comprehensive settings, Monaco code editor, enhanced chat with Agent/Plan toggle, version history timeline, and much more.

---

## Wave 1 — Core Feature Build (7 Agents)

### Agent 1: Editor Header & Toolbar
**Files**: `apps/web/src/app/editor/[projectId]/page.tsx`
**Lines added**: +777

- Triple-dots dropdown menu: Settings, Download ZIP, Duplicate, Delete (with confirmation), Copy link, Keyboard shortcuts
- Share dialog: Copy preview URL, visibility toggle (public/private), copy embed code (`<iframe>`)
- Publish modal: Environment selection (Live/Test), build progress indicator (3-step), success state with published URL, error state with "Try to Fix"
- Delete confirmation dialog with loading state
- GitHub connect dialog
- Keyboard shortcuts dialog + global shortcut handler (Ctrl+B, Ctrl+P, F11, Ctrl+/, etc.)
- Fullscreen toggle via Fullscreen API
- Project name editing persists to API

### Agent 2: Dashboard Overhaul
**Files**: `apps/web/src/app/(dashboard)/dashboard/page.tsx`, `apps/web/src/components/dashboard/sidebar.tsx`
**Lines added**: +1,996

- Sidebar: Workspace switcher with plan info + credit bar, Home/Search/Resources nav, All projects (with count)/Starred/Created by me/Shared with me filters
- Folders: Nested folder tree (3+ levels), create/rename/delete with dialogs, projects movable to folders
- Recent projects: Collapsible, shows 5 most recent
- Starred mini-list: Top 3 starred with quick nav
- Main area: Greeting with user name, "Ask Doable to create..." prompt input
- Tabs: Recently viewed, My projects, Templates
- Search: Full-text across project names, Cmd+K shortcut
- Grid/List view toggle (persisted to localStorage)
- Project cards: Thumbnail wireframes, name, relative time, status badge, star toggle, hover actions
- Right-click context menu: Open, Rename, Duplicate, Move to folder, Star/Unstar, Delete
- Bulk actions: Multi-select, Move to folder, Delete
- Template gallery: Searchable with category wireframe previews
- Cross-component event system for sidebar-to-dashboard communication

### Agent 3: Project Settings
**Files**: `apps/web/src/app/(dashboard)/projects/[id]/settings/page.tsx`, `apps/web/src/modules/settings/components/project-settings.tsx`
**Lines added**: +1,341

- 6 tabbed sections:
  1. **General**: Editable name/description, visibility toggle, project info badges
  2. **Integrations Hub**: GitHub live status, Stripe/Supabase placeholders with "Coming Soon"
  3. **Context Files (.doable/)**: All 7 files listed with token budget bar, click-to-edit with Ctrl+S save, character count
  4. **Custom Domain**: Default `.doable.app` subdomain, Pro+ gated custom domain with DNS config table
  5. **Environments**: Production/Preview cards with status, URLs, deploy timestamps
  6. **Danger Zone**: Transfer (email input), Delete (two-step confirmation requiring exact project name match)
- Toast notification system with auto-dismiss
- Loading skeleton, error state, 404 handling

### Agent 4: Monaco Code Editor
**Files**: `apps/web/src/modules/editor/code-editor/monaco-editor-wrapper.tsx` (NEW), `code-editor-panel.tsx`, `page.tsx`
**Lines added**: +751

- Monaco Editor via `@monaco-editor/react` with dynamic import (SSR-safe)
- File tabs: Multiple open files, close button, dirty indicator (purple dot), horizontal scroll
- Language detection: TypeScript, JSX, CSS, HTML, JSON, Markdown, YAML, Python, SQL, Shell
- Auto-save: 1.5s debounce via `PUT /projects/:id/files/:path`
- Ctrl+S: Explicit save, cancels pending autosave
- Ctrl+W: Close current tab
- Minimap toggle
- Read-only mode with "Upgrade to edit" banner
- Breadcrumb showing full file path
- Cache invalidation when AI modifies files
- vs-dark theme with bracket pair colorization, smooth cursor animation

### Agent 5: Version History
**Files**: `apps/web/src/modules/editor/sidebar/version-history.tsx`, `restore-dialog.tsx`, `version-diff-dialog.tsx`
**Lines added**: +1,477

- Google Docs-style timeline with date grouping ("Today", "Yesterday", "March 14")
- Version entries: Timestamp, version number (v5), description, author
- Current version highlighted with badge + primary-colored dot
- Bookmarked versions show amber star, optimistic updates with rollback
- Restore: Confirmation dialog, non-destructive (creates new version), loading state
- Diff viewer: File sidebar with colored type icons (FilePlus2/FileX2/FileEdit)
  - Unified view with dual line numbers, colored +/- indicators
  - Side-by-side view with Before/After panels
  - LCS-based diff engine with fallback for large files
  - Diff stats bar (+N / -M with visual blocks)
  - File navigation with Prev/Next buttons + keyboard shortcuts (Cmd+[/])
- Pagination with "Load older versions" showing remaining count
- Saved/All filter tabs

### Agent 6: API Backend Enhancement
**Files**: 8 files in `services/api/src/`
**Lines added**: +352

- Fixed chat auth: `optionalAuthMiddleware` extracts real userId from JWT (was hardcoded "anonymous")
- Added `POST /projects/:id/download` — ZIP download using Node.js built-in `zlib` (zero-dependency ZIP builder)
- Fixed Doable Cloud deploy adapter: slug sanitization, directory validation, post-copy verification
- Enhanced CORS: Allows any localhost port via regex, all origins in non-production
- Enhanced health check: DB connectivity with latency, memory usage (RSS/heap), active dev server count
- Added `PUT /projects/:id` alongside existing `PATCH`

### Agent 7: Auth Flow Enhancement
**Files**: 9 files in `apps/web/src/app/(auth)/` and `(dashboard)/`
**Lines added**: +1,668

- Login page: Password visibility toggle, "Remember me" (localStorage), OAuth loading states per provider, improved error display
- Signup page: Password strength checklist (8+ chars, uppercase, lowercase, number, special), email validation on blur, terms checkbox, password match indicator
- OAuth callback: Animated Doable logo spinner, progressive status messages, error state with retry
- Forgot password page (NEW): Email form, success state with "Check your email" message
- Reset password page (NEW): Token validation, password form with strength indicator, success state
- User settings page (NEW): Profile (name/avatar), Security (change password, 2FA placeholder), Sessions (active sessions with revoke), Appearance (Light/Dark/System theme), Danger Zone (delete account with type-to-confirm)
- Dashboard sidebar: Navigate to `/settings` and `/billing`
- API helpers: `apiForgotPassword()`, `apiResetPassword()`

---

## Wave 2 — Deep Feature Build (10 Agents)

### Agent 8: Chat Overhaul
**Files**: `apps/web/src/app/editor/[projectId]/page.tsx`
**Lines added**: +404

- Task cards: Collapsible with header (task title or "N file changes"), Details tab (file changes with color-coded dots), Preview tab (placeholder)
- Bookmark toggle on task cards
- Message actions: Thumbs up/down with visual feedback (green/red), Copy with checkmark, More (...) dropdown with "Edit message" and "Revert to this point"
- Suggestion chips: Context-aware (`generateSuggestions()` analyzes AI response), horizontally scrollable, clicking sends as new message
- Agent/Plan mode toggle: Segmented control with Bot/ClipboardList icons, purple/blue highlights
- Stop generation: Floating "Stop Doable" button during streaming + send button transforms to stop
- "Back to Chat" navigation when viewing panels

### Agent 9: Code Panel
**File**: `apps/web/src/modules/editor/panels/code-panel.tsx` (NEW, 792 lines)

- File tree sidebar (250px): "Search code" input, hierarchical tree from flat API response, expandable folders, file type icons with color coding
- Monaco editor: Dynamic import, file tabs with close/dirty indicators, vs-dark theme, Ctrl+S save
- Header: "Code" title, "Read only" badge, Upgrade button, copy/download actions, close button
- Search filtering with parent folder expansion
- Loading/error/empty states

### Agent 10: Design Panel
**File**: `apps/web/src/modules/editor/panels/design-panel.tsx` (NEW, 641 lines)

- Visual edits card with selection mode toggle (crosshair animation, pulsing indicator)
- Selected element info (tag name badge, classes in monospace)
- Property editors (all collapsible): Text content, Background/text color pickers, Typography (font size slider, weight dropdown), Spacing (4-side T/R/B/L for padding + margin), Border radius
- AI prompt preview: Live-computed prompt string as properties change
- "Apply changes" sends prompt via `onSendMessage`, "Reset changes" reverts
- Placeholder interactivity (actual iframe `postMessage` is future work)

### Agent 11: Files Panel
**File**: `apps/web/src/modules/editor/panels/files-panel.tsx` (NEW, 1,105 lines)

- Full file tree with expandable folders, depth indentation, file type icons with color coding
- Right-click context menu: New File, New Folder, Rename, Delete, Copy Path (different menus for files vs folders)
- Drag and drop to move files between folders
- Create file dialog: Path input, auto-generated template content based on extension
- Create folder dialog: Name input, creates `.gitkeep` inside
- Inline rename: Input field replacing file name
- Delete confirmation dialog
- Search: Filters tree recursively, auto-expands matching paths
- File info bar: Name, type label, size, full path
- All operations use real API endpoints

### Agent 12: Cloud Panel
**File**: `apps/web/src/modules/editor/panels/cloud-panel.tsx` (NEW, 1,069 lines)

- Connection status bar with green/gray dot
- Database section: Table list with row counts, expandable schema viewer (columns with types), SQL query runner with results
- Authentication section: User count, auth providers with toggle switches, recent signups
- Storage section: Usage bar with color thresholds, bucket list with public/private badges, drop-to-upload area
- Edge Functions section: Functions list with active/inactive status, last invoked timestamps, create button
- Connection dialog: Supabase URL/anon key/service role key inputs, test connection, save & connect
- "Powered by Supabase" footer with pulse indicator
- Persists connection to API via context files

### Agent 13: Analytics Panel
**File**: `apps/web/src/modules/editor/panels/analytics-panel.tsx` (NEW, 677 lines)

- Header with "Built-in analytics — no setup required" badge, 7d/30d/90d toggle
- Enable analytics toggle with privacy description
- 4 overview cards: Total Visitors, Page Views, Avg. Session Duration, Bounce Rate — with trend arrows
- Traffic chart: Pure SVG line chart with purple gradient fill, hover tooltip, date labels, Visitors/Page Views toggle
- Top pages table: 6 pages, 4 sortable columns (path, views, unique visitors, avg time)
- Referrers section: 6 traffic sources with type badges and percentage bars
- Device breakdown: CSS conic-gradient donut chart (Desktop 62%, Mobile 31%, Tablet 7%)
- All charts pure CSS/SVG, zero external libraries

### Agent 14: Security Panel
**File**: `apps/web/src/modules/editor/panels/security-panel.tsx` (NEW, 841 lines)

- Security score: SVG circular progress (0-100), color-coded (green/amber/red)
- Scan results: 2x2 card grid (Dependencies, Secrets, Code Quality, HTTPS) with status indicators
- Vulnerability list: 5 mock vulnerabilities with severity badges (CRITICAL/HIGH/MEDIUM/LOW), expandable details, "Fix" button sends AI prompt
- Secrets scanner: 3 findings with file path + line number, code preview, "Move to .env" button sends AI prompt
- Scanning animation: Multi-phase progress bar with phase names and checkmarks
- Empty state before first scan with CTA button
- Last scan info: Timestamp, duration, files scanned

### Agent 15: Speed Panel
**File**: `apps/web/src/modules/editor/panels/speed-panel.tsx` (NEW, 895 lines)

- Performance score: CSS circular gauge with animated count-up
- Core Web Vitals: 3 cards (LCP 2.1s, FID 45ms, CLS 0.14) with ratings and target thresholds
- Additional metrics: 2x2 grid (FCP, TTI, TBT, Speed Index) with bar indicators
- Bundle analysis: Total size, multi-segment colored bar chart, legend, largest files list with size bars, tree-shaking suggestion
- Recommendations: 5 expandable items with impact levels and "Fix with AI" buttons
- Audit animation: 4 phases (Loading page, Analyzing performance, Checking accessibility, Generating report)
- All CSS-only charts and gauges

### Agent 16: View Router
**Files**: `apps/web/src/app/editor/[projectId]/page.tsx` + 7 stub files
**Lines added**: +244

- Dynamic imports for all 7 panel components with `next/dynamic` SSR-safe loading
- Extended `ActiveTab` type: added `"files" | "security" | "speed"`
- `PANEL_TABS` constant and `MORE_MENU_ITEMS` array
- Pin toggle: `loadPinnedItems`/`savePinnedItems` with localStorage persistence
- Pinned items rendered as toolbar icons
- More dropdown with active highlighting and pin/unpin toggles
- "Back to Chat" button between chat messages and input when panel is active
- Panel rendering based on `activeTab` with proper `onClose` wiring
- Resize handle works for chat + panel split

### Agent 17: Sidebar Enhancement
**Files**: `pages-tab.tsx` (NEW), `file-tree.tsx`, `knowledge-tab.tsx`, `editor-sidebar.tsx`
**Lines added**: +1,292

- **Pages tab**: Parses file tree for `src/pages/` directory, derives route paths, click navigates preview iframe, active page highlighted, "+ Add" sends AI prompt, search when >3 pages
- **Files tab**: Right-click context menu (Rename/Delete/Copy Path for files, New File/New Folder/Rename/Delete for dirs), inline rename (double-click), delete confirmation dialog, new file/folder at root, file search with filter, all operations use real API
- **Knowledge tab**: Fetches all context files from API with auth, file list with description/last-updated/character count, click-to-edit with inline editor, auto-save (2.5s debounce), Ctrl+S manual save, revert button, "+ Add" dialog for custom knowledge files with validation

---

## Metrics

| Metric | Value |
|--------|-------|
| Total agents deployed | 17 |
| Total new lines of code | ~16,300+ |
| New files created | 15+ |
| Files modified | 30+ |
| Merge commits | 20+ |
| Conflicts resolved | 8 |
| Browser verifications | 10+ screenshots |

## What Was Verified in Browser

- [x] Login page renders with OAuth + email/password + forgot password
- [x] Google OAuth flow works end-to-end (account chooser -> consent -> dashboard)
- [x] Dashboard renders with sidebar, workspace switcher, project cards, tabs, search
- [x] Editor loads with chat, preview, suggestion chips
- [x] Triple-dots menu opens with all 7 items + pin toggles
- [x] Publish modal opens with environment selection
- [x] Share dialog opens with URL copy, visibility toggle, embed code
- [x] Analytics panel renders with full charts, metrics, traffic overview
- [x] "Back to Chat" navigation works
- [x] Agent/Plan mode toggle visible in chat input

## What's Still Needed (Estimated ~40% remaining)

### High Priority
- [ ] Real-time collaboration (WebSocket integration — server exists but not connected in frontend)
- [ ] Actual deployment pipeline to `*.doable.app` (server-side hosting infrastructure)
- [ ] Stripe billing integration (checkout flow, subscription management)
- [ ] GitHub OAuth flow (connect repo, push/pull from UI)
- [ ] Preview auto-refresh after AI code generation (sometimes stale)
- [ ] Mobile/desktop preview toggle (UI exists but needs proper iframe resizing)

### Medium Priority
- [ ] Visual editing (Design panel → preview iframe `postMessage` communication)
- [ ] Real analytics backend (currently mock data)
- [ ] Real security scanning (currently mock data)
- [ ] Real performance auditing (currently mock data)
- [ ] Real Supabase connection in Cloud panel (currently UI-only)
- [ ] Template provisioning (templates exist but don't scaffold with context files)
- [ ] Version history screenshots on hover
- [ ] Email sending for password reset (API endpoint exists, no email transport)

### Lower Priority
- [ ] Custom domains with SSL (Lexicon DNS management)
- [ ] Multi-provider deployment adapters (Vercel, Netlify, Cloudflare Pages)
- [ ] Team collaboration features (invite, roles, shared editing)
- [ ] Community discover/remix features
- [ ] PWA generation
- [ ] Figma import
- [ ] Image-to-code
- [ ] .doable/ context system fully wired into AI prompts
- [ ] Credit system enforcement (currently no limits applied)
