# TC-07: Integrations & Supabase

## 7.1 Integration Catalog (P1)

### TC-7.1.1 — View integration catalog
- **Steps**: In editor, open integrations panel (or navigate to Marketplace).
- **Expected**: Available integrations listed: Supabase, Firebase, MongoDB, GitHub, Stripe, etc. Each with icon, name, description.

### TC-7.1.2 — Search integrations
- **Steps**: Search for "supabase" in catalog.
- **Expected**: Supabase integration shown. Search works correctly.

### TC-7.1.3 — Integration detail sheet
- **Steps**: Click on an integration card.
- **Expected**: Detail panel opens with description, features, setup instructions, pricing info (if any).

## 7.2 Supabase Integration (P0)

### TC-7.2.1 — Connect Supabase
- **Steps**: In integrations panel, click "Connect" on Supabase → provide Supabase URL and anon key → confirm.
- **Expected**: Connection established. Status shows "Connected". Supabase tools become available to AI.

### TC-7.2.2 — Supabase auto-provisioning
- **Steps**: If Supabase provision dialog is available, click "Provision new project".
- **Expected**: Provisioning wizard guides through creating a new Supabase project. On completion, connection auto-configured.

### TC-7.2.3 — Build app with Supabase
- **Steps**: With Supabase connected, send: "Build a task tracker app that stores tasks in Supabase. Create the tasks table with columns: id, title, description, status, created_at."
- **Expected**: AI creates Supabase table (via tool call or SQL). Generates React code with Supabase client. CRUD operations work in preview.

### TC-7.2.4 — Supabase CRUD in preview
- **Steps**: In the task tracker preview:
  1. Create a task → verify it appears.
  2. Update task title → verify change persists.
  3. Mark task complete → status changes.
  4. Delete task → task removed.
- **Expected**: All CRUD operations work. Data persists in Supabase (refresh page → data still there).

### TC-7.2.5 — Supabase real-time
- **Steps**: "Add real-time updates to the task tracker using Supabase subscriptions."
- **Expected**: Changes reflect instantly without refresh. Multiple browser tabs show same data.

### TC-7.2.6 — Supabase auth integration
- **Steps**: "Add user authentication to the app using Supabase Auth. Include login, signup, and logout."
- **Expected**: Auth flows generated. API calls to Supabase Auth. Protected routes/pages.

### TC-7.2.7 — Disconnect Supabase
- **Steps**: In integrations panel, click "Disconnect" on Supabase.
- **Expected**: Connection removed. Supabase tools no longer available.

## 7.3 Building DB-backed Apps (P0)

### TC-7.3.1 — Todo app with persistence
- **Steps**: "Build a todo list app with Supabase backend. Store todos with title, completed, and due date."
- **Expected**: Todo app functional. Creates table in Supabase. Add/toggle/delete todos. Data persists.

### TC-7.3.2 — Blog platform with Supabase
- **Steps**: "Build a blog platform where users can create posts with title, content, and tags. Store in Supabase."
- **Expected**: Blog posts CRUD works. Posts stored in Supabase. List/detail views.

### TC-7.3.3 — CRM with Supabase
- **Steps**: "Build a CRM system with contacts, deals, and activities. Use Supabase for storage."
- **Expected**: CRM pages for contacts, deals, activities. CRUD operations. Relational data works.

### TC-7.3.4 — Inventory tracker
- **Steps**: "Build an inventory management system with products, categories, and stock levels using Supabase."
- **Expected**: Product management. Category filtering. Stock level tracking.

## 7.4 Other Integrations (P2)

### TC-7.4.1 — GitHub integration
- **Steps**: Click GitHub button in editor toolbar → connect repo → push code.
- **Expected**: GitHub OAuth flow. Repo connected. Code pushed successfully.

### TC-7.4.2 — GitHub import
- **Steps**: On dashboard, click "Import project" → enter GitHub repo URL.
- **Expected**: Project imported. Files from repo visible in editor. Preview works.

### TC-7.4.3 — GitHub sync
- **Steps**: After connecting GitHub, make code changes → push.
- **Expected**: Changes committed and pushed to GitHub. Commit history shows in GitHub.

## 7.5 Integration Connection Status (P1)

### TC-7.5.1 — Connection health check
- **Steps**: After connecting an integration, check status indicators.
- **Expected**: Green/healthy status when connected. Shows "Connected" or similar. Health badge visible.

### TC-7.5.2 — Expired credentials
- **Steps**: If integration token expires, observe behavior.
- **Expected**: Status changes to "Disconnected" or "Expired". Prompt to re-authenticate. Auto-refresh attempted.

### TC-7.5.3 — Multiple integrations
- **Steps**: Connect Supabase AND GitHub to the same project.
- **Expected**: Both shown as connected. Both functional independently. No conflicts.
