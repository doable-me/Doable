# 02 — Editor UI & Visual Experience

## Overview

The editor is a multi-panel workspace combining AI chat, visual preview, code editing, and project navigation. It provides three interaction paradigms: **conversational** (chat), **visual** (click-to-edit), and **code** (Dev Mode), all updating the same source of truth in real-time.

---

## 1. Global Layout

### 1.1 Top Navigation Bar (Persistent)
| Element | Position | Description |
|---------|----------|-------------|
| **Workspace Switcher** | Top-left | Dropdown showing avatar, name, handle; create/switch workspaces; reorderable |
| **Search** | Center-left | Global search across projects |
| **Notifications Bell** | Top-right | Inbox, "What's New" updates |
| **Profile Avatar** | Top-right | Dropdown: Profile, Billing, Labs, Settings, Logout |

### 1.2 Editor Split-Panel Layout
The editor uses a flexible split-panel layout with resizable panes:

```
┌──────────────────────────────────────────────────────────────────┐
│  [Workspace ▼]  [Project Name ✏️]  [Settings ⚙️]  [Publish 🚀]  │  ← Top Bar
├──────────┬───────────────────────┬───────────────────────────────┤
│          │                       │                               │
│  LEFT    │   CENTER              │   RIGHT                       │
│  SIDEBAR │   (Chat / Code)       │   (Preview)                   │
│          │                       │                               │
│  - Pages │   Chat History        │   Live Preview (iframe)       │
│  - Files │   AI Responses        │   Visual Edit Overlay         │
│  - History│  Code Diffs          │   Mobile/Web Toggle           │
│  - Knowledge│                    │   Refresh / Fullscreen        │
│          │                       │                               │
│          │   ┌─────────────────┐ │                               │
│          │   │ Chat Input      │ │                               │
│          │   │ [📎] [Send ↵]  │ │                               │
│          │   └─────────────────┘ │                               │
└──────────┴───────────────────────┴───────────────────────────────┘
```

---

## 2. Left Sidebar

### 2.1 Navigation Tabs
| Tab | Icon | Contents |
|-----|------|----------|
| **Pages** | 📄 | List of all pages/routes; "+ Add Page" button; click to navigate preview |
| **Files** | 📁 | Full file tree (Dev Mode); expandable folders; file type icons; inline edit |
| **History** | 🕐 | Version timeline (Google Docs-style); revert buttons; bookmark key versions; edit past messages; **screenshot previews on hover** |
| **Knowledge** | 🧠 | Custom knowledge textarea for project blueprint (functionality, design goals) |

### 2.2 Mode Toggle Buttons
- **Agent Mode / Plan Mode** toggle
- **Web / Mobile** view toggle
- **Visual Edits** active/inactive indicator
- **Remixing** toggle (for public projects)

### 2.3 Visual Edit Tools (Contextual)
When an element is selected in the preview:
- Multi-select (Shift/Cmd + click) for **bulk edits on multiple elements**
- Alignment and layout controls (margins, padding sliders per side)
- Text editor (content, font, size, weight, color)
- **Edit text directly on the page** — click on text and type in-place
- Color picker
- Image upload / **AI image generation** (generate images inline)
- Spacing controls (px values per side)
- **Floating combo-box controls** — property adjusters appear directly next to the selected element for pixel-perfect tweaks
- **Icons**: Change icons via icon picker
- **Borders and shadows**: Visual controls for borders, shadows
- **Mixed content elements**: Edit buttons with both text and icons

### 2.4 Visual Edit Access
- Access Visual Edits from the **Design view** or use the Visual Edits shortcut in the prompt box
- Edits happen directly in the **left-hand panel**
- Preview panel shows real-time results

---

## 3. Center Panel — Chat & Code

### 3.1 Chat Interface
| Element | Description |
|---------|-------------|
| **Chat History** | Threaded messages: user prompts, AI responses, code diffs, task cards |
| **Condensed Cards** | Grouped tool calls and actions for readability |
| **Details View** | Expandable full timeline of all actions (tool calls, file changes) |
| **Streaming Responses** | AI types out gradually (not all at once) |
| **Links** | Open in new tabs |
| **Action Buttons** | Above input: "Refactor code", "Add animation", "Connect GitHub", "Connect Supabase" |

### 3.2 Chat Input
| Feature | Spec |
|---------|------|
| **Position** | Bottom of center panel |
| **Submit** | Enter key |
| **Multi-line** | Shift+Enter |
| **Attachments** | 📎 button for images, screenshots, files |
| **Speech-to-text** | Microphone icon; ElevenLabs Scribe V2 |
| **Templates** | Prompt suggestions for common operations |

### 3.3 Code Editor (Dev Mode)

Enabled via Labs settings, provides a VS Code-like editing experience:

| Feature | Spec |
|---------|------|
| **Editor Engine** | Monaco Editor |
| **File Tree** | Integrated from left sidebar; tabs for open files |
| **Syntax Highlighting** | JSX/TSX, TypeScript, CSS, Tailwind classes |
| **Autocomplete** | AI-powered completions |
| **Inline Suggestions** | Contextual AI code suggestions |
| **Bidirectional Sync** | Changes sync with preview via client-side AST mutations |
| **Auto-save** | Optimistic DOM updates on save |
| **Refresh** | Button for full rebuild when needed |
| **Save Speed** | ~20% faster than baseline (target: < 1 second) |

---

## 4. Right Panel — Preview

### 4.1 Live Preview
| Feature | Spec |
|---------|------|
| **Engine** | Vite dev server in iframe |
| **Hot Reload** | < 500ms latency on code changes |
| **Responsive Toggle** | Switch between Web and Mobile views |
| **Mobile Safe Areas** | iOS-style safe areas enforced in mobile preview |
| **Multi-page Navigation** | Tabs or dropdown to switch between pages |
| **Full-screen** | Toggle button for expanded view |
| **Refresh** | Manual refresh button for full rebuild |

### 4.2 Visual Edit Overlay
| Feature | Spec |
|---------|------|
| **Element Selection** | Hover: highlights element with bounding box; Click: selects for editing |
| **Properties Panel** | Shows JSX mapping, applied styles, Tailwind classes |
| **Direct Manipulation** | Resize, reposition, restyle via visual controls |
| **Drag-and-Drop** | Drop images directly onto components (auto-saved as assets) |
| **Context Menu** | Right-click: Edit, Delete, Copy Prompt |

### 4.3 Preview Toolbar
| Button | Action |
|--------|--------|
| **Refresh** | Reload preview |
| **Full-screen** | Expand preview to full window |
| **Mobile/Web** | Toggle responsive view |
| **Publish** | Generate shareable link / deploy |
| **External URL** | Open preview in new browser tab |

---

## 5. Top Toolbar (Editor)

| Element | Description |
|---------|-------------|
| **Project Name** | Editable, click to rename |
| **Settings Gear** | Opens Project Settings page (includes Integrations Hub tab) |
| **Publish/Deploy** | One-click deploy with preview link generation |
| **GitHub** | Connect repo, push/pull sync |
| **Version Controls** | Revert, Bookmark, History |
| **View Toggles** | Dev Mode, Visual Edits, Mobile, Refresh |
| **Share/Export** | Preview link, Download ZIP |

---

## 6. Context Menus

### 6.1 Preview Element Context Menu (Right-click)
- Edit (opens property panel)
- Delete element
- Copy as prompt
- Select parent
- Inspect in code

### 6.2 File Tree Context Menu (Right-click)
- New File
- New Folder
- Rename
- Delete
- Copy Path

### 6.3 Project Card Context Menu (Dashboard, Right-click)
- Open
- Duplicate
- Move to Folder
- Star/Unstar
- Transfer Workspace
- Delete

---

## 7. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save current file |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + P` | Quick file open |
| `Ctrl/Cmd + /` | Toggle comment |
| `Ctrl/Cmd + F` | Find in file |
| `Ctrl/Cmd + Shift + F` | Find in project |
| `Shift + Click` | Multi-select elements (visual mode) |
| `Cmd/Ctrl + Click` | Add to selection (visual mode) |
| `Enter` | Send chat message |
| `Shift + Enter` | New line in chat |
| `Escape` | Deselect / Close modal |

---

## 8. Responsive / Mobile UI

### 8.1 Platform Mobile Experience
- Sheets replace popovers for menus, navigation, and sharing on mobile
- "Inbox" and "What's new" inside avatar menu on small screens
- Touch-optimized panel switching

### 8.2 Preview Mobile Mode
- Toggle between Web and Mobile preview
- iOS-style safe areas
- Responsive flexbox layouts
- Device frame mockup around preview

---

## 9. Theme & Appearance

### 9.1 Dashboard Themes
- Selectable themes via User Settings → Appearance
- Light / Dark mode support
- Custom color schemes

### 9.2 Editor Theme
- Consistent with selected dashboard theme
- Monaco editor dark/light themes
- Syntax highlighting color schemes

### 9.3 Project/App Themes (Generated Apps)
- **Theme selection at project creation**: Choose a visual theme before first prompt
- **Custom themes**: Users can create and import custom themes
- **Theme import**: Paste theme code (e.g., from shadcn theme generators) into import dialog
- **Theme persistence**: Selected theme applies to all generated components
- Themes define: colors, border radii, typography, spacing, shadows
- Accessible from project creation and Project Settings

---

## 10. Integrations Hub (Project Settings)

### 10.1 Unified Integrations Tab
The Project Settings page includes a dedicated **Integrations** tab that brings together:

| Connector | Description |
|-----------|-------------|
| **Doable Cloud** | Database, auth, storage, edge functions |
| **Doable AI** | Built-in AI capabilities |
| **MCP Servers** | Personal connectors |
| **Stripe** | Payment integration |
| **Shopify** | E-commerce integration |
| **GitHub** | Version control sync |

### 10.2 Per-Project View
- Shows connection status for each integration
- Quick-connect buttons for unconfigured services
- Settings and configuration inline
- All integrations visible in one place (no hunting through menus)
