# 17 — Multi-User Infrastructure, Tenant Isolation & Concurrency

## Overview

Doable is a **multi-tenant platform** where many users — across many workspaces — simultaneously build, preview, chat with AI, and deploy projects. Every subsystem must be designed for **concurrent multi-user access** from day one. This document specifies the isolation, concurrency, and resource management requirements that ensure Doable works safely and reliably when 10, 100, or 1,000+ users are active at the same time.

> **Core Principle**: No user should ever see, modify, or be affected by another user's data, sessions, builds, or resources — unless they are explicitly collaborating on the same project within the same workspace.

---

## 1. Workspace & Tenant Isolation

### 1.1 Authorization Model

Every API request that accesses a resource (project, folder, AI session, deployment, analytics, etc.) MUST verify that the authenticated user has membership in the workspace that owns that resource. This is not optional — it is a **security invariant**.

| Layer | Responsibility |
|-------|----------------|
| **Auth Middleware** | Verifies JWT, extracts `userId` |
| **Workspace Authorization Middleware** | Verifies `userId` is a member of the workspace that owns the requested resource. Returns 403 if not. |
| **Role Check** | Verifies user's role (owner/admin/member/viewer) meets the minimum required for the operation |
| **Database Queries** | All resource queries MUST include `workspace_id` filter as defense-in-depth |

### 1.2 Workspace Authorization Middleware

A dedicated middleware that runs on **every authenticated route** that touches a workspace-scoped resource:

```
Request → authMiddleware (extract userId)
        → workspaceAuthMiddleware (verify membership + extract role)
        → route handler (safe to proceed)
```

**Rules:**
- `GET /projects/:id` — resolve project → get `workspace_id` → verify user is member of that workspace
- `POST /projects/:id/chat` — same check
- `POST /projects/:id/publish` — same check + verify role >= member
- `DELETE /projects/:id` — same check + verify role >= admin
- ALL routes that accept a `projectId`, `folderId`, `sessionId`, or `workspaceId` param MUST go through this middleware

### 1.3 Database-Level Defense-in-Depth

Application-level checks are the primary defense. Database-level isolation is the secondary safety net.

| Strategy | When to Implement | Description |
|----------|-------------------|-------------|
| **Query-level filtering** | Phase 0 (now) | Every `findById()` query accepts `workspaceId` parameter and includes `WHERE workspace_id = $workspaceId` |
| **PostgreSQL Row-Level Security** | Phase 2 | Enable RLS on all tenant-scoped tables. Policies enforce `workspace_id` filtering at the database level. Even a SQL injection cannot read cross-tenant data. |
| **Connection-level context** | Phase 3 (enterprise) | Set `SET LOCAL app.current_workspace_id = '...'` on each request's database connection. RLS policies reference this variable. |

### 1.4 Data Isolation Matrix

| Resource | Isolation Scope | Enforcement |
|----------|----------------|-------------|
| Projects | Workspace | Middleware + DB query |
| Folders | Workspace | Middleware + DB query |
| AI Sessions | Workspace + User | Middleware + DB query |
| AI Messages | Workspace + User + Session | Middleware + DB query |
| Deployments | Workspace + Project | Middleware + DB query |
| Analytics | Workspace + Project | Middleware + DB query |
| Billing/Credits | Workspace | Middleware + DB query |
| Feature Flags | Platform-wide (admin) | Platform admin check |
| Templates | Platform-wide (read) / Workspace (custom) | Public read, workspace write |
| GitHub Connections | Workspace + Project | Middleware + DB query |
| Starred Projects | User + Workspace | User owns star, project must be in user's workspace |

---

## 2. AI Session Isolation

### 2.1 Problem

AI sessions (Copilot SDK conversations) must be isolated per user. If two users are working on the same project, each must have their own independent AI session with their own conversation history, tool execution state, and context.

### 2.2 Session Scoping

| Session Key | Scope | Description |
|-------------|-------|-------------|
| **In-memory session** | `projectId + userId + mode` | Each user gets their own Copilot SDK session per project per mode (agent/plan/visual-edit) |
| **Database session** | `project_id + user_id` | Persistent session record with message history |
| **Session ID** | Globally unique | UUID per session, never reused |

### 2.3 Session Lifecycle

```
User opens project editor
  → Create or resume AI session for (projectId, userId, mode)
  → Session stored in-memory (Tier 0) or Redis (Tier 1+)
  → Each message appended to user's own session
  → Tool calls execute in user's own context
  → Session persisted to database on each message

User closes editor
  → Session remains in memory for TTL (30 minutes)
  → After TTL, session evicted from memory
  → Database record persists indefinitely
  → Re-opening editor resumes from database state
```

### 2.4 Session Storage Tiers

| Tier | Storage | Behavior |
|------|---------|----------|
| **Tier 0** | In-memory Map keyed by `projectId:userId:mode` | Single server only. Lost on restart. |
| **Tier 1** | Redis hash keyed by `projectId:userId:mode` | Survives restarts. Shared across API instances. |
| **Tier 2+** | Redis + database persistence | Full durability. Session state reconstructible from DB. |

### 2.5 Concurrent Users on Same Project

When multiple users chat with the same project:
- Each user has their own AI session (separate conversation, separate tool state)
- File changes made by one user's AI session are visible to all users via filesystem (eventual consistency)
- Each user's preview reflects the current state of the project files
- No message interleaving between users
- Credit consumption is tracked per-user but deducted from the shared workspace pool

---

## 3. Preview Dev Server Resource Management

### 3.1 Problem

Each project requires a Vite dev server process for live preview. These processes consume memory (80-500MB each) and ports. Without lifecycle management, the system exhausts resources as users open projects.

### 3.2 Dev Server Lifecycle

```
User opens project editor
  → Check if dev server exists for this project
  → If yes: reuse existing server (shared across users of same project)
  → If no: allocate port, spawn Vite process, wait for ready

User closes editor (last user leaves project)
  → Start idle timer (configurable, default 15 minutes)
  → If no user reopens within TTL: stop dev server, release port

System under memory pressure
  → LRU eviction: stop least-recently-used dev servers first
  → Notify affected users: "Preview restarting..."
```

### 3.3 Resource Limits

| Parameter | Default | Configurable | Description |
|-----------|---------|-------------|-------------|
| `MAX_DEV_SERVERS` | 50 | Yes (env var) | Maximum concurrent dev server processes |
| `DEV_SERVER_IDLE_TTL` | 15 min | Yes (env var) | Time before idle server is stopped |
| `DEV_SERVER_PORT_RANGE` | 3100-3600 | Yes (env var) | Available port range (500 ports) |
| `DEV_SERVER_MEMORY_LIMIT` | 512 MB | Yes (env var) | Per-process memory limit (via `--max-old-space-size`) |
| `SYSTEM_MEMORY_THRESHOLD` | 80% | Yes (env var) | When total system memory exceeds this, trigger LRU eviction |

### 3.4 Dev Server Sharing Model

One dev server per project (not per user). Multiple users viewing the same project share the same Vite process.

| Scenario | Behavior |
|----------|----------|
| User A opens Project X | Spawn dev server on port 3100 |
| User B opens Project X | Reuse existing server on port 3100 |
| User A closes Project X | Server stays alive (User B still active) |
| User B closes Project X | Start idle timer (15 min) |
| No one reopens | Stop server, release port 3100 |
| User C opens Project Y while 50 servers running | LRU evict oldest idle server, spawn new one |

### 3.5 Health Monitoring

| Check | Frequency | Action on Failure |
|-------|-----------|-------------------|
| Process alive | 30s | Restart dev server |
| Port responsive | 60s | Restart dev server |
| Memory usage | 60s | Log warning at 80%, kill at limit |
| Orphan detection | On API startup | Kill processes on tracked ports that don't match active servers |

---

## 4. Build & Deploy Concurrency

### 4.1 Problem

Multiple users may trigger builds or deployments simultaneously — either on different projects (resource contention) or on the same project (race condition).

### 4.2 Per-Project Deploy Mutex

Only one build/deploy can run per project at a time. Concurrent requests are queued, not rejected.

```
User A clicks Publish on Project X
  → Acquire lock for project X
  → Build + deploy
  → Release lock

User B clicks Publish on Project X (while A is building)
  → Wait for lock (with timeout)
  → UI shows: "Deploy in progress, queued..."
  → When lock released: proceed with build + deploy
```

### 4.3 Global Build Concurrency

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_CONCURRENT_BUILDS` | 3 | Maximum simultaneous Vite builds across all projects |
| `BUILD_QUEUE_MAX` | 20 | Maximum queued builds before rejecting new requests |
| `BUILD_TIMEOUT` | 120s | Maximum time for a single build before it's killed |

### 4.4 Implementation Strategy

| Tier | Strategy |
|------|----------|
| **Tier 0** | In-memory mutex per project (Map of Promises). Global semaphore for concurrent build limit. |
| **Tier 1+** | Redis-based distributed lock (`SETNX` with TTL). BullMQ job queue for builds. |

### 4.5 Subdomain Race Condition Fix

Subdomain generation must be atomic:

```sql
-- Use INSERT ... ON CONFLICT to atomically claim a subdomain
INSERT INTO projects (id, subdomain)
VALUES ($projectId, $candidate)
ON CONFLICT (subdomain) DO NOTHING
RETURNING subdomain;

-- If no row returned, candidate was taken → retry with new candidate
```

---

## 5. File System Concurrency

### 5.1 Problem

Multiple users editing the same project (or an AI session executing tool calls while a user manually edits) can cause lost writes.

### 5.2 Concurrency Strategy by Phase

| Phase | Strategy | Description |
|-------|----------|-------------|
| **Phase 0-1** | Last-Write-Wins + Versioning | Simple. Every write creates a version snapshot. Users can always rollback. Acceptable for single-user or small teams. |
| **Phase 2** | Optimistic Concurrency | Each file operation includes an `expectedVersion` (hash or timestamp). Server rejects writes where the file has changed since the client last read it. Client must re-read and retry. |
| **Phase 3+** | CRDT-based Collaborative Editing | Real-time conflict-free editing via Yjs. See Section 6 (Real-Time Collaboration). |

### 5.3 File Operation Safety (Phase 0-1)

Even with Last-Write-Wins, basic safety measures:

| Measure | Description |
|---------|-------------|
| **Atomic writes** | Write to temp file, then `rename()` (atomic on POSIX). Prevents partial writes. |
| **Pre-write snapshot** | Before any AI tool call batch, snapshot the project state. If the batch fails, restore snapshot. |
| **Write notifications** | When a file is written (by AI or user), broadcast a WebSocket event to all users viewing that project. Their editor reloads the file. |

---

## 6. Real-Time Collaborative Editing

### 6.1 Overview

Real-time collaboration allows multiple users to simultaneously edit the same project with live presence, cursor tracking, and conflict-free concurrent edits. This is **critical for business and enterprise users** who need teams to work together on projects.

> **Priority**: This is elevated to Phase 2 (not Phase 4). Businesses paying for team plans expect real-time collaboration as a core feature.

### 6.2 Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User A       │     │  User B       │     │  User C       │
│  (Browser)    │     │  (Browser)    │     │  (Browser)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │ WebSocket          │ WebSocket          │ WebSocket
       └──────────┬─────────┴────────────────────┘
                  │
          ┌───────▼────────┐
          │  WS Gateway     │
          │  (Hono WS)     │
          │                │
          │  Yjs Provider   │  ← CRDT document sync
          │  Presence       │  ← Cursor positions, selections, online status
          │  Awareness      │  ← User identity, colors
          └───────┬────────┘
                  │
          ┌───────▼────────┐
          │  Persistence    │
          │                │
          │  Yjs → Files   │  ← CRDT state → filesystem (on debounce)
          │  Files → Yjs   │  ← Filesystem → CRDT state (on external change)
          └────────────────┘
```

### 6.3 Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **CRDT Engine** | Yjs | Most mature, best performance, largest ecosystem. Proven at scale (used by Notion, Tiptap, BlockNote). |
| **Transport** | y-websocket | Native Yjs WebSocket provider. Handles sync, awareness, and reconnection. |
| **Code Editor Binding** | y-monaco | Official Yjs binding for Monaco Editor. Handles selections, cursors, undo/redo. |
| **Persistence** | y-leveldb or custom | Server-side persistence of Yjs documents. Flush to filesystem on debounce. |
| **Awareness Protocol** | Yjs Awareness | Built-in protocol for presence (cursor position, selection, user info, online state). |

### 6.4 Features

| Feature | Description | Phase |
|---------|-------------|-------|
| **Multi-cursor editing** | See other users' cursors in real-time in the code editor | Phase 2 |
| **Selection awareness** | See what other users have selected | Phase 2 |
| **User presence** | See who's online in the project (avatar, name, color) | Phase 2 |
| **Conflict-free edits** | CRDT ensures no conflicts — all edits merge automatically | Phase 2 |
| **Undo/redo per user** | Each user has their own undo stack | Phase 2 |
| **Shared preview** | All users see the same live preview state | Phase 2 |
| **AI session visibility** | See when another user's AI is making changes (activity indicator) | Phase 2 |
| **File-level locks (optional)** | Business+ users can optionally lock a file while editing | Phase 3 |
| **Shared AI chat** | Team sees the same AI conversation and can contribute | Phase 3 |
| **Comments on code** | Inline comments on specific lines/selections | Phase 3 |
| **Suggested changes** | Propose changes for review (like GitHub suggestions) | Phase 4 |

### 6.5 Presence System

```typescript
// Awareness state per user
interface UserPresence {
  userId: string;
  displayName: string;
  avatarUrl: string;
  color: string;           // Unique color per user in session
  cursor: {
    file: string;          // Which file they're in
    line: number;
    column: number;
  } | null;
  selection: {
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  } | null;
  activePanel: 'code' | 'preview' | 'chat';
  lastActive: number;      // Timestamp
}
```

### 6.6 AI + Collaboration Interaction

When a user's AI session modifies files while other users are editing:

| Scenario | Behavior |
|----------|----------|
| AI creates a new file | File appears in all users' file trees instantly |
| AI edits a file no one is editing | File content updates via Yjs sync |
| AI edits a file someone IS editing | Yjs CRDT merges both changes automatically. No conflicts. |
| AI deletes a file someone has open | User sees "File deleted by [User]'s AI" notification. Editor closes file tab. |
| Two users' AIs both edit same file | Both changes merged via CRDT. Final state is deterministic. |

### 6.7 Collaboration Tiers

| Tier | Capability | Plan |
|------|-----------|------|
| **No collaboration** | Single user per project at a time | Free |
| **Basic collaboration** | Presence + shared preview (no co-editing) | Pro |
| **Full collaboration** | Multi-cursor co-editing + presence + shared preview | Business+ |
| **Enterprise collaboration** | All above + file locks + shared AI chat + comments | Enterprise |

### 6.8 Performance Requirements

| Metric | Target |
|--------|--------|
| Keystroke propagation latency | < 100ms (p95) |
| Cursor position update latency | < 150ms (p95) |
| Presence update latency | < 500ms |
| Document sync on reconnect | < 2s |
| Max concurrent editors per project | 25 |
| WebSocket memory per connection | < 2 MB |

---

## 7. Rate Limiting

### 7.1 Per-User Rate Limiting

Rate limiting MUST be per-user (by `userId`), not per-IP. IP-based limiting penalizes users behind shared networks and fails to throttle per-user abuse.

| Endpoint Category | Limit | Window | Key |
|-------------------|-------|--------|-----|
| **AI chat messages** | 30 | 1 min | `userId` |
| **File operations** | 120 | 1 min | `userId` |
| **Deploy/publish** | 5 | 5 min | `userId + projectId` |
| **Auth (login/register)** | 10 | 15 min | IP address (pre-auth) |
| **API general** | 200 | 1 min | `userId` |
| **WebSocket connections** | 10 | 1 min | `userId` |
| **Template creation** | 5 | 1 hour | `userId` |

### 7.2 Implementation

| Tier | Strategy |
|------|----------|
| **Tier 0** | In-memory sliding window counter per `userId`. Resets on server restart. |
| **Tier 1+** | Redis sliding window (`ZADD` + `ZRANGEBYSCORE`). Shared across API instances. |

### 7.3 Rate Limit Response

```
HTTP 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709654400
```

### 7.4 Plan-Based Limits

Higher-tier plans get higher rate limits:

| Plan | AI Messages/min | API Requests/min | Concurrent WebSockets |
|------|----------------|-------------------|----------------------|
| Free | 10 | 100 | 3 |
| Pro | 30 | 300 | 10 |
| Business | 60 | 600 | 25 |
| Enterprise | Custom | Custom | Custom |

---

## 8. Credit Consumption Safety

### 8.1 Atomic Credit Deduction

Credit deduction MUST be transactional with row-level locking to prevent race conditions:

```sql
BEGIN;
SELECT * FROM credits WHERE workspace_id = $1 FOR UPDATE;
-- Check remaining >= cost
-- Deduct from daily_remaining, monthly_remaining, or rollover
-- Log to credit_usage
COMMIT;
```

### 8.2 Pre-Flight Credit Check

Before starting an expensive operation (AI chat, build), check credit availability WITHOUT deducting. Deduct only on completion or per-token during streaming.

| Operation | Pre-flight Check | Deduction Strategy |
|-----------|-----------------|-------------------|
| AI chat message | Verify >= 1 credit available | Deduct on completion (actual token cost) |
| Build/deploy | Verify >= 1 credit available | Deduct fixed cost on completion |
| Visual edit | Verify >= 1 credit available | Deduct on completion |

### 8.3 Workspace Credit Fairness

When multiple users share a workspace's credit pool:

| Feature | Description |
|---------|-------------|
| **Per-member credit limits** | Admins can set max daily/monthly credits per user |
| **Usage visibility** | Dashboard shows per-user credit consumption |
| **Low credit warnings** | Notify all workspace members when credits are running low |
| **Credit reservation** | On AI request start, reserve estimated credits. Release unused on completion. |

---

## 9. WebSocket Infrastructure

### 9.1 Connection Management

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_WS_CONNECTIONS_TOTAL` | 1000 | Maximum total WebSocket connections |
| `MAX_WS_CONNECTIONS_PER_USER` | 10 | Maximum connections per user (multiple tabs) |
| `MAX_WS_CONNECTIONS_PER_PROJECT` | 50 | Maximum connections per project room |
| `WS_HEARTBEAT_INTERVAL` | 30s | Ping interval to detect dead connections |
| `WS_IDLE_TIMEOUT` | 5 min | Disconnect idle connections (no heartbeat response) |

### 9.2 Room Architecture

```
WebSocket Server
├── Project Room: project-abc123
│   ├── User A (cursor sync, file changes, presence)
│   ├── User B (cursor sync, file changes, presence)
│   └── User C (cursor sync, file changes, presence)
├── Project Room: project-def456
│   └── User D (cursor sync, file changes, presence)
└── User Channel: user-A
    └── Notifications, credit alerts, system messages
```

### 9.3 Message Types

| Message | Direction | Description |
|---------|-----------|-------------|
| `join_project` | Client → Server | Join a project room |
| `leave_project` | Client → Server | Leave a project room |
| `cursor_update` | Bidirectional | Cursor position change (via Yjs awareness) |
| `file_changed` | Server → Client | A file was modified (by AI, another user, or external) |
| `file_created` | Server → Client | A new file was created |
| `file_deleted` | Server → Client | A file was deleted |
| `presence_update` | Server → Client | User joined/left/went idle |
| `ai_activity` | Server → Client | Another user's AI session is active (typing indicator) |
| `deploy_status` | Server → Client | Build/deploy progress update |
| `credit_alert` | Server → Client | Low credit warning |
| `notification` | Server → Client | General notification |

### 9.4 Scaling Strategy

| Tier | Strategy |
|------|----------|
| **Tier 0** | Single WS process embedded in API server. All rooms in-memory. |
| **Tier 1** | Separate WS process. Redis pub/sub for cross-process room sync. |
| **Tier 2+** | Multiple WS instances behind load balancer with sticky sessions. Redis pub/sub for room state. |

---

## 10. Monitoring & Observability for Multi-User

### 10.1 Key Metrics to Track

| Metric | Alert Threshold | Description |
|--------|----------------|-------------|
| Active dev servers | > 80% of MAX_DEV_SERVERS | Approaching process limit |
| System memory usage | > 85% | Memory pressure, trigger LRU eviction |
| Active AI sessions | Trending up + high latency | AI backend overloaded |
| WebSocket connections | > 80% of max | Connection limit approaching |
| Build queue depth | > 10 | Builds backing up |
| Credit deduction failures | Any | Transaction errors — data integrity issue |
| 403 responses (auth failures) | Spike | Possible unauthorized access attempts |
| Cross-tenant access attempts | Any | Security incident — investigate immediately |

### 10.2 Per-User Dashboards (Platform Admin)

Platform admins should see:
- Active users (real-time)
- Active projects (with dev server status)
- AI session count and credit consumption rate
- Build/deploy queue status
- WebSocket connection count
- Error rates per user/workspace

---

## 11. Phase Integration

These multi-user requirements integrate into the development phases as follows:

| Requirement | Phase | Priority |
|-------------|-------|----------|
| Workspace authorization middleware | **Phase 0** | CRITICAL — must fix before any public users |
| Per-user AI session isolation | **Phase 0** | CRITICAL — security requirement |
| Dev server idle timeout + LRU eviction | **Phase 0** | HIGH — prevents resource exhaustion |
| Deploy mutex (per-project) | **Phase 0** | HIGH — prevents broken deploys |
| Atomic file writes | **Phase 0** | HIGH — prevents data corruption |
| Per-user rate limiting | **Phase 1** | HIGH — prevents abuse |
| WebSocket file change notifications | **Phase 1** | MEDIUM — improves multi-user UX |
| Build concurrency limiter | **Phase 1** | MEDIUM — prevents resource starvation |
| Database query workspace filtering | **Phase 1** | HIGH — defense-in-depth |
| Real-time presence system | **Phase 2** | HIGH — core collaboration feature |
| CRDT collaborative editing (Yjs) | **Phase 2** | HIGH — critical for business users |
| Optimistic file concurrency | **Phase 2** | MEDIUM — better than LWW |
| PostgreSQL Row-Level Security | **Phase 2** | MEDIUM — defense-in-depth |
| Redis-based session storage | **Phase 2** | MEDIUM — scalability |
| Redis-based rate limiting | **Phase 2** | MEDIUM — scalability |
| Shared AI chat | **Phase 3** | MEDIUM — enterprise feature |
| File-level locks | **Phase 3** | LOW — optional feature |
| Connection-level DB context | **Phase 3** | LOW — enterprise defense-in-depth |
| Comments and annotations | **Phase 3** | MEDIUM — enterprise feature |

---

## 12. Security Invariants (Non-Negotiable)

These MUST be true at all times, regardless of phase:

1. **No cross-workspace data access**: A user CANNOT read, write, or infer the existence of resources in a workspace they are not a member of.
2. **No AI session bleed**: A user's AI conversation history, tool execution state, and suggestions are NEVER visible to another user (unless shared AI chat is explicitly enabled for the project).
3. **No credit theft**: A user CANNOT consume credits from a workspace they are not a member of.
4. **No preview hijacking**: A user CANNOT view or interact with another workspace's dev server preview.
5. **No deploy interference**: A user CANNOT trigger, cancel, or modify another workspace's deployment.
6. **Graceful degradation**: When resource limits are hit (max dev servers, max connections, max builds), the system queues or rejects new requests with clear error messages — it does NOT crash or corrupt state.
7. **Audit trail**: Every cross-boundary access attempt (successful or denied) is logged for security review.
