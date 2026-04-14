# TC-04: Code Editor & File Management

## 4.1 Monaco Editor (P0)

### TC-4.1.1 — Editor loads with correct syntax highlighting
- **Steps**: Open a project. Click on a `.jsx` or `.tsx` file in the file tree.
- **Expected**: Monaco editor loads with proper JSX/TSX syntax highlighting. Line numbers visible. Minimap on right.

### TC-4.1.2 — Edit code manually
- **Steps**: Click into editor → type new code (e.g., add a `<p>Hello</p>` element).
- **Expected**: Code appears. Syntax highlighting updates. Preview hot-reloads to show changes.

### TC-4.1.3 — Undo/Redo
- **Steps**: Make edits → press Ctrl+Z to undo → Ctrl+Y to redo.
- **Expected**: Changes undo/redo correctly. Preview updates accordingly.

### TC-4.1.4 — Multiple files open in tabs
- **Steps**: Click on 3 different files in the file tree.
- **Expected**: Each file opens in a separate tab. Clicking tabs switches editor content. Active tab highlighted.

### TC-4.1.5 — Close file tab
- **Steps**: Click the X on a file tab.
- **Expected**: Tab closes. If file was unsaved, prompt to save (or auto-save).

### TC-4.1.6 — Code autocompletion
- **Steps**: In a .js file, type `document.getElem` and pause.
- **Expected**: Autocomplete suggestions appear (e.g., `getElementById`). Pressing Tab/Enter completes.

### TC-4.1.7 — Find & replace (Ctrl+H)
- **Steps**: Press Ctrl+H. Type search term → replacement → click Replace All.
- **Expected**: All instances replaced. Editor updates.

### TC-4.1.8 — Go to line (Ctrl+G)
- **Steps**: Press Ctrl+G → enter line number.
- **Expected**: Editor scrolls to that line. Cursor placed there.

## 4.2 File Tree (P0)

### TC-4.2.1 — File tree shows project structure
- **Steps**: Open a project with multiple files. Check left sidebar file tree.
- **Expected**: All project files/folders shown in a hierarchical tree. Folders expandable/collapsible.

### TC-4.2.2 — Create new file
- **Steps**: Right-click in file tree → "New File" → enter name "test.js" → confirm.
- **Expected**: New file created. Appears in tree. Opens in editor (empty).

### TC-4.2.3 — Create new folder
- **Steps**: Right-click → "New Folder" → enter name "utils" → confirm.
- **Expected**: Folder created. Visible in tree. Can create files inside it.

### TC-4.2.4 — Rename file
- **Steps**: Right-click file → "Rename" → enter new name → confirm.
- **Expected**: File renamed. Tab updates. Imports in other files may need updating (manual for now).

### TC-4.2.5 — Delete file
- **Steps**: Right-click file → "Delete" → confirm.
- **Expected**: File removed from tree. Tab closes. Confirmation dialog before delete.

### TC-4.2.6 — File icons by type
- **Steps**: Create files with different extensions (.js, .css, .json, .md, .html).
- **Expected**: Each file type has a distinct icon in the tree.

### TC-4.2.7 — Nested folder navigation
- **Steps**: Create `src/components/ui/Button.jsx`. Navigate through the nested folders.
- **Expected**: Each folder level expandable. File accessible at any depth.

## 4.3 File Operations via AI (P0)

### TC-4.3.1 — AI creates files
- **Steps**: "Create a file called utils/helpers.js with a function to format dates".
- **Expected**: File appears in tree under utils/. Content matches request. Editor can open it.

### TC-4.3.2 — AI edits existing files
- **Steps**: "In App.jsx, change the title from 'Hello' to 'Welcome'".
- **Expected**: File modified in-place. Tab shows updated content. Preview updates.

### TC-4.3.3 — AI deletes files
- **Steps**: "Delete the test.js file, we don't need it anymore".
- **Expected**: File removed from tree. Tab closed if it was open.

### TC-4.3.4 — AI reads files for context
- **Steps**: "What does the App.jsx file contain?"
- **Expected**: AI accurately describes the file contents. Tool call shows file read.

## 4.4 Editor View Modes (P1)

### TC-4.4.1 — Split view (code + preview)
- **Steps**: Select split view from toolbar.
- **Expected**: Editor and preview shown side by side. Both functional.

### TC-4.4.2 — Code-only view
- **Steps**: Select code-only view.
- **Expected**: Preview panel hidden. Editor takes full width. Chat panel may still be visible.

### TC-4.4.3 — Preview-only view
- **Steps**: Select preview-only view.
- **Expected**: Editor hidden. Preview takes full width.

### TC-4.4.4 — Full screen mode
- **Steps**: Click full screen toggle.
- **Expected**: Editor goes full screen. Sidebar/toolbar hidden. Escape key exits.

## 4.5 Editor Toolbar (P1)

### TC-4.5.1 — GitHub button
- **Steps**: Click GitHub button in toolbar.
- **Expected**: Shows GitHub connection status. Options to connect repo, push, pull.

### TC-4.5.2 — Publish button
- **Steps**: Click Publish button.
- **Expected**: Publish dialog opens with deployment steps. See TC-10 for full publishing tests.

### TC-4.5.3 — Settings project button
- **Steps**: Access project settings from editor toolbar.
- **Expected**: Navigates to project settings page or opens settings panel.

## 4.6 File Presence Indicators (P2)

### TC-4.6.1 — Presence dots on tabs
- **Steps**: When collaborators are editing the same project, observe file tabs.
- **Expected**: Colored dots appear on tabs being edited by other users. Dot color matches collaborator's color.

## 4.7 Hot Reload / Live Preview Sync (P0)

### TC-4.7.1 — Code change triggers preview update
- **Steps**: Edit a visible element in code (e.g., change `<h1>Hello</h1>` to `<h1>World</h1>`).
- **Expected**: Preview updates within 1-2 seconds. No manual refresh needed.

### TC-4.7.2 — CSS change triggers preview update
- **Steps**: Change a CSS property (e.g., `color: red` → `color: blue`).
- **Expected**: Preview reflects color change immediately.

### TC-4.7.3 — Syntax error doesn't crash preview
- **Steps**: Introduce a syntax error (e.g., missing closing bracket). Then fix it.
- **Expected**: Preview shows error overlay. After fix, preview recovers automatically.

## 4.8 Version History (P1)

### TC-4.8.1 — View version history
- **Steps**: Open version history tab/panel in sidebar.
- **Expected**: List of snapshots shown with timestamps and descriptions. Most recent at top.

### TC-4.8.2 — Restore previous version
- **Steps**: Click on an older version → click "Restore".
- **Expected**: Project files revert to that version's state. Preview updates. Author can undo via newer snapshot.

### TC-4.8.3 — Version created after AI build
- **Steps**: Have AI build something (creates files). Check version history.
- **Expected**: New version snapshot created after the build. Shows what changed.
