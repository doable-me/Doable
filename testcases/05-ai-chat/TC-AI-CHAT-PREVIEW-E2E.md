# TC-AI-CHAT-PREVIEW-E2E — chat round-trip + preview content verification

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`

These TCs **do not pass** unless the *preview* renders the requested feature correctly. SSE events alone are not sufficient — we measure each phase's timing AND inspect the iframe's DOM to confirm the generated app matches the prompt intent.

## Stage taxonomy (every preview test must record these timings)
- **T0** — POST /chat sent
- **T_thinking_first** — first SSE `{type:"thinking"}` event observed
- **T_scaffold_start** — first SSE `{type:"status",data:{phase:"scaffolding"}}`
- **T_dev_server_up** — first SSE `{type:"status",data:{phase:"dev-server",message:/Compiling project/}}`
- **T_ai_first_token** — first AI-generated content token
- **T_sse_done** — SSE `[DONE]` or `{type:"done"}`
- **T_preview_http_200** — HEAD/GET on live preview URL returns 2xx (NOT 502/503/Loading)
- **T_preview_dom_match** — preview iframe DOM passes acceptance assertions
- **T_total** — sum (alarm if > 90s for a counter app)

## TC-AI-CHAT-PREVIEW-COUNTER-001 — Counter app round-trip
- **Pre:** owner JWT in `_tokens-${ENV}.json`; existing or fresh project; AI provider configured for owner's workspace.
- **Prompt:** `Build a single-page counter app. Show a large number starting at 0 in the center. Below it, render three buttons in a row: "+1" (increments), "-1" (decrements), "Reset" (sets to 0). Use Tailwind classes (text-6xl, flex gap-3, etc.). State must persist via React useState in App.tsx.`
- **Steps:**
  1. POST /projects/:id/chat with the prompt; stream SSE.
  2. Record stage timings.
  3. After SSE done, GET the editor's `liveServerUrl` (returned in the `done` payload) — or query `/projects/:id` for `dev_server_url`.
  4. Poll preview URL until it returns 200 with non-empty body (max 60s wait).
  5. Parse preview HTML → assert all of:
     - At least one element with text matching `/^\+1$|\+ ?1/`
     - At least one element with text matching `/^-1$|− ?1|- ?1/`
     - At least one element with text matching `/^Reset$/i`
     - A number element rendering `0` (h1/h2/h3/p/span with `0` text content)
- **Expected:** all timings under target (T_total < 90s), all DOM assertions pass.
- **Severity:** smoke (gates the AI feature)

## TC-AI-CHAT-PREVIEW-LANDING-002 — Marketing landing page
- **Pre:** same.
- **Prompt:** `Build a SaaS marketing landing page with: a large headline "Doable", a sub-headline "Build faster. Ship sooner.", and a single call-to-action button labeled "Get started". Use Tailwind for centered, spacious layout.`
- **Acceptance:**
  - Headline text contains "Doable"
  - Sub-headline contains "Build faster"
  - Button with text "Get started"
- **Severity:** high

## TC-AI-CHAT-PREVIEW-FORM-003 — Contact form
- **Pre:** same.
- **Prompt:** `Build a contact form with: full-name input, email input, message textarea, and a "Send" button. Validate all three fields are required and show inline errors. Use Tailwind for styling.`
- **Acceptance:**
  - `<input>` with type="text" or name~="name"
  - `<input>` with type="email"
  - `<textarea>`
  - Button text "Send"
- **Severity:** high

## TC-AI-CHAT-PREVIEW-DATA-004 — Tabular display
- **Pre:** same.
- **Prompt:** `Build a page that shows a table of 3 hard-coded users (name, email, role columns) with at least 3 rows of data.`
- **Acceptance:**
  - `<table>` element present
  - `<th>` count >= 3 (Name, Email, Role)
  - `<tr>` count >= 4 (1 header + 3 data)
- **Severity:** medium

## Failure modes to flag explicitly
- **scaffold-only**: SSE completes but preview shows the default Vite splash, not requested content. → BUG-AI-CHAT-NO-MUTATION
- **dom-mismatch**: preview loads but doesn't contain the requested elements. → BUG-AI-CHAT-WRONG-OUTPUT
- **preview-stuck**: preview HTTP returns 502/503 or hangs > 90s. → BUG-AI-CHAT-PREVIEW-STUCK
- **no-AI-tokens**: SSE shows scaffold but no thinking_to_text or content tokens. → BUG-AI-CHAT-NO-RESPONSE
- **provider-unconfigured**: `Copilot SDK error: AI is not configured` in stream. → BUG-WEB-AI-001 (already filed)
