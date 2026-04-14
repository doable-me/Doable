# TC-02: Project Creation

## 2.1 Build Mode — Text Prompt (P0)

### TC-2.1.1 — Create project from dashboard hero input
- **Steps**: On dashboard, type "Build a calculator app" in the hero input → click "Build" button.
- **Expected**: Project created. Navigates to `/editor/{newProjectId}`. AI begins streaming response. Building overlay shows. Preview eventually renders a calculator.

### TC-2.1.2 — Build with detailed prompt
- **Steps**: Type "Build a beautiful weather dashboard with a search bar for cities, a 5-day forecast, and dark mode toggle using Tailwind CSS" → click Build.
- **Expected**: AI generates multi-file project. Files include HTML/React components, CSS, weather API integration code. Preview shows weather UI.

### TC-2.1.3 — Build with simple one-word prompt
- **Steps**: Type "Portfolio" → click Build.
- **Expected**: AI creates a portfolio website. Reasonable scaffold with sections (hero, about, projects, contact).

### TC-2.1.4 — Build button disabled when input empty
- **Steps**: Leave hero input empty. Observe Build button.
- **Expected**: Build button is disabled or sends nothing. No empty project created.

### TC-2.1.5 — Prompt with special characters
- **Steps**: Type "Build an app that says 'Hello <World>' & handles \"quotes\"" → Build.
- **Expected**: Project created without XSS. Special chars preserved in prompt display. AI handles them correctly.

## 2.2 Plan Mode (P0)

### TC-2.2.1 — Plan first basic flow
- **Steps**: Type "Build a project management tool" → click "Plan first".
- **Expected**: AI enters plan mode. Generates a structured plan (architecture, components, features, implementation steps). Does NOT write code initially. Shows plan for review.

### TC-2.2.2 — Plan mode restrictions
- **Steps**: In plan mode, observe AI behavior.
- **Expected**: AI uses read-only tools (view, glob, grep) only. No file writes. `ask_clarification` called where needed. Plan.md generated.

### TC-2.2.3 — Approve plan → build
- **Steps**: After plan is generated, approve it (click approve/build button or type "looks good, build it").
- **Expected**: AI transitions from plan to build mode. Begins implementing the plan. Files created. Preview renders.

### TC-2.2.4 — Reject plan with feedback
- **Steps**: After plan, type "I want it to use Supabase instead of local storage".
- **Expected**: AI revises the plan incorporating feedback. New plan reflects Supabase integration.

## 2.3 Image Attachments (P1)

### TC-2.3.1 — Attach wireframe image
- **Steps**: Click "Attach image" button → upload a wireframe/mockup PNG → type "Build this" → Build.
- **Expected**: Image appears as preview in input area. AI analyzes the wireframe and generates matching UI. Layout roughly matches the wireframe.

### TC-2.3.2 — Attach screenshot for redesign
- **Steps**: Upload a screenshot of an existing website → type "Recreate this design" → Build.
- **Expected**: AI creates a project that visually resembles the screenshot. Colors, layout, and components match.

### TC-2.3.3 — Attach multiple images
- **Steps**: Attach 2-3 images (e.g., different page mockups) → type "Build this multi-page app" → Build.
- **Expected**: All images visible in attachment preview. AI processes all images and creates appropriate pages.

### TC-2.3.4 — Remove attachment before send
- **Steps**: Attach an image → click remove/X on the attachment preview → then Build with text only.
- **Expected**: Image removed from input. Project created based on text only.

### TC-2.3.5 — Large image handling
- **Steps**: Attach a very large image (10MB+) → Build.
- **Expected**: Either resized/compressed automatically, or shows file size error with helpful message.

## 2.4 Voice Input (P2)

### TC-2.4.1 — Voice input button
- **Steps**: Click microphone/voice input button on dashboard hero.
- **Expected**: Browser requests microphone permission. Speech-to-text begins. Spoken words appear in input.

### TC-2.4.2 — Voice to build flow
- **Steps**: Use voice to say "Build a todo list" → click Build.
- **Expected**: Text captured correctly. Build proceeds as normal.

## 2.5 Prompt Bridge — Immediate Start (P0)

### TC-2.5.1 — Zero-delay project start
- **Steps**: Submit a build prompt on dashboard. Observe timing.
- **Expected**: SSE connection starts immediately (prompt bridge). Navigation to editor page happens while AI is already streaming. No dead time between dashboard submit and first AI chunk.

### TC-2.5.2 — Bridge recovery on slow navigation
- **Steps**: Submit a prompt → wait 5+ seconds before editor loads.
- **Expected**: Editor picks up in-flight stream via prompt bridge. Buffered events replayed. No lost content.

## 2.6 Build Overlay (P1)

### TC-2.6.1 — First generation overlay
- **Steps**: Create new project from prompt. Observe editor during build.
- **Expected**: Blurred/dimmed overlay covers preview with building status. Shows "Building..." or tool action descriptions.

### TC-2.6.2 — Follow-up build overlay
- **Steps**: In an existing project, send a message → observe overlay.
- **Expected**: Lighter overlay (75% opacity, 2px blur). Shows "Building from plan..." when in plan-building phase.

### TC-2.6.3 — Overlay dismisses after build complete
- **Steps**: Wait for AI to finish responding.
- **Expected**: Overlay fades away. Preview becomes interactive. Code editor shows generated files.

## 2.7 Project Naming (P1)

### TC-2.7.1 — Auto-generated project name
- **Steps**: Create project with prompt "Build a landing page for a SaaS product".
- **Expected**: Project name auto-generated from prompt (e.g., "SaaS Landing Page" or similar descriptive name).

### TC-2.7.2 — Rename project after creation
- **Steps**: In editor or project settings, change the project name.
- **Expected**: New name reflected in sidebar, dashboard project list, and browser title.

## 2.8 Error Handling (P1)

### TC-2.8.1 — Network error during creation
- **Steps**: Disable network temporarily → try to create project → re-enable.
- **Expected**: Error message shown. User can retry. No orphaned project records.

### TC-2.8.2 — AI timeout during build
- **Steps**: Create a very complex project and wait for potential timeout.
- **Expected**: If timeout occurs, user sees "AI timed out" message. Partial progress preserved. User can continue with follow-up message.

### TC-2.8.3 — Concurrent project creation
- **Steps**: Rapidly click Build on two different prompts in quick succession.
- **Expected**: First project created. Second either queued or shown as error. No data corruption.
