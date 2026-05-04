# AI Code Generation — Integration Awareness

## Problem

When a user says "build me a contact form that sends a Slack message", the AI currently generates code that **cannot actually call Slack** at runtime. The AI needs to:

1. Know which integrations are connected for the project
2. Generate code that uses `@doable/sdk` (not raw fetch to external APIs)
3. Choose the right pattern based on framework (Vite client vs Next.js server)
4. Handle the case where an integration isn't connected yet

## Integration-Aware System Prompt

The AI system prompt already receives an **integration manifest** (from `vault-bridge.ts`). This needs to be extended to include SDK usage instructions.

### Current Manifest (what AI sees today)

```
Connected integrations:
- slack: Slack (Messaging & communication)
  Tools: slack_send_channel_message, slack_list_channels, ...
  Client env: (none)
  Server env: (none)
- supabase: Supabase (Database & auth)
  Client env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  Server env: SUPABASE_SERVICE_ROLE_KEY
```

### Extended Manifest (what AI should see)

```
Connected integrations for runtime use in generated code:

## Using integrations in your code

Import `@doable/sdk` to call connected integrations from the generated app.
All calls go through a secure proxy — credentials are never exposed to the browser.

### Vite (client-side):
```ts
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();
const result = await doable.integrations.run("slack", "send_channel_message", { channel, text });
```

### Next.js Server Actions (recommended for server-side):
```ts
"use server";
import { createServerClient } from "@doable/sdk/server";
const doable = createServerClient();
const result = await doable.integrations.run("slack", "send_channel_message", { channel, text });
```

### Next.js Client Components:
```ts
import { useIntegration } from "@doable/sdk/react";
const slack = useIntegration("slack", "send_channel_message");
// slack.run({ channel, text })
```

## Available integrations:
- **slack** — Send messages, list channels, manage threads
  Actions: send_channel_message, list_channels, send_direct_message, ...
- **stripe** — Payments, subscriptions, checkout
  Actions: create_checkout_session, create_customer, list_charges, ...
  Also available as direct env: VITE_STRIPE_PUBLISHABLE_KEY (for Stripe Elements UI)
- **supabase** — Database, auth, realtime (USE DIRECT SDK, not proxy)
  Direct env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  Server env: SUPABASE_SERVICE_ROLE_KEY
```

## Framework-Specific Prompt Injection

### Vite-React Framework Prompt Addition

Location: `services/api/src/ai/framework-prompts/vite-react.ts`

```typescript
// Add to the framework prompt when integrations are available:

const INTEGRATION_SDK_PROMPT_VITE = `
## Integration SDK Usage

When the user wants to interact with external services (Slack, Stripe, Gmail, etc.),
use the @doable/sdk package which is pre-installed in this project.

\`\`\`typescript
import { createDoableClient } from "@doable/sdk";

const doable = createDoableClient();

// Call any connected integration
const result = await doable.integrations.run("integration_id", "action_name", {
  // action-specific props
});

if (result.success) {
  console.log(result.data);  // action output
} else {
  console.error(result.error?.message);
}
\`\`\`

For React components, use the hooks:
\`\`\`typescript
import { useIntegration, useIntegrationQuery } from "@doable/sdk/react";

// For actions (mutations)
const slack = useIntegration("slack", "send_channel_message");
await slack.run({ channel: "#general", text: "Hello" });

// For data fetching (queries)
const { data, loading } = useIntegrationQuery("slack", "list_channels", {});
\`\`\`

IMPORTANT:
- NEVER use fetch() to call external APIs directly (Slack, Stripe, etc.)
- NEVER hardcode API keys or tokens in the code
- ALWAYS use doable.integrations.run() which handles auth securely
- Exception: Supabase — use the direct Supabase client SDK (it uses public keys)
`;
```

### Next.js Framework Prompt Addition

Location: `services/api/src/ai/framework-prompts/nextjs-app.ts`

```typescript
const INTEGRATION_SDK_PROMPT_NEXTJS = `
## Integration SDK Usage

When the user wants to interact with external services (Slack, Stripe, Gmail, etc.),
use the @doable/sdk package which is pre-installed in this project.

### Server Actions (PREFERRED for mutations):
\`\`\`typescript
"use server";
import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export async function sendSlackMessage(channel: string, text: string) {
  const result = await doable.integrations.run("slack", "send_channel_message", {
    channel, text
  });
  if (!result.success) throw new Error(result.error?.message);
  return result.data;
}
\`\`\`

### Server Components (for data fetching):
\`\`\`typescript
import { createServerClient } from "@doable/sdk/server";
const doable = createServerClient();

export default async function Page() {
  const channels = await doable.integrations.run("slack", "list_channels", {});
  return <ul>{channels.data?.map(ch => <li key={ch.id}>{ch.name}</li>)}</ul>;
}
\`\`\`

### Client Components (when server-side isn't possible):
\`\`\`typescript
"use client";
import { useIntegration } from "@doable/sdk/react";

function SendButton() {
  const slack = useIntegration("slack", "send_channel_message");
  return <button onClick={() => slack.run({ channel: "#general", text: "Hi" })}>Send</button>;
}
\`\`\`

### API Routes (for webhooks and external callbacks):
\`\`\`typescript
import { createServerClient } from "@doable/sdk/server";
import { NextResponse } from "next/server";

const doable = createServerClient();

export async function POST(request: Request) {
  const body = await request.json();
  await doable.integrations.run("slack", "send_channel_message", {
    channel: "#alerts", text: \`Webhook received: \${body.event}\`
  });
  return NextResponse.json({ ok: true });
}
\`\`\`

RULES:
- For mutations (send message, create record): ALWAYS use Server Actions
- For data display: PREFER Server Components with createServerClient()
- For interactive UI that needs integration data: useIntegration() hook
- NEVER fetch external APIs directly from client code
- NEVER put API keys in client code
- Exception: Supabase — use direct SDK (public keys are browser-safe)
`;
```

## AI Decision Tree

When user requests involve external services:

```
User says: "Add a button that sends a Slack message"
    │
    ├── Is Slack connected? (check manifest)
    │   ├── YES → Generate code using @doable/sdk
    │   └── NO → Tell user: "Slack isn't connected yet. 
    │            Connect it in Settings → Integrations, then I can add this."
    │
    ├── Which framework?
    │   ├── Vite → Use doable.integrations.run() in event handler
    │   └── Next.js → Use Server Action + createServerClient()
    │
    └── What kind of operation?
        ├── Fire-and-forget (send message) → useIntegration hook or Server Action
        ├── Fetch data (list channels) → useIntegrationQuery or Server Component
        └── Both (form that sends + shows result) → Combine patterns
```

## Action Discovery for AI

The AI needs to know **which actions are available** for each integration. This information comes from the integration registry:

```typescript
// In the system prompt, for each connected integration, include:
interface ActionSummary {
  name: string;           // e.g., "send_channel_message"
  displayName: string;    // e.g., "Send Channel Message"
  description: string;    // e.g., "Send a message to a Slack channel"
  props: {
    name: string;
    type: string;         // "string" | "number" | "boolean" | "object" | "array"
    description: string;
    required: boolean;
  }[];
}
```

This is already computed by `getIntegrationActions()` in `runner-core.ts`. The manifest builder just needs to include it in the prompt.

## Example: Full AI Generation Flow

**User prompt:** "Build me a feedback form that sends responses to a Slack channel and stores them in a Google Sheet"

**AI sees in system prompt:**
```
Connected: slack (actions: send_channel_message, ...), google_sheets (actions: append_row, ...)
Framework: nextjs-app
SDK: @doable/sdk pre-installed
```

**AI generates:**

```typescript
// app/actions/feedback.ts
"use server";

import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export async function submitFeedback(formData: FormData) {
  const name = formData.get("name") as string;
  const message = formData.get("message") as string;
  const rating = formData.get("rating") as string;

  // Store in Google Sheets
  await doable.integrations.run("google_sheets", "append_row", {
    spreadsheet_id: "your-sheet-id",
    sheet_name: "Feedback",
    values: [name, message, rating, new Date().toISOString()],
  });

  // Notify team on Slack
  await doable.integrations.run("slack", "send_channel_message", {
    channel: "#feedback",
    text: `New feedback from ${name} (${rating}/5): ${message}`,
  });

  return { success: true };
}
```

```typescript
// app/feedback/page.tsx
"use client";

import { submitFeedback } from "../actions/feedback";
import { useState } from "react";

export default function FeedbackPage() {
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(formData: FormData) {
    await submitFeedback(formData);
    setSubmitted(true);
  }

  if (submitted) return <p>Thank you for your feedback!</p>;

  return (
    <form action={handleSubmit}>
      <input name="name" placeholder="Your name" required />
      <textarea name="message" placeholder="Your feedback" required />
      <select name="rating">
        <option value="5">5 — Excellent</option>
        <option value="4">4 — Good</option>
        <option value="3">3 — OK</option>
        <option value="2">2 — Poor</option>
        <option value="1">1 — Terrible</option>
      </select>
      <button type="submit">Submit Feedback</button>
    </form>
  );
}
```

## Handling Disconnected Integrations

When the AI generates code using an integration that's not yet connected:

1. **AI generates the code anyway** (with a comment noting it needs connection)
2. **Runtime returns a clear error:** `{ success: false, error: { code: "INTEGRATION_NOT_CONNECTED" } }`
3. **UI shows a friendly setup prompt** (SDK can render a "Connect Slack" link)

```typescript
// The SDK can include a helper for this:
import { IntegrationSetupPrompt } from "@doable/sdk/react";

function App() {
  const slack = useIntegration("slack", "send_channel_message");

  if (slack.error?.code === "INTEGRATION_NOT_CONNECTED") {
    return <IntegrationSetupPrompt integration="slack" />;
    // Renders: "Slack is not connected. [Connect Slack →]"
  }

  // ... normal UI
}
```

## Token Limits and Prompt Size

With 200+ integrations, we can't list every action for every connected integration in the prompt. Strategy:

1. **Always include:** Integration names + top 3 most-used actions per integration
2. **On-demand:** AI can call a tool `list_integration_actions(integrationId)` to get the full action list
3. **Context window budget:** Max 2000 tokens for integration manifest in system prompt
4. **Prioritize:** Most recently used integrations first, then alphabetical
