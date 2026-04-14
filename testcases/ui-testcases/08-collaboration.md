# TC-08: Collaboration

## 8.1 Real-time Presence (P1)

### TC-8.1.1 — Collaborator appears when joining
- **Steps**: User A opens project. User B opens same project in another tab/browser.
- **Expected**: Both users see each other's avatars in the collaboration header. Presence indicators visible.

### TC-8.1.2 — Remote cursor tracking
- **Steps**: User A and B both editing. A clicks into a file at a specific line.
- **Expected**: B sees A's colored cursor at that line. Cursor updates in real-time as A moves.

### TC-8.1.3 — Remote selection highlighting
- **Steps**: User A selects a block of text in the editor.
- **Expected**: B sees A's selection highlighted in A's color. Selection updates as A changes it.

### TC-8.1.4 — Collaborator leaves
- **Steps**: User B closes the editor tab.
- **Expected**: B's avatar disappears from A's collaboration header. B's cursor disappears.

### TC-8.1.5 — Multi-tab same user
- **Steps**: Same user opens two tabs of the same project.
- **Expected**: Both tabs functional. Edits in one tab reflected in the other. No crash. User appears once in presence (or with tab count).

## 8.2 CRDT Collaborative Editing (P0)

### TC-8.2.1 — Concurrent edits on same file
- **Steps**: User A and B both open the same file. A types at line 10, B types at line 20.
- **Expected**: Both edits merge cleanly. No data loss. Both users see each other's edits in real-time.

### TC-8.2.2 — Concurrent edits on same line
- **Steps**: A and B both type at the same line.
- **Expected**: Yjs CRDT merges the characters. Both users' text appears (interleaved or sequentially). No crash. No data corruption.

### TC-8.2.3 — Offline/reconnect sync
- **Steps**: User B loses network briefly → makes edits → reconnects.
- **Expected**: Edits sync on reconnect. Yjs state vector resolves. Both users see consistent state.

### TC-8.2.4 — Large file collaborative editing
- **Steps**: Both users edit a 500+ line file simultaneously.
- **Expected**: No performance degradation. Edits merge correctly. No memory leaks.

### TC-8.2.5 — Different files simultaneously
- **Steps**: A edits file1.jsx. B edits file2.css. Both in same project.
- **Expected**: No interference. Each file editable independently. Preview reflects both.

## 8.3 Team Chat (P1)

### TC-8.3.1 — Send team chat message
- **Steps**: Open team chat in project. Type a message and send.
- **Expected**: Message appears in chat. Other collaborators see it in real-time.

### TC-8.3.2 — Chat message history
- **Steps**: Send several messages → close and reopen chat panel.
- **Expected**: Previous messages loaded from history. Scrollable.

### TC-8.3.3 — Typing indicator
- **Steps**: User A starts typing. User B observes.
- **Expected**: B sees "A is typing..." indicator. Disappears when A stops or sends.

### TC-8.3.4 — Chat with @mention
- **Steps**: Type "@" followed by collaborator name.
- **Expected**: Autocomplete shows collaborator names. Mention styled differently. Notification to mentioned user.

## 8.4 AI Chat Sync (P1)

### TC-8.4.1 — AI response visible to all collaborators
- **Steps**: User A sends an AI chat message. User B observes.
- **Expected**: B sees A's message and the AI response in real-time. Tool calls and status visible to both.

### TC-8.4.2 — File changes from AI visible to collaborators
- **Steps**: A sends AI prompt that edits files. B observes their editor.
- **Expected**: B's editor updates with AI's file changes via Yjs sync. Preview updates for both.

### TC-8.4.3 — Both users send AI messages
- **Steps**: A sends a prompt. B sends a different prompt right after.
- **Expected**: Both prompts processed (sequentially or with conflict handling). Results don't corrupt each other.

## 8.5 Visual Edit Collaboration (P2)

### TC-8.5.1 — Remote visual cursors
- **Steps**: A enters visual edit mode on preview. B observes.
- **Expected**: B sees A's visual cursor/selection on the preview. Color-coded.

### TC-8.5.2 — Concurrent visual edits
- **Steps**: A selects element X. B selects element Y.
- **Expected**: Both selections visible. Both can edit independently.

### TC-8.5.3 — Same element visual edit conflict
- **Steps**: A and B both try to edit the same element.
- **Expected**: Conflict warning displayed. Resolution mechanism available.

## 8.6 Collaboration Activity Overlay (P2)

### TC-8.6.1 — Activity overlay shows current actions
- **Steps**: While collaborators are active, observe activity overlay.
- **Expected**: Shows what other users are doing (editing file X, viewing preview, in AI chat).

## 8.7 Preview Sync (P1)

### TC-8.7.1 — Both users see same preview state
- **Steps**: After AI builds, both A and B observe preview.
- **Expected**: Same content rendered for both. Changes synced in real-time.

### TC-8.7.2 — Preview interaction by one user doesn't affect other
- **Steps**: A clicks a button in preview. B observes.
- **Expected**: A's interaction is local. B doesn't see A's clicks/form inputs in preview (preview state is independent per user).

## 8.8 Workspace Sharing (P1)

### TC-8.8.1 — Share workspace with another user
- **Steps**: Go to workspace settings → invite a user by email → assign role (editor/viewer).
- **Expected**: Invitation sent. Invited user can accept. After accepting, they see the workspace and its projects.

### TC-8.8.2 — Shared workspace project access
- **Steps**: After user joins shared workspace, they navigate to a project.
- **Expected**: Project opens in editor. User can edit (if editor role) or view (if viewer role).

### TC-8.8.3 — Workspace member roles
- **Steps**: Invite users with different roles: admin, editor, viewer.
- **Expected**: Admin: full workspace settings access. Editor: create/edit projects. Viewer: read-only access to projects.

### TC-8.8.4 — Remove member from workspace
- **Steps**: Go to workspace settings → members → remove a member.
- **Expected**: Member removed. They lose access to workspace projects immediately.
