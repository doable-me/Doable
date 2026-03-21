# 07b — Live Collaboration: Shared AI, Shared Visual Editing, Shared Code

## Overview

Doable is currently a tool individuals use near each other — multiple users can work on the same project, but each operates in isolation. This PRD transforms Doable into a tool teams use **together** by introducing three interconnected features:

1. **Shared AI Conversation** — one AI chat per project visible to all collaborators
2. **Shared Visual Editing** — see each other's element selections and live changes in the preview (like Figma)
3. **Shared Code Changes (Yjs CRDT)** — real-time multi-cursor editing in Monaco (like Google Docs)

### Competitive Position

| Tool | Shared Code | Shared AI | Shared Visual Edit |
|------|-------------|-----------|-------------------|
| **Lovable** | No (single-user) | No | No |
| **Replit** | Multiplayer terminals | No shared AI chat | No |
| **Figma** | N/A | No | Yes (cursors + selections) |
| **Cursor** | No | No | No |
| **Doable (this PRD)** | Yes (CRDT) | Yes (shared chat + queue) | Yes (selections + live changes) |

Doable will be the first tool where multiple people collaboratively direct an AI to build software — watching it respond together, editing the same code simultaneously, and seeing each other's visual changes in real time.

---

## Personas

### Maya — Product Manager
Non-technical. Describes features in plain English. Relies on visual edit mode to tweak copy, colors, and layout. Needs to see what the AI is doing and steer it without writing code.

### Dev — Engineer
Writes and reviews code in Monaco. Evaluates AI-generated code for correctness. Wants to see teammates' cursors and avoid merge conflicts. Needs per-user undo so reverting their own changes never destroys someone else's work.

### Sam — Designer
Lives in visual edit mode. Adjusts spacing, typography, and color palettes. Rarely opens the code editor. Needs to see when someone else is editing the same element to avoid conflicting style changes.

---

## Feature 1: Shared AI Conversation

### The Feeling

When Maya opens a project and Dev is already chatting with AI, Maya should feel like she **walked into a room where a conversation is happening**. She can see everything, watch the AI respond in real-time, and jump in. Like a shared Slack channel where the AI is a participant.

### Key Behaviors

- **One shared AI session per project** (not per-user). Session key changes from `projectId + userId` to `projectId` only.
- **User attribution**: each message shows the sender's avatar, display name, and assigned color.
- **Real-time streaming visible to all**: when one user sends a prompt, every connected user sees the AI's streaming response token-by-token.
- **Message queue for concurrent requests**: only one AI request runs at a time. If Maya sends a message while the AI is responding to Dev's prompt, Maya's message enters a visible queue.
  - Queue is visible to all users.
  - Any user can reorder or cancel queued messages.
  - Queue position shown inline: "Your message is #2 in queue."
- **Typing indicator**: when a user is composing a message, others see a typing indicator in the chat input area.
- **Abort by any user**: any collaborator can cancel the current AI response (not just the sender).
- **Full history on join**: when a user opens the project, the complete conversation history loads immediately, including messages from other users.

### Architecture Changes

| Current | New |
|---------|-----|
| Session key: `projectId + userId` | Session key: `projectId` |
| SSE stream per user | SSE stream for sender + WS broadcast to all others |
| No message queue | `ai_message_queue` table with `position`, `user_id`, `content`, `status` |
| `ai_messages.user_id` implicit | `ai_messages` gains `sent_by_user_id`, `display_name`, `user_color` columns |

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `ai:message-sent` | Client -> Server | `{ content, attachments, userId }` |
| `ai:stream-chunk` | Server -> Clients | `{ chunk, messageId, isThinking }` |
| `ai:stream-end` | Server -> Clients | `{ messageId, finalContent }` |
| `ai:queue-update` | Server -> Clients | `{ queue: [{ id, userId, displayName, content, position }] }` |
| `ai:typing` | Client -> Server -> Clients | `{ userId, displayName, isTyping }` |
| `ai:abort` | Client -> Server | `{ messageId, abortedByUserId }` |

---

## Feature 2: Shared Visual Editing

### The Feeling

When Sam selects a button to change its color, Dev sees a **colored outline around that button** with "Sam" written above it. When Sam changes the color, Dev's preview updates instantly. Like two people pointing at the same screen.

### Key Behaviors

- **Colored selection outlines**: when a user selects an element in visual edit mode, all other users see a colored border around that element with the user's name label (like Figma's selection indicators).
- **Live style/text changes**: when a user changes a CSS property or edits text, the change is visible in all users' preview iframes immediately — before the code is even written to disk.
- **Conflict warning**: if a user selects an element another user is actively editing, they see a warning: "Sam is editing this element." They can still proceed, but they are informed.
- **Independent simultaneous editing**: different users can edit different elements at the same time with no interference.
- **Cursor presence in preview**: each user's mouse cursor is visible to others in the preview iframe (with name label and color).

### Protocol

| Event | Payload | Purpose |
|-------|---------|---------|
| `visual-edit:select` | `{ userId, displayName, color, selector, boundingRect }` | Broadcast element selection |
| `visual-edit:deselect` | `{ userId }` | Clear selection indicator |
| `visual-edit:style-change` | `{ userId, selector, property, value }` | Broadcast live property change |
| `visual-edit:text-change` | `{ userId, selector, newText }` | Broadcast live text edit |
| `visual-edit:cursor-move` | `{ userId, displayName, color, x, y }` | Broadcast cursor position in preview |

### Rendering

- Selection overlays and remote cursors are rendered inside the preview iframe via the existing `postMessage` bridge.
- The preview iframe receives `remote-selection` and `remote-cursor` messages and draws overlay `<div>` elements positioned absolutely relative to the target elements.
- Overlays use the user's assigned color with 30% opacity fill and full opacity border.
- Name labels are positioned above the top-left corner of the selection box.

---

## Feature 3: Shared Code Changes (Yjs CRDT)

### The Feeling

When Dev types code in Monaco, Maya sees characters appear **letter-by-letter** with Dev's colored cursor and name label. Like Google Docs but for code. Magical, immediate, conflict-free.

### Key Behaviors

- **Real-time keystroke visibility**: every keystroke is visible to all connected users within 100ms.
- **Colored cursors with labels**: each user's cursor and selection range is displayed in their assigned color with their name.
- **Per-user undo stacks**: pressing Ctrl+Z undoes only the current user's changes. Dev undoing their edit never reverts Sam's changes.
- **AI writes merge seamlessly**: when the AI's `write_file` tool modifies a file, the change is applied to the Yjs document as a CRDT operation. Users editing the same file see the AI's changes merge in without losing their own work.
- **Preview updates for all users**: as code changes via CRDT, the dev server picks up changes and all users' previews hot-reload.
- **CRDT as source of truth during collaboration**: when at least one user is connected, file content is served from the Yjs document, not the filesystem. The filesystem is a persistence target, not the authority.

### Architecture

```
┌─────────┐     ┌─────────┐     ┌─────────────────┐     ┌──────────┐
│ Dev's    │◄───►│         │◄───►│  Yjs Document    │────►│ File     │
│ Monaco   │ WS  │  Server │     │  Manager         │     │ System   │
│          │     │         │     │  (Y.Doc per file) │     │          │
├─────────┤     │         │     │                   │     │          │
│ Maya's   │◄───►│         │◄───►│  - CRDT state    │     │          │
│ Monaco   │ WS  │         │     │  - Awareness     │     │          │
└─────────┘     └─────────┘     │  - Undo Manager  │     └──────────┘
                                └───────────────────┘
```

- **Server-side Yjs document manager**: maintains one `Y.Doc` per actively-edited file within a project. Documents are created on first access and garbage-collected after all users disconnect (with a 30-second grace period for reconnection).
- **AI `write_file` integration**: the AI's `write_file` tool applies changes to the Yjs document (not directly to the filesystem). The CRDT propagates the change to all connected editors, and persistence writes it to disk.
- **CRDT-to-file persistence**: debounced at 500ms. After 500ms of no CRDT changes, the current document state is written to the filesystem. This keeps the filesystem reasonably in sync without thrashing on every keystroke.
- **Yjs Awareness protocol**: used for cursor positions, selections, and user presence. Replaces any custom cursor synchronization messages. Awareness state includes `{ userId, displayName, color, cursor, selection }`.
- **Monaco binding**: uses `y-monaco` to bind `Y.Text` to Monaco editor instances. This handles cursor rendering, selection display, and text synchronization automatically.

### Conflict Resolution

Yjs CRDTs provide automatic conflict resolution with the following guarantees:

- **Convergence**: all clients reach the same document state regardless of message ordering.
- **Intent preservation**: concurrent inserts at different positions are both preserved. Concurrent inserts at the same position are ordered deterministically by client ID.
- **No data loss**: no edit is ever silently dropped.

---

## Implementation Sequence

### Phase A: Shared Code (CRDT) — Weeks 1-3

**Rationale**: the CRDT layer is the foundation. Shared AI needs it (AI file writes must go through CRDT when users are connected). Shared visual editing needs it (visual edit changes must propagate through CRDT to persist).

| Task | Description |
|------|-------------|
| A1 | Add `yjs`, `y-monaco`, `y-websocket`, `lib0` dependencies |
| A2 | Server-side `YjsDocumentManager` — create/load/persist `Y.Doc` per file |
| A3 | WebSocket transport for Yjs sync and awareness protocols |
| A4 | Monaco editor integration via `y-monaco` binding |
| A5 | AI `write_file` tool writes to Yjs when collaboration is active |
| A6 | CRDT-to-filesystem persistence with 500ms debounce |
| A7 | Reconnection handling — state vector exchange on reconnect |
| A8 | User color assignment service (consistent colors per user per project) |

### Phase B: Shared AI Conversation — Weeks 4-5

**Rationale**: depends on the CRDT layer (A5) so AI file writes propagate to all editors.

| Task | Description |
|------|-------------|
| B1 | Migrate session key from `projectId + userId` to `projectId` |
| B2 | Add `sent_by_user_id`, `display_name`, `user_color` to `ai_messages` |
| B3 | Create `ai_message_queue` table and queue management API |
| B4 | WS broadcast of AI stream chunks to non-sender users |
| B5 | Chat UI: user avatars, colors, typing indicators |
| B6 | Queue UI: position indicator, reorder, cancel |
| B7 | Abort-by-any-user functionality |

### Phase C: Shared Visual Editing — Weeks 6-7

**Rationale**: depends on WS infrastructure from Phase B and CRDT from Phase A.

| Task | Description |
|------|-------------|
| C1 | Visual edit selection broadcasting via WS |
| C2 | Preview iframe overlay rendering for remote selections |
| C3 | Live style/text change broadcasting |
| C4 | Remote cursor rendering in preview iframe |
| C5 | Conflict warning when selecting an element another user is editing |
| C6 | Visual edit changes written through CRDT (not direct file write) |

---

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Keystroke propagation (CRDT) | < 100ms | Time from keypress on Client A to character appearing on Client B |
| AI message broadcast | < 200ms | Time from SSE chunk received to WS delivery to other clients |
| CRDT sync on reconnect | < 2s | Time from WebSocket reconnection to full document state sync |
| Visual edit selection broadcast | < 150ms | Time from element click to overlay appearing on other clients |
| Max concurrent editors per project | 25 | Load test with 25 simultaneous editors on a single project |
| CRDT document memory (server) | < 50MB per project | Measured across all active Y.Docs for one project |
| Awareness update frequency | 50ms throttle | Cursor position updates throttled to prevent flooding |

---

## Database Changes

### New Table: `ai_message_queue`

```sql
CREATE TABLE ai_message_queue (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_ulid()),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  position    INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### Altered Table: `ai_messages`

```sql
ALTER TABLE ai_messages
  ADD COLUMN sent_by_user_id TEXT REFERENCES users(id),
  ADD COLUMN display_name    TEXT,
  ADD COLUMN user_color      TEXT;
```

### New Table: `user_project_colors`

```sql
CREATE TABLE user_project_colors (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  color      TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
```

---

## Edge Cases & Failure Modes

| Scenario | Behavior |
|----------|----------|
| User disconnects mid-AI-response | AI response continues. Reconnecting user receives full message from history. |
| Two users edit the same line simultaneously | CRDT merges both edits. No data loss. Result may need manual cleanup but nothing is dropped. |
| AI writes to a file a user is actively editing | AI's changes merge into the CRDT document alongside the user's changes. User sees AI edits appear in their editor. |
| User joins while AI is mid-stream | User receives conversation history + current partial response via WS catch-up. |
| Network partition (user goes offline) | Edits are buffered locally. On reconnect, Yjs state vector exchange syncs all missed changes. |
| All users disconnect | 30-second grace period, then Y.Doc state is persisted to filesystem and garbage-collected from memory. |
| Queue message from disconnected user | Message remains in queue for 60 seconds, then auto-cancelled with notification to other users. |

---

## Out of Scope (Future Work)

- **Voice/video chat** between collaborators
- **Granular permissions** (e.g., read-only collaborators, per-file locking)
- **Branching and merging** — each user working on a branch with merge workflow
- **Offline-first editing** — full offline support with sync-on-reconnect (current design requires connectivity)
- **Comments/annotations** on specific code lines or visual elements
- **Playback/replay** of collaboration sessions
