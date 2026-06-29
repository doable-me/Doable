# Calling MCP Tools from a Vite + React SPA

When the generated app needs to interact with MCP (Model Context Protocol) servers
at runtime — for example, querying data from an eDiscovery system, fetching records,
or calling any connected MCP tool — use `@doable/sdk`.

## Usage

```ts
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();

// Call an MCP tool
const result = await doable.mcp.call("mcp_connector_name_tool_name", {
  param1: "value",
  param2: 123,
});

if (result.success) {
  console.log(result.data); // The tool's response data
} else {
  console.error(result.error?.message);
}
```

## Discovering Available Tools

```ts
const response = await doable.mcp.list();
if (response.success) {
  response.data.forEach(tool => {
    console.log(tool.fullName, tool.description);
    // tool.fullName: "mcp_hpca_mcp_search_documents" (use this in doable.mcp.call())
    // tool.connectorName: "HPCA MCP"
    // tool.toolName: "search_documents"
    // tool.description: "Search documents in a case folder"
  });
}
```

## React Pattern

```tsx
import { createDoableClient } from "@doable/sdk";
import { useState, useEffect } from "react";

const doable = createDoableClient();

function CasesList() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doable.mcp.call("mcp_hpca_mcp_list_cases_and_folders", {})
      .then(res => {
        if (res.success) setCases(res.data?.cases ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  return <ul>{cases.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
}
```

## AI Chatbot / Assistant over MCP — use `runMcpAgent` (do NOT hand-roll)

For a DASHBOARD or widget that displays specific data, call `doable.mcp.call(...)`
directly in a `useEffect` (see the React Pattern above) and render `result.data`.

For an AI CHATBOT / ASSISTANT — where the user asks free-form questions and the
assistant must decide which tool(s) to call and answer from the results — DO NOT
write your own model↔tool loop and DO NOT parse tool calls yourself. Use the
built-in agent helper from `@doable/ai`. It discovers tools, runs the ReAct loop,
calls the right MCP tool, feeds the REAL result back to the model, and returns a
final answer:

```tsx
import { runMcpAgent } from "@doable/ai";
import { createDoableClient } from "@doable/sdk";
import { useState } from "react";

const doable = createDoableClient();

function Assistant() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(userText: string) {
    setMessages((m) => [...m, { role: "user", content: userText }]);
    setBusy(true);
    const { answer } = await runMcpAgent({
      mcp: doable.mcp,
      prompt: userText,
      // optional: carry prior turns so the assistant has context
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      // optional: app-specific persona/domain instructions
      system: "You are an eDiscovery assistant. Be concise and use tables.",
      // optional: surface a "calling X…" indicator
      onToolCall: (e) => console.log("calling", e.tool),
    });
    setMessages((m) => [...m, { role: "assistant", content: answer }]);
    setBusy(false);
  }
  // ...render messages (answer is markdown) + an input that calls send()
}
```

`runMcpAgent` returns `{ answer, toolsUsed, messages, authRequired, loginUrl }`.
Render `answer` (markdown). If `authRequired` is true, prompt the user to sign in
to the MCP server (`loginUrl`).

`answer` is already CLEAN — tool results are incorporated and model "thinking" is
already stripped. Render it directly. Do NOT write your own thinking /
`<reasoning>` stripper or any regex over the answer. If you genuinely need to
strip thinking from some other text, import `stripThinking` from `@doable/ai` —
never hand-write a regex literal for it (a single unescaped `/` is an "Invalid
regular expression flag" build error that white-screens the app).

### Why you must NOT hand-roll the loop

A hand-written assistant that does
`JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0])` (greedy match) is the #1 cause of
broken MCP chatbots: the greedy regex spans from the first `{` to the LAST `}`,
so the moment the model emits more than one tool-call object (or adds prose) the
parse throws, the tool never runs, and the model's fabricated text leaks to the
UI as if it were real data. `runMcpAgent` handles multi-tool replies,
`[TOOL_CALL]` wrappers, and prose correctly, and guarantees the model answers
from real tool results. ALWAYS use it for chat/assistant UIs.

## Tool Name Format

Tool names follow this pattern: `mcp_{connectorName}_{toolName}`
- Connector name: lowercased, non-alphanumeric chars replaced with `_`
- Tool name: lowercased, non-alphanumeric chars replaced with `_`

Example: Connector "HPCA MCP" + Tool "get_user_info" → `mcp_hpca_mcp_get_user_info`

**IMPORTANT:** This pattern applies ONLY to MCP servers. For Activepieces integrations (Slack, Gmail, ElevenLabs, etc.), use `useIntegration(integrationId, actionName)` or `doable.integrations.run(integrationId, actionName)` — do NOT prefix with `mcp_`.

## Auth — Handled Automatically

Same as integrations:
- **In preview**: Token arrives via postMessage from the Doable editor
- **When deployed**: Uses `VITE_DOABLE_PROJECT_KEY` env var

## Rules

- NEVER implement a custom postMessage bridge for MCP calls
- NEVER hardcode MCP server URLs or credentials
- NEVER use raw fetch() to MCP endpoints
- ALWAYS use `@doable/sdk` — it handles auth, retries, and error normalization
- `@doable/sdk` is pre-installed — just import it, do NOT add it to package.json or call install_package for it
- For chat/assistant UIs over MCP, ALWAYS use `runMcpAgent` from `@doable/ai` — NEVER hand-roll the tool-calling loop or parse tool calls with a regex
- `@doable/ai` is pre-installed too — just `import { runMcpAgent, ai } from "@doable/ai"`, do NOT add it to package.json
