# TC-11: Settings & Workspace Management

## 11.1 User Settings (P1)

### TC-11.1.1 — Navigate to user settings
- **Steps**: Click user avatar at bottom of sidebar → Settings.
- **Expected**: Settings page loads at `/settings`. Sections: Profile, Security, Appearance, Danger Zone.

### TC-11.1.2 — Update display name
- **Steps**: Change display name → save.
- **Expected**: Name updated. Reflected in sidebar, header, chat messages.

### TC-11.1.3 — Update avatar
- **Steps**: Upload new avatar image → save.
- **Expected**: Avatar updated across all UI (sidebar, chat, collaboration presence).

### TC-11.1.4 — Change password
- **Steps**: Go to Security → enter current password → new password → confirm → save.
- **Expected**: Password changed. Old password no longer works. Session stays active.

### TC-11.1.5 — Theme toggle (appearance)
- **Steps**: Change theme: Light → Dark → System.
- **Expected**: Theme applies immediately. Dark mode inverts colors. System follows OS preference.

### TC-11.1.6 — Danger zone — delete account
- **Steps**: Click "Delete account" → read warning → type confirmation.
- **Expected**: Confirmation dialog with strong warning. Account deletion after confirmation. Redirect to landing page.

## 11.2 Workspace Settings (P1)

### TC-11.2.1 — Navigate to workspace settings
- **Steps**: Click workspace name → settings, or navigate to `/workspace-settings`.
- **Expected**: Workspace settings loads. Tabs: General, Members, Knowledge, Danger Zone.

### TC-11.2.2 — Update workspace name
- **Steps**: Change workspace name → save.
- **Expected**: Name updated in sidebar, workspace switcher, and all references.

### TC-11.2.3 — Update workspace description
- **Steps**: Add/change workspace description → save.
- **Expected**: Description saved. Visible to workspace members.

## 11.3 Workspace Members (P1)

### TC-11.3.1 — View members list
- **Steps**: Go to workspace settings → Members.
- **Expected**: All workspace members listed with name, email, role, join date.

### TC-11.3.2 — Invite new member
- **Steps**: Click "Invite" → enter email → select role → send.
- **Expected**: Invitation sent (or error if email invalid). Pending invite shown.

### TC-11.3.3 — Change member role
- **Steps**: Click role dropdown on a member → change from Editor to Viewer.
- **Expected**: Role updated immediately. Member's permissions change.

### TC-11.3.4 — Remove member
- **Steps**: Click remove on a member → confirm.
- **Expected**: Member removed. They lose access to all workspace projects.

### TC-11.3.5 — Invite with different roles
- **Steps**: Invite three users with roles: Admin, Editor, Viewer.
- **Expected**: Each has appropriate permissions. Admin can manage settings, Editor can create/edit, Viewer is read-only.

## 11.4 Workspace Knowledge (P2)

### TC-11.4.1 — Edit workspace knowledge base
- **Steps**: Go to workspace settings → Knowledge.
- **Expected**: Knowledge editor loads. Can add/edit/delete workspace-level knowledge files.

### TC-11.4.2 — Workspace knowledge affects all projects
- **Steps**: Add workspace knowledge: "Company name is Acme Corp. Use brand colors: #4F46E5 and #10B981." → create new project → ask AI about the company.
- **Expected**: AI knows the company name and uses brand colors.

## 11.5 AI Settings (P1)

### TC-11.5.1 — Navigate to AI settings
- **Steps**: Click "AI Settings" in sidebar or navigate to `/ai-settings`.
- **Expected**: AI settings page loads with tabs: Model Config, Providers, Connections, Access Control, Usage.

### TC-11.5.2 — View model configuration
- **Steps**: Go to Model Config tab.
- **Expected**: Current model shown. Configuration options: temperature, system prompt, etc.

### TC-11.5.3 — Add custom provider
- **Steps**: Go to Providers tab → "Add Provider" → configure OpenAI/Anthropic/custom → enter API key → save.
- **Expected**: Provider added. Models from that provider available in model selector.

### TC-11.5.4 — Provider health badge
- **Steps**: After adding a provider, check health indicators.
- **Expected**: Green badge if API key valid and provider responsive. Red/yellow if issues.

### TC-11.5.5 — Set default model
- **Steps**: Go to Model Defaults → select a model → save.
- **Expected**: Default model used for all new sessions. Can be overridden per-project.

### TC-11.5.6 — GitHub account connections
- **Steps**: Go to GitHub Accounts tab. Connect a GitHub account.
- **Expected**: GitHub OAuth flow. Account shows as connected. Repos accessible.

### TC-11.5.7 — View usage analytics
- **Steps**: Go to My Usage tab.
- **Expected**: Usage charts showing token counts, request counts, cost breakdown by day/model.

### TC-11.5.8 — User allocations (admin only)
- **Steps**: Go to Allocations tab (if admin).
- **Expected**: All workspace members shown with credit allocations. Can edit limits.

## 11.6 Workspace Danger Zone (P2)

### TC-11.6.1 — Delete workspace
- **Steps**: Go to Danger Zone → Delete workspace → type confirmation.
- **Expected**: Confirmation required. All projects in workspace deleted. Redirect to default workspace.

## 11.7 Creating New Workspaces (P1)

### TC-11.7.1 — Create workspace
- **Steps**: Open workspace switcher → "Create workspace" → enter name → create.
- **Expected**: New workspace created. Switches to new workspace. Empty project list.

### TC-11.7.2 — Create project in new workspace
- **Steps**: In new workspace, create a project.
- **Expected**: Project created in the new workspace (not the old one).

### TC-11.7.3 — Switch between workspaces
- **Steps**: Switch from workspace A to workspace B and back.
- **Expected**: Project lists update correctly. Context fully switches. No cross-contamination.

## 11.8 Admin Panel (P2)

### TC-11.8.1 — Access admin panel
- **Steps**: Navigate to `/admin` (as platform admin).
- **Expected**: Admin panel loads. User management, ops, feature flags accessible.

### TC-11.8.2 — Manage users
- **Steps**: View user list → grant admin to a user → change plan → adjust credits.
- **Expected**: All operations succeed. Changes reflected immediately.

### TC-11.8.3 — Non-admin access denied
- **Steps**: (As non-admin) try navigating to `/admin`.
- **Expected**: 403 or redirect to dashboard. No admin features accessible.

## 11.9 Billing & Subscription (P2)

### TC-11.9.1 — View billing page
- **Steps**: Navigate to `/billing`.
- **Expected**: Current plan shown. Plan comparison. Upgrade options. Credit balance.

### TC-11.9.2 — View usage page
- **Steps**: Navigate to `/usage`.
- **Expected**: Usage stats loaded. Daily/monthly breakdown. Charts render properly.

## 11.10 Project Settings (P1)

### TC-11.10.1 — Navigate to project settings
- **Steps**: From editor toolbar or project card → Settings.
- **Expected**: Project settings page loads at `/projects/:id/settings`.

### TC-11.10.2 — Rename project
- **Steps**: Change project name → save.
- **Expected**: Name updated in sidebar, dashboard, editor title.

### TC-11.10.3 — Change project visibility
- **Steps**: Toggle visibility public/private → save.
- **Expected**: Visibility changes. Public projects appear in Discover. Private ones don't.

### TC-11.10.4 — Delete project
- **Steps**: In project settings → Delete → confirm.
- **Expected**: Project deleted. Redirect to dashboard. Project removed from all lists.
