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
| **Members** | Invite, remove, roles, bulk management |
| **Billing** | Plan, credits, usage, invoices, per-member credit tracking |
| **Connectors** | Shared integrations management |
| **Security** | SSO configuration, security center |
| **Privacy & Security** | Default project visibility, MCP access, SSO enforcement |
| **Appearance** | Theme selection |

### 1.5 Bulk Member Management
| Feature | Description |
|---------|-------------|
| **Multi-select** | Select multiple members at once |
| **Bulk role change** | Change roles for selected members simultaneously |
| **Bulk remove** | Remove multiple members at once |
| **Bulk revoke invites** | Revoke pending invitations in bulk |
| **Per-member credit limits** | Admins set maximum credit usage per collaborator |
| **Per-member credit tracking** | View monthly credit consumption per collaborator |

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

### 2.5 Workspace Invite Links
| Feature | Description |
|---------|-------------|
| **Shareable links** | Generate role-based invite links for workspace |
| **Role assignment** | Each link has a pre-assigned role (Viewer, Editor, Admin) |
| **Expiration** | Links expire after 5 days for security |
| **Revocable** | Admins can revoke active invite links |
| **Bulk onboarding** | Share one link to onboard entire teams quickly |

### 2.6 Project-Level Roles
Separate from workspace roles, project-level roles provide granular per-project access:

| Role | Permissions |
|------|------------|
| **Viewer** | View project, share magic links, manage viewers only |
| **Editor** | All viewer permissions + editing, custom domains, GitHub management, publishing |
| **Admin** | All editor permissions + project settings, backend management, transfer/deletion |
| **Owner** | Full control including project transfer |

### 2.7 Project Invite Flow
| Feature | Description |
|---------|-------------|
| **Per-project invites** | Invite collaborators to a specific project (not entire workspace) |
| **Accept/Decline** | Formal accept or decline flow for project invitations from email and magic links |
| **Credit usage** | Project collaborators consume the workspace owner's credits |
| **Magic link access** | One-click access for invited collaborators at any permission level |

### 2.8 External Collaborator Visibility
| Feature | Description |
|---------|-------------|
| **Indicator** | Clear visual badge when a collaborator is outside the organization |
| **Scope** | Shown in project and workspace member lists |
| **Purpose** | Prevents accidental sharing of sensitive projects with external users |

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

### 4.1 Default Visibility
| Feature | Description |
|---------|-------------|
| **Private by default** | All new projects default to workspace-only visibility |
| **Admin control** | Workspace admins set default visibility in Settings → Privacy & security |
| **Per-project override** | Project owners can change visibility on individual projects |

### 4.2 Visibility Levels
| Level | Description | Plan |
|-------|-------------|------|
| **Workspace-only** | Only workspace members can view/edit | All plans |
| **Restricted** | Only you (the creator) can view/edit | Business+ |
| **Public** | Anyone with link can view; remixable | All plans |

### 4.3 Public Projects
| Feature | Description |
|---------|-------------|
| **Hosting** | `[project].doable.app` |
| **Visibility** | Anyone with link can view |
| **Remixable** | Community can fork/remix |
| **Doable branding** | "Built with Doable" badge shown |

### 4.4 Restricted Projects (Pro+)
| Feature | Description |
|---------|-------------|
| **Privacy** | Not discoverable, link only |
| **Custom domains** | Your own domain |
| **No branding** | Remove "Built with Doable" badge |
| **Code editing** | Full Dev Mode access |

### 4.5 Workspace-Only Publishing (Business+)
| Feature | Description |
|---------|-------------|
| **Auth-gated access** | Published apps require authentication |
| **Workspace members only** | Only workspace members can access the live app |
| **Admin publish controls** | Admins can restrict who can publish externally (admins/owners only) |

### 4.6 Request Access Flow
| Feature | Description |
|---------|-------------|
| **Request button** | Non-members see a "Request Access" button on private projects |
| **Owner notification** | Project owner receives notification of access request |
| **Approve/Deny** | Owner can approve or deny from notification or project settings |
| **Role assignment** | Owner assigns role (Viewer/Editor) on approval |

### 4.7 Folder Visibility Controls
| Feature | Description |
|---------|-------------|
| **Folder-level setting** | Folders can be set as workspace-visible or private |
| **Inheritance** | Projects inherit the visibility of their parent folder |
| **Override** | Individual project visibility can override folder setting |

### 4.8 Shareable Links
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
| **Direct transfer** | Transfer ownership via Project Settings (no admin required) |
| **Editor transfer (Enterprise)** | Enterprise setting allows editors to transfer their own projects, ensuring team members retain access to personal projects after program completion |

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

### 7.2 Workspace Knowledge
| Feature | Description |
|---------|-------------|
| **Scope** | Applies across every project in the workspace |
| **Access** | All workspace members |
| **AI context** | Injected into every AI interaction for all workspace projects |
| **Content** | Shared rules, conventions, coding standards, design system references |
| **Inheritance** | Workspace knowledge + project knowledge merged (project overrides on conflict) |
| **Management** | Workspace Settings → Knowledge |

### 7.3 Knowledge Management
- Edit from Project Settings → Custom Knowledge (project-level)
- Edit from Workspace Settings → Knowledge (workspace-level)
- Textarea for free-form instructions
- Markdown supported
- Persistent across all edits and messages

---

## 8. Cross-Project Referencing

### 8.1 Overview
Reference other workspace projects during development to reuse proven implementations, patterns, and components without rebuilding from scratch.

### 8.2 Features
| Feature | Description |
|---------|-------------|
| **`@mention` projects** | Type `@ProjectName` in chat to reference another workspace project |
| **File exploration** | Agent can browse file structures of referenced projects |
| **Code reading** | Agent reads source code from referenced projects |
| **Pattern search** | Agent searches for relevant patterns across referenced projects |
| **Chat history access** | Agent can access chat history of referenced projects for context |
| **Asset reuse** | Copy assets (images, fonts) from referenced projects |
| **Component reuse** | Reuse or adapt components from other projects |

### 8.3 Access Controls
| Feature | Description |
|---------|-------------|
| **Workspace scope** | Can only reference projects within the same workspace |
| **Permission required** | User must have at least Viewer access to referenced project |
| **Read-only** | Referencing never modifies the source project |

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
