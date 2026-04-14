# TC-05: Preview Panel & Visual Editing

## 5.1 Live Preview (P0)

### TC-5.1.1 — Preview renders correctly
- **Steps**: Open a project with code. Observe preview panel.
- **Expected**: Preview shows rendered output. Matches code. No blank white screen.

### TC-5.1.2 — Preview refresh button
- **Steps**: Click refresh/reload button on preview toolbar.
- **Expected**: Preview reloads. Shows current state of code.

### TC-5.1.3 — Open preview in new tab
- **Steps**: Click external link button to open preview in a new browser tab.
- **Expected**: New tab opens with preview URL (e.g., `http://localhost:3100`). Full-page view of the app.

### TC-5.1.4 — Preview URL bar
- **Steps**: Check if preview has a URL bar showing the dev server address.
- **Expected**: Shows address like `http://localhost:3100` or project-specific port.

## 5.2 Responsive Design Testing (P1)

### TC-5.2.1 — Mobile viewport (375px)
- **Steps**: Click mobile device preset in preview toolbar.
- **Expected**: Preview shrinks to 375px width. Shows mobile layout (if responsive). Hamburger menus appear.

### TC-5.2.2 — Tablet viewport (768px)
- **Steps**: Click tablet preset.
- **Expected**: Preview shows tablet-width layout. Medium breakpoints applied.

### TC-5.2.3 — Desktop viewport (1200px+)
- **Steps**: Click desktop preset.
- **Expected**: Full-width layout. Desktop-specific styles applied.

### TC-5.2.4 — Custom viewport size
- **Steps**: Enter custom width/height values.
- **Expected**: Preview resizes to exact pixel dimensions. Layout adapts.

### TC-5.2.5 — Zoom controls
- **Steps**: Use zoom in/out controls on preview toolbar.
- **Expected**: Preview scales up/down. Content readable at all zoom levels.

## 5.3 Visual Editing (P1)

### TC-5.3.1 — Enter visual edit mode
- **Steps**: Click on a visual edit button/mode in the preview toolbar (if available).
- **Expected**: Visual edit mode activated. Hovering over elements in preview shows selection outlines.

### TC-5.3.2 — Select element by clicking
- **Steps**: In visual edit mode, click on an element in the preview.
- **Expected**: Element highlighted. Property panel appears showing element's properties (styles, classes, text).

### TC-5.3.3 — Edit text visually
- **Steps**: Select a text element → change text in property panel.
- **Expected**: Text updates in preview and in code simultaneously. Code editor shows the change.

### TC-5.3.4 — Edit styles visually
- **Steps**: Select an element → change a CSS property (e.g., background color) in property panel.
- **Expected**: Style applied in preview immediately. Code updated with new CSS.

### TC-5.3.5 — Visual edit conflict detection
- **Steps**: Two users in visual edit mode select the same element.
- **Expected**: Conflict warning shown. One user's selection takes priority or merge resolution offered.

## 5.4 Preview Interaction (P0)

### TC-5.4.1 — Button clicks work in preview
- **Steps**: Build an app with buttons. Click buttons in preview.
- **Expected**: JavaScript event handlers fire. State changes reflected. Buttons respond.

### TC-5.4.2 — Form inputs work in preview
- **Steps**: Build a form. Type into input fields in preview.
- **Expected**: Inputs accept text. Form validation runs. Submit works.

### TC-5.4.3 — Navigation/routing in preview
- **Steps**: Build a multi-page app. Click nav links in preview.
- **Expected**: Pages change within the preview. Browser-style routing works (hash or SPA routing).

### TC-5.4.4 — External API calls from preview
- **Steps**: Build an app that fetches from a public API. Check if data loads in preview.
- **Expected**: API data renders in preview. CORS handled. Loading states shown.

## 5.5 Preview Error States (P1)

### TC-5.5.1 — Build error display
- **Steps**: Introduce a serious error (e.g., import nonexistent module).
- **Expected**: Preview shows error overlay with stack trace. Error message readable. Not a blank screen.

### TC-5.5.2 — Runtime error display
- **Steps**: Add `throw new Error("test crash")` to a component.
- **Expected**: Error boundary catches it. Shows error in preview. Rest of app still partially functional.

### TC-5.5.3 — Recovery from error
- **Steps**: Fix the error in code.
- **Expected**: Preview auto-recovers. Shows working app again. No manual refresh needed.

## 5.6 Scaffold Status (P1)

### TC-5.6.1 — Scaffold loading indicator
- **Steps**: Create a new project. Observe preview during initial setup.
- **Expected**: Loading indicator shows while project scaffolds (npm install, vite setup). Preview shows "Setting up..." or similar.

### TC-5.6.2 — Scaffold completion
- **Steps**: Wait for scaffold to finish.
- **Expected**: Preview shows rendered app. Dev server running. Hot reload active.
