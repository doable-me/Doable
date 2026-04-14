# TC-03: AI Chat — Comprehensive

## 3.1 Basic Chat Interaction (P0)

### TC-3.1.1 — Send first message in new project
- **Steps**: Open a new project editor. Type "Add a blue header with the title 'My App'" → Send.
- **Expected**: AI streams response with reasoning. Tool calls shown (create_file/edit_file). Preview updates to show blue header.

### TC-3.1.2 — Send follow-up message (multi-turn)
- **Steps**: After TC-3.1.1, type "Change the header to red and add a subtitle" → Send.
- **Expected**: AI remembers previous context. Edits the existing file (not recreates). Header turns red. Subtitle added.

### TC-3.1.3 — Multi-turn context retention (5+ turns)
- **Steps**: Send 5 follow-up messages, each building on previous: add nav → add footer → change colors → add animation → revert animation.
- **Expected**: Each response is contextually aware. No "I don't know what header you're referring to" errors. Final state matches cumulative instructions.

### TC-3.1.4 — Empty message send
- **Steps**: Try to send an empty message (just press Enter or click send with empty input).
- **Expected**: Message not sent. Send button disabled or no-op. No error.

### TC-3.1.5 — Very long message
- **Steps**: Send a 2000+ character message with detailed requirements.
- **Expected**: Message sent successfully. AI processes entire message. No truncation.

### TC-3.1.6 — Message with code blocks
- **Steps**: Send a message containing a code block: "Replace the header component with this: ```jsx\nconst Header = () => <h1>Hello</h1>\n```"
- **Expected**: AI recognizes code in message. Applies the code correctly to the file.

## 3.2 Streaming & Real-time Display (P0)

### TC-3.2.1 — Token-by-token streaming
- **Steps**: Send any message. Observe AI response appearing.
- **Expected**: Response appears word-by-word (not all at once). Smooth streaming. No flicker.

### TC-3.2.2 — Thinking/reasoning display
- **Steps**: Send a complex request. Observe if thinking content is shown.
- **Expected**: If model supports reasoning, thinking content is displayed (collapsible or inline) before the main response.

### TC-3.2.3 — Tool call visualization
- **Steps**: Send "Create a new file called helper.js with utility functions".
- **Expected**: Tool call indicators shown (e.g., "Creating file: helper.js"). File appears in file tree after completion. Tool result shown.

### TC-3.2.4 — Multi-file tool calls
- **Steps**: Send "Refactor the app into separate components: Header, Footer, Main".
- **Expected**: Multiple tool calls shown (one per file). All files created. File tree updates. Preview still works.

### TC-3.2.5 — Streaming abort/cancel
- **Steps**: Send a complex prompt → while AI is streaming, click abort/stop button.
- **Expected**: Streaming stops. Partial response preserved. User can send a new message. No hanging state.

### TC-3.2.6 — Empty response auto-retry
- **Steps**: Send a message that might trigger empty response (model-dependent).
- **Expected**: If model returns empty, system shows "Model returned empty — retrying..." and automatically retries. If still empty after retry, shows error message.

## 3.3 Chat Modes (P0)

### TC-3.3.1 — Agent mode (default)
- **Steps**: Ensure mode is "Agent" (default). Send "Build a contact form with validation".
- **Expected**: AI executes autonomously. Writes all necessary files. Preview shows working form.

### TC-3.3.2 — Switch to Plan mode
- **Steps**: Click mode toggle → select "Plan". Send "Build a blog platform".
- **Expected**: AI creates a plan (architecture, components, data model). Does NOT write code. Plan displayed for review.

### TC-3.3.3 — Plan mode tool restrictions
- **Steps**: In plan mode, observe the AI's tool usage.
- **Expected**: Only read-only tools used (view, glob, grep). No create_file, edit_file, or bash calls. `report_intent` or `ask_clarification` used.

### TC-3.3.4 — Switch from Plan to Agent mid-conversation
- **Steps**: After AI generates a plan, switch to Agent mode → type "Now build it".
- **Expected**: AI transitions to building. Implements the plan. Files created. Preview renders.

### TC-3.3.5 — Plan approval flow
- **Steps**: In plan mode, wait for AI to emit `exit_plan_mode.requested`. Approve.
- **Expected**: AI receives approval, exits plan mode, begins implementation.

### TC-3.3.6 — Plan rejection with feedback
- **Steps**: Reject the plan with "I want to use Next.js instead of React".
- **Expected**: AI revises the plan to use Next.js. Re-presents for approval.

## 3.4 Model Selection (P1)

### TC-3.4.1 — Change model during session
- **Steps**: Open model selector in chat panel → switch to a different model.
- **Expected**: Model switches. Next message uses new model. Previous context preserved.

### TC-3.4.2 — Model display in chat
- **Steps**: After switching models, send a message.
- **Expected**: Response metadata or UI indicates which model was used.

## 3.5 Code Generation Quality (P0)

### TC-3.5.1 — Generate React component
- **Steps**: "Build a card component with an image, title, description, and a 'Learn More' button".
- **Expected**: Clean React JSX. Props or proper structure. Renders in preview. Styles applied (Tailwind or CSS).

### TC-3.5.2 — Generate with Tailwind CSS
- **Steps**: "Build a pricing page with three tiers using Tailwind CSS classes".
- **Expected**: Components use Tailwind classes. Responsive design. Preview renders correctly.

### TC-3.5.3 — Generate interactive component
- **Steps**: "Build a counter with + and - buttons that shows the count".
- **Expected**: Working counter. Buttons functional in preview. State management correct.

### TC-3.5.4 — Generate form with validation
- **Steps**: "Build a registration form with email, password, confirm password. Validate email format and password match".
- **Expected**: Form renders. Validation works when testing in preview. Error messages shown for invalid input.

### TC-3.5.5 — Generate responsive layout
- **Steps**: "Build a responsive nav with hamburger menu on mobile".
- **Expected**: Desktop: full nav bar. Mobile (resize preview): hamburger menu. Toggle works.

### TC-3.5.6 — Generate with API calls
- **Steps**: "Build a page that fetches and displays random cat facts from catfact.ninja API".
- **Expected**: Code includes fetch call. Preview shows cat facts (or loading state if API is unavailable).

## 3.6 Error Fixing (P0)

### TC-3.6.1 — Auto-fix on preview error
- **Steps**: Manually introduce a syntax error in code → observe.
- **Expected**: AI detects the error (or fix-error flow triggers). Suggests/applies fix. Preview recovers.

### TC-3.6.2 — "Fix this error" prompt
- **Steps**: If preview shows an error, send "Fix the error in the preview".
- **Expected**: AI identifies the issue, applies a fix, preview recovers.

### TC-3.6.3 — Fix error button/suggestion
- **Steps**: When a build error occurs, check if there's a "Fix" button or auto-suggestion.
- **Expected**: One-click fix available. Applies fix and re-renders.

## 3.7 Suggestions (P1)

### TC-3.7.1 — Next step suggestions appear
- **Steps**: After AI completes a build, check below the response for suggestions.
- **Expected**: 2-4 suggested next steps appear (e.g., "Add dark mode", "Improve responsiveness", "Add footer").

### TC-3.7.2 — Click suggestion
- **Steps**: Click one of the suggested next steps.
- **Expected**: Suggestion text fills the chat input (or auto-sends). AI acts on it.

### TC-3.7.3 — Suggestions after multiple turns
- **Steps**: Have a 3-turn conversation, then check suggestions.
- **Expected**: Suggestions are contextually relevant to the current project state, not generic.

## 3.8 Chat History & Persistence (P0)

### TC-3.8.1 — Chat history on page reload
- **Steps**: Have a 5-message conversation → reload the editor page.
- **Expected**: All messages (user + AI) restored. Thinking content restored. Tool calls shown. Scroll position near latest message.

### TC-3.8.2 — Session persistence across restart
- **Steps**: Have a conversation → close tab → reopen same project.
- **Expected**: Chat history loaded from DB. Session context preserved (SDK `resumeSession`). Follow-up messages have full context.

### TC-3.8.3 — Clear chat history
- **Steps**: Use "Clear chat" action (if available in menu/settings).
- **Expected**: All messages removed. New session starts. Previous context lost.

### TC-3.8.4 — Chat scroll behavior
- **Steps**: With a long conversation, scroll up to read old messages → new AI message arrives.
- **Expected**: If user scrolled up, do NOT auto-scroll to bottom (preserve reading position). If at bottom, auto-scroll to latest.

## 3.9 Attachments in Chat (P1)

### TC-3.9.1 — Attach image in editor chat
- **Steps**: Click attach button in chat input → upload an image → type "Match this design" → send.
- **Expected**: Image shown as preview in chat. AI analyzes image and modifies code to match.

### TC-3.9.2 — Paste image into chat
- **Steps**: Copy an image to clipboard → paste into chat input.
- **Expected**: Image captured and shown as attachment. Can send with message.

### TC-3.9.3 — Attach wireframe to existing project
- **Steps**: Upload a UI wireframe → "Rebuild the homepage to match this wireframe".
- **Expected**: AI restructures existing code to match the wireframe. Preview updates.

## 3.10 Complex AI Tasks (P0)

### TC-3.10.1 — Build complete CRUD app
- **Steps**: "Build a notes app where I can create, read, update, and delete notes. Store them in local storage."
- **Expected**: Full CRUD operations work in preview. Notes persist on page refresh (localStorage).

### TC-3.10.2 — Build with external library
- **Steps**: "Build a chart dashboard using Chart.js with bar, line, and pie charts showing sample data."
- **Expected**: Charts render in preview. Library properly imported (CDN or bundled).

### TC-3.10.3 — Build multi-page app
- **Steps**: "Build a multi-page website with Home, About, Services, and Contact pages with a nav bar for navigation."
- **Expected**: Multiple pages/routes created. Nav bar links work. Each page has unique content.

### TC-3.10.4 — Refactor existing code
- **Steps**: After building an app, type "Refactor this into smaller components. Extract the header, sidebar, and main content into separate files."
- **Expected**: Code split into multiple files. Imports updated. No broken references. Preview unchanged.

### TC-3.10.5 — Add dark mode
- **Steps**: "Add a dark mode toggle that switches between light and dark themes."
- **Expected**: Toggle button appears. Click toggles themes. Colors invert appropriately. Preference persisted.

### TC-3.10.6 — Add animations
- **Steps**: "Add smooth entrance animations to all sections using CSS transitions."
- **Expected**: Sections animate in on scroll or load. No jank. CSS transitions or keyframes used.

### TC-3.10.7 — Build with database integration
- **Steps**: "Build a task tracker that stores tasks in Supabase. Use the connected Supabase project."
- **Expected**: Code includes Supabase client. CRUD operations use Supabase. See TC-07 for full Supabase testing.

## 3.11 Rate Limiting (P1)

### TC-3.11.1 — Normal usage within limits
- **Steps**: Send 5 messages within 2 minutes.
- **Expected**: All messages processed. No rate limit errors.

### TC-3.11.2 — Hit rate limit
- **Steps**: Rapidly send 21+ messages within 2 minutes.
- **Expected**: After 20, rate limit error shown: "Too many requests" or similar. User must wait before sending more.

### TC-3.11.3 — Rate limit recovery
- **Steps**: After hitting rate limit, wait 2 minutes → send a message.
- **Expected**: Message sent successfully. Rate limit window reset.

## 3.12 Token Counter (P2)

### TC-3.12.1 — Token counter visibility
- **Steps**: Check for token/credit counter in chat panel.
- **Expected**: Shows estimated token count or credits used for the message.

### TC-3.12.2 — Token counter updates with input
- **Steps**: Type a long message. Observe counter.
- **Expected**: Counter updates as you type to reflect estimated token usage.

## 3.13 Multi-Turn Text Concatenation (P1)

### TC-3.13.1 — Text from multiple turns separated properly
- **Steps**: Send a request that triggers tool calls → AI responds with text → more tool calls → more text.
- **Expected**: Text from different turns separated by paragraph breaks. No "smashed together" text like "...components.Now I'll..."

## 3.14 Channel Token Router (P2)

### TC-3.14.1 — Thinking content separated from main content
- **Steps**: Send a complex request that triggers reasoning.
- **Expected**: Thinking/reasoning displayed separately from main response content (collapsible or different styling). No `<channel>` XML tags visible in output.

## 3.15 Auto-Continue (P1)

### TC-3.15.1 — AI continues when output is long
- **Steps**: Request a very comprehensive app that requires many files.
- **Expected**: AI sends multiple turns, writing files across turns. Continues automatically without user prompting "continue".

## 3.16 Live Status Updates (P1)

### TC-3.16.1 — liveStatus during tool execution
- **Steps**: Send a build prompt. Observe status text during processing.
- **Expected**: Status shows human-readable descriptions of what AI is doing: "Creating file...", "Reading project...", "Editing component...".

### TC-3.16.2 — Status during long operations
- **Steps**: Wait for a long AI response (30s+).
- **Expected**: Status updates periodically. "This one's taking a while — still going…" message if no activity. Not stuck indefinitely.
