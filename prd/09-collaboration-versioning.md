# 09 — Collaboration, Workspaces & Version History

## Overview

Doable supports team collaboration through workspaces with unlimited members, real-time co-editing, granular permissions, and a comprehensive version history system with bookmarks and rollback.

---

## 1. Workspaces

### 1.1 Workspace Model
| Feature | Description |
|---------|-------------|
| **Multi-workspace** | Users can belong to multiple workspaces |
| **Unlimited members** | All plans support unlimited team members |
| **Project isolation** | Projects belong to one workspace |
| **Billing** | Credits shared across workspace members |
| **Avatar + Name + Handle** | Visual identity for each workspace |

### 1.2 Workspace Selector (Redesigned)
| Feature | Description |
|---------|-------------|
| **Default ordering** | Most recently used first |
| **Reorderable** | Drag to customize order |
| **Visibility** | Shows avatar, name, handle, member count |
| **Fast loading** | Optimized for instant switching |
| **Create new** | "Create Workspace" in dropdown |

### 1.3 No-Workspace State
- Users without memberships see a dialog
- Options: Create free workspace or find existing ones to join
- Ensures no user ever gets stuck without access

### 1.4 Workspace Settings (Dedicated Page)
| Section | Contents |
|---------|----------|
| **General** | Name, handle, avatar, description |
| **Members** | Invite, remove, roles |
| **Billing** | Plan, credits, usage, invoices |
| **Connectors** | Shared integrations management |
| **Security** | SSO configuration, security center |
| **Appearance** | Theme selection |

---

## 2. Team Collaboration

### 2.1 Real-Time Collaboration
| Feature | Description |
|---------|-------------|
| **Simultaneous editing** | Multiple users in same project |
| **Visual editor access** | All team members can use visual editor |
| **GitHub integration** | Shared version control |
| **Live preview** | Shared preview state |

### 2.2 User Roles
| Role | Permissions |
|------|------------|
| **Owner** | Full control, billing, delete workspace |
| **Admin** | Manage members, settings, connectors, security |
| **Member** | Create/edit projects, use all editor features |
| **Viewer** (potential) | View-only access to projects |

### 2.3 Permissions (Pro+)
| Feature | Plan |
|---------|------|
| **Basic roles** | Pro+ |
| **Granular permissions** | Pro+ |
| **Group-based access** | Enterprise |
| **Custom roles** | Enterprise |

### 2.4 Invite Flow
- Invite via email or link
- Role assignment on invite
- Workspace join approval (optional)

---

## 3. Version History (v2.0)

### 3.1 History View
| Feature | Description |
|---------|-------------|
| **Timeline** | Google Docs-style version timeline |
| **Descriptive labels** | Each version has auto-generated description |
| **Change visibility** | Clearly shows what changed and when |
| **Navigation** | Better navigation through history |
| **Commit messages** | Describe what actually changed, not just what was asked |
| **Screenshot previews** | **Hover over any version** to see a screenshot of the app at that point without opening it |
| **Date grouping** | Edits grouped by date for easy scanning |
| **Restored versions** | Restored versions visible in timeline |

### 3.2 Bookmarks
| Feature | Description |
|---------|-------------|
| **Mark versions** | Bookmark important snapshots |
| **Quick access** | Find bookmarked versions instantly |
| **Labels** | Optional labels for bookmarks |
| **Persist** | Bookmarks survive across sessions |

### 3.3 Restore / Rollback
| Feature | Description |
|---------|-------------|
| **Easy restore** | One-click restore to any previous version |
| **Non-destructive** | Restoring creates a new version, doesn't delete history |
| **Selective** | Choose which version to restore to |
| **Exact message revert** | Jump back to **any specific message** in the thread (not just all-or-nothing) |
| **Edit past messages** | Editing an old message **restores the project state** to that moment and sends the updated message as if it happened originally |
| **Branch exploration** | Edit past messages to explore alternative approaches |

### 3.4 File Edit Persistence
- File edits persist when stopping the agent
- No work lost on interruption
- Resume editing without redoing changes

---

## 4. Project Sharing

### 4.1 Public Projects (Free)
| Feature | Description |
|---------|-------------|
| **Hosting** | `[project].doable.app` |
| **Visibility** | Anyone with link can view |
| **Remixable** | Community can fork/remix |
| **Doable branding** | "Built with Doable" badge shown |

### 4.2 Restricted Projects (Pro+)
| Feature | Description |
|---------|-------------|
| **Privacy** | Not discoverable, link only |
| **Custom domains** | Your own domain |
| **No branding** | Remove "Built with Doable" badge |
| **Code editing** | Full Dev Mode access |

### 4.3 Shareable Links
- One-click shareable preview links
- Published app URLs for prototypes and production
- Social previews with OG images

---

## 5. Project Transfer

### 5.1 Between Workspaces
| Feature | Description |
|---------|-------------|
| **Bulk transfer** | Move multiple projects at once |
| **Workspace selector** | Choose target workspace |
| **Preserve history** | Version history maintained |
| **Redirect** | Old links redirect (optional) |

---

## 6. Design Systems (Enterprise)

### 6.1 Shared Design Systems
| Feature | Description |
|---------|-------------|
| **Dynamic instructions** | Auto-applied to connected projects |
| **Evolving** | Update as guidelines change |
| **Consistent** | Ensures styling/component consistency across projects |
| **React packages** | Distributed as React npm packages |
| **Private npm** | Supports private registries |

### 6.2 Design Templates (Business+)
| Feature | Description |
|---------|-------------|
| **Reusable** | Mark projects as templates |
| **Quick start** | New projects from template codebases |
| **Team-wide** | Available to all workspace members |
| **Versioned** | Templates can be updated |

---

## 7. Custom Knowledge

### 7.1 Project Knowledge
| Feature | Description |
|---------|-------------|
| **Storage** | `.doable/knowledge.md` |
| **Scope** | Per-project |
| **Access** | All workspace members |
| **AI context** | Referenced on every AI interaction |
| **Content** | Branding, coding conventions, business logic, design guidelines |

### 7.2 Knowledge Management
- Edit from Project Settings → Custom Knowledge
- Textarea for free-form instructions
- Markdown supported
- Persistent across all edits and messages

---

## 8. Community Features

### 8.1 Discover
| Feature | Description |
|---------|-------------|
| **Browse** | Explore community-published apps |
| **Featured** | Curated/trending projects |
| **Categories** | Filter by type/category |
| **Remix** | Fork any public project |
| **Search** | Find community projects |

### 8.2 Remixing
| Feature | Description |
|---------|-------------|
| **One-click** | Fork public project to your workspace |
| **Full copy** | Independent copy of entire codebase |
| **Attribution** | Optional link to original |
| **Customizable** | Edit freely after forking |
