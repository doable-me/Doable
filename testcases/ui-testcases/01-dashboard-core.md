# TC-01: Dashboard Core & Navigation

## 1.1 Dashboard Load & Layout (P0)

### TC-1.1.1 — Dashboard initial load
- **Steps**: Navigate to `http://localhost:3000/dashboard`
- **Expected**: Greeting shows "Dream it. Do it, {name}?" with user's name. Sidebar visible. Project grid loads. Credits counter shows `X/999`.
- **Verify**: No JS errors in console. No failed API calls.

### TC-1.1.2 — Sidebar navigation items present
- **Steps**: Check sidebar for all expected items
- **Expected**: Home, Search (⌘K), Templates, Discover, Marketplace, All projects (count), Starred, Created by me, Shared with me, Import project, Recent section, Folders section, User profile at bottom.

### TC-1.1.3 — Sidebar collapse/expand
- **Steps**: Look for collapse button on sidebar. Click to collapse, click to expand.
- **Expected**: Sidebar toggles between full and icon-only mode. State persists across page navigation.

### TC-1.1.4 — Workspace switcher
- **Steps**: Click workspace name in sidebar (e.g., "Godwin Josh's workspace"). 
- **Expected**: Dropdown shows all workspaces. Selecting a different workspace reloads projects.

### TC-1.1.5 — Credits display
- **Steps**: Observe "Credits today" counter in sidebar.
- **Expected**: Shows current/total (e.g., 999/999). Never shows values >999. Updates after AI chat usage.

### TC-1.1.6 — User profile menu
- **Steps**: Click user avatar/name at bottom of sidebar ("GJ Godwin Josh").
- **Expected**: Menu shows user name, email, links to Settings, Billing, Logout. No admin-only items visible to non-admins (unless user IS admin).

## 1.2 Project List & Views (P0)

### TC-1.2.1 — Grid view (default)
- **Steps**: On dashboard, observe default project layout.
- **Expected**: Projects displayed as cards in a grid. Each card has thumbnail, title, last modified time, status badge. Hover shows action buttons (star, share, more).

### TC-1.2.2 — List view toggle
- **Steps**: Click "List view" button (table icon) in the top-right area.
- **Expected**: Projects switch to table rows. Columns: name, status, last modified, more actions.

### TC-1.2.3 — Grid view toggle back
- **Steps**: Click "Grid view" button (grid icon).
- **Expected**: Returns to card grid layout.

### TC-1.2.4 — View persistence
- **Steps**: Switch to list view → navigate to Templates → go back to Home.
- **Expected**: View preference persists (still list view).

## 1.3 Project Filtering & Tabs (P0)

### TC-1.3.1 — "Recently viewed" tab
- **Steps**: Click "Recently viewed" tab on dashboard.
- **Expected**: Shows projects ordered by most recently opened/viewed.

### TC-1.3.2 — "My projects" tab
- **Steps**: Click "My projects" tab.
- **Expected**: Shows only projects created by the current user.

### TC-1.3.3 — "Templates" tab
- **Steps**: Click "Templates" tab on main dashboard area.
- **Expected**: Shows template cards. Categories visible.

### TC-1.3.4 — Search projects
- **Steps**: Type a project name in the search box (e.g., "Todo").
- **Expected**: Projects filter in real-time. Only matching projects shown. Clear search → shows all.

### TC-1.3.5 — Status filter dropdown
- **Steps**: Click "All status" dropdown.  
- **Expected**: Shows options: All status, Draft, Published, Building, Error. Selecting a status filters projects.

### TC-1.3.6 — Starred filter toggle
- **Steps**: Click "Starred" toggle button.
- **Expected**: Shows only starred projects. Toggle again to show all.

## 1.4 Sidebar Project Filters (P1)

### TC-1.4.1 — "All projects" with count
- **Steps**: Click "All projects" in sidebar.
- **Expected**: Badge shows total count (e.g., "175"). Project list shows all projects in main area.

### TC-1.4.2 — "Starred" sidebar
- **Steps**: Click "Starred" in sidebar.
- **Expected**: Dashboard shows only starred/favorited projects.

### TC-1.4.3 — "Created by me" sidebar
- **Steps**: Click "Created by me" in sidebar.
- **Expected**: Dashboard shows only projects where the current user is the creator.

### TC-1.4.4 — "Shared with me" sidebar
- **Steps**: Click "Shared with me" in sidebar.
- **Expected**: Shows projects shared by other users. If none shared, shows empty state with appropriate message.

### TC-1.4.5 — "Import project" sidebar
- **Steps**: Click "Import project" in sidebar.
- **Expected**: Opens import dialog (GitHub import, file upload, or URL).

## 1.5 Search (P1)

### TC-1.5.1 — Global search (⌘K)
- **Steps**: Press Ctrl+K (or click Search in sidebar).
- **Expected**: Search modal/overlay appears. Type query → results shown from all projects. Click result → navigate to that project.

### TC-1.5.2 — Search empty state
- **Steps**: Search for a nonexistent term like "xyznonexistent123".
- **Expected**: Shows "No results found" or similar empty state. No errors.

### TC-1.5.3 — Search result click
- **Steps**: Search for a known project name → click on the result.
- **Expected**: Navigates to the editor for that project.

## 1.6 Recent Projects (P1)

### TC-1.6.1 — Recent projects in sidebar
- **Steps**: Check "Recent" section in sidebar.
- **Expected**: Shows up to 5 most recently accessed projects with initials and truncated names.

### TC-1.6.2 — Click recent project
- **Steps**: Click a project in the Recent section.
- **Expected**: Navigates to editor for that project. Project moves to top of "Recently viewed" list.

## 1.7 Folders (P2)

### TC-1.7.1 — View folders
- **Steps**: Check "Folders" section in sidebar.
- **Expected**: Shows existing folders (e.g., "test"). "Create folder" button visible.

### TC-1.7.2 — Create folder
- **Steps**: Click "Create folder" button → enter name → confirm.
- **Expected**: New folder appears in sidebar. Can be expanded/collapsed.

### TC-1.7.3 — Move project to folder
- **Steps**: On a project card, use more actions → "Move to folder" (or drag).
- **Expected**: Project moves into the selected folder. Appears under that folder in sidebar.

### TC-1.7.4 — Delete folder
- **Steps**: Right-click folder → Delete.
- **Expected**: Folder deleted. Projects inside may return to root or get warning.

## 1.8 Project Card Actions (P1)

### TC-1.8.1 — Star/unstar project
- **Steps**: Hover over project card → click star icon.
- **Expected**: Star toggles (filled/unfilled). Project appears/disappears from "Starred" list.

### TC-1.8.2 — Share project quick action
- **Steps**: Hover over project card → click share icon.
- **Expected**: Opens share dialog with link sharing options and collaborator management.

### TC-1.8.3 — More actions menu
- **Steps**: Hover over project card → click three-dots menu.
- **Expected**: Shows: Edit, Duplicate, Move to folder, Delete, Share, View settings.

### TC-1.8.4 — Delete project from card
- **Steps**: More actions → Delete → Confirm.
- **Expected**: Confirmation dialog appears. After confirm, project removed from list. Cannot be undone.

### TC-1.8.5 — Duplicate project
- **Steps**: More actions → Duplicate.
- **Expected**: Creates a copy of the project with "(Copy)" suffix. New project appears in list.

### TC-1.8.6 — Open project by clicking card
- **Steps**: Click on a project card (not on action buttons).
- **Expected**: Navigates to editor page `/editor/{projectId}`.

## 1.9 Dashboard Performance (P2)

### TC-1.9.1 — Dashboard load time
- **Steps**: Hard refresh dashboard (Ctrl+Shift+R). Measure time to project list render.
- **Expected**: Dashboard loads within 3 seconds. Projects visible within 5 seconds.

### TC-1.9.2 — Large project list scroll
- **Steps**: With 100+ projects, scroll through the list.
- **Expected**: Smooth scrolling. No jank. Lazy loading or pagination if applicable.

### TC-1.9.3 — API response times
- **Steps**: Open Network tab → reload dashboard.
- **Expected**: `/projects` API responds in <500ms. No requests take >5s.
