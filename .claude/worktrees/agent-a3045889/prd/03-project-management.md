# 03 — Project Management & Dashboard

## Overview

The dashboard is the home screen for all user projects, providing organization, search, templates, and project lifecycle management. It supports workspace-level isolation and team collaboration.

---

## 1. Dashboard Layout

### 1.1 Redesigned Dashboard (v2)
| Element | Description |
|---------|-------------|
| **Sidebar** | Workspace switcher, Recent projects, Starred projects, Folders (nested up to 3 levels), Community discover |
| **Main Area** | Project grid/list with cards, search bar, filters, bulk actions |
| **Top Bar** | Create button, view toggles (grid/list), sort options |
| **Quick Start** | Prominent "Create project with a prompt" card/input |

### 1.2 View Modes
- **Grid View**: Visual cards with thumbnails, project name, last modified date
- **List View**: Compact table with name, status, last modified, workspace
- Remembers user's preferred view

---

## 2. Project Cards

### 2.1 Card Contents
| Element | Description |
|---------|-------------|
| **Thumbnail** | Auto-generated screenshot of project's latest state |
| **Project Name** | Editable |
| **Last Modified** | Relative timestamp |
| **Status Badge** | Published / Draft / Error |
| **Quick Actions** | Open, Duplicate, Delete (on hover) |
| **Star Icon** | Toggle star for quick access |

### 2.2 Card Context Menu (Right-click)
- Open
- Duplicate
- Move to Folder
- Star / Unstar
- Rename
- Transfer to another Workspace
- Delete (with confirmation)

---

## 3. Project Organization

### 3.1 Folders
| Feature | Spec |
|---------|------|
| **Nesting** | Up to 3 levels deep |
| **Drag-and-drop** | Reorder folders in sidebar |
| **Bulk Move** | Select multiple projects → Move to folder |
| **Create** | New Folder button in sidebar |
| **Delete** | Deletes folder, projects optionally moved or deleted |

### 3.2 Stars
- Star any project for quick access
- Starred section in sidebar
- Toggle star from card, context menu, or project settings

### 3.3 Recent Projects
- Sidebar section showing recently opened projects
- Auto-updated on project access

---

## 4. Search & Filtering

### 4.1 Global Search
| Feature | Spec |
|---------|------|
| **Full-text search** | Searches project names, content, file contents |
| **Substring matching** | Partial matches supported |
| **Relevance scoring** | Best matches shown first |
| **Stability** | No unexpected reloads or disappearing results |
| **Speed** | Results appear as you type |

### 4.2 Filters
- By workspace
- By status (Published, Draft, Error)
- By date range
- By starred
- By folder

---

## 5. Project Creation

### 5.1 From Prompt
1. User enters natural language description on dashboard or landing page
2. Can attach images for reference/context
3. AI processes and creates project
4. Cloud dev server spins up
5. Editor opens with initial generation visible
6. Preview loads with first build

### 5.2 From Template
- Template gallery on dashboard
- Curated starters: dashboards, landing pages, portfolios, e-commerce, social apps
- **Design Templates** (Pro+): Mark existing projects as reusable templates
- Click template → customize name → create

### 5.3 From Figma Import
1. Install Builder.io Figma plugin
2. Select frames in Figma
3. Export to code (AI analyzes design intent)
4. Open in Doable for AI refinement
5. Add validation, backend hooks, interactivity
6. Bi-directional sync (beta): Figma updates auto-merge without breaking logic

### 5.4 From GitHub Import
- Import existing repository
- AI analyzes codebase structure
- Provides editing and enhancement capabilities
- Two-way sync maintained

### 5.5 Remix (Fork)
- Fork any public project
- Creates a full copy in your workspace
- Independent from original after fork

---

## 6. Project Settings

### 6.1 Settings Page (Dedicated page, not modal)
| Section | Contents |
|---------|----------|
| **Project Details** | Name (editable), creation date, total edits, visibility toggle |
| **Visibility** | Public (free) / Restricted (Pro+) — default: Restricted |
| **Custom Knowledge** | Textarea for project blueprint, conventions, branding |
| **Integrations** | Connect GitHub, Supabase/Cloud, Stripe, Connectors |
| **Custom Domain** | Configure domain with www and non-www variants |
| **Analytics** | Built-in analytics dashboard (see [10-analytics-security.md](10-analytics-security.md)) |
| **Environments** | Test / Live environment management |
| **Danger Zone** | Delete project (with confirmation) |

### 6.2 Visibility Renamed
- "Personal" renamed to "Restricted" for clarity
- Default project visibility: **Restricted** (private) for all workspaces

---

## 7. Bulk Actions

| Action | Description |
|--------|-------------|
| **Select Multiple** | Drag to select, or Ctrl/Cmd + click |
| **Delete** | Bulk delete with confirmation |
| **Move** | Move to folder |
| **Remove from Folder** | Take out without deleting |
| **Transfer** | Move between workspaces |

---

## 8. Workspace Selector

### 8.1 Redesigned Selector
| Feature | Spec |
|---------|------|
| **Default ordering** | Most recently used first |
| **Reorderable** | Drag to reorder workspaces |
| **Visibility** | Shows avatar, name, handle, member count |
| **Fast loading** | Optimized for quick switching |
| **Create new** | "Create Workspace" option in dropdown |

### 8.2 No-Workspace State
- Users without workspace memberships see a dialog
- Options: Create a new free workspace or find existing ones to join
- Ensures no user is stuck without access

---

## 9. Community Discovery

### 9.1 Discover Section
- Browse apps from the community
- Featured/trending projects
- Category filtering
- "Remix" button to fork interesting projects

---

## 10. Project Lifecycle

```
[Prompt / Template / Import]
         │
         ▼
    [Creating] ──→ [Draft] ──→ [Published]
                     │  ▲          │
                     │  │          │
                     ▼  │          ▼
                 [Editing]    [Live + Editable]
                                   │
                                   ▼
                           [Republish / Update]
```

### 10.1 States
| State | Description |
|-------|-------------|
| **Creating** | AI is generating initial project |
| **Draft** | Project exists but not published |
| **Published** | Live at a URL (doable.app or custom domain) |
| **Error** | Build or deploy error; "Try to Fix" available |
