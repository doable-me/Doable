# 16 — Copilot SDK: Core Engine (Non-Negotiable)

## Principle

**The GitHub Copilot SDK (`@github/copilot-sdk`) is the heart of Doable.** Every AI feature in Doable is built around the Copilot SDK. There is no "fallback" architecture, no alternative AI provider, no secondary path. If the Copilot SDK doesn't work, Doable doesn't work.

---

## Rules

### 1. No Fallback Providers
- Do NOT create Anthropic, OpenAI, or any other direct API provider as a "fallback"
- Do NOT build a parallel `AIEngine` + `LLMProvider` abstraction that bypasses the SDK
- If the Copilot SDK fails to start, the correct fix is to **fix the Copilot SDK integration**, not to route around it
- Any code that catches a Copilot SDK error and substitutes a different AI system is a bug

### 2. Copilot SDK Is the Agent Runtime
- The SDK manages: sessions, tool calling, permissions, streaming, context, model selection
- Doable registers custom tools via `defineTool()` — the SDK orchestrates their execution
- The SDK's built-in tools (file read/write, shell, etc.) are available alongside Doable's custom tools
- Session persistence, resumption, and history are handled by the SDK

### 3. BYOK Goes Through the SDK
- Users who bring their own API key (Anthropic, OpenAI, Azure) configure it via the SDK's `provider` config
- BYOK does NOT mean creating a separate provider class — it means passing `{ provider: { type: "anthropic", baseUrl, apiKey } }` to the SDK's `SessionConfig`
- The SDK handles all provider-specific formatting, streaming, and tool calling regardless of which LLM backend is used

### 4. Model Selection Goes Through the SDK
- `client.listModels()` returns available models
- `session.setModel()` changes the model for a session
- The SDK handles model capabilities, billing, and quota tracking
- Doable does NOT make direct API calls to any LLM provider

### 5. Authentication
- Primary: GitHub Copilot subscription (auto-detected via `copilot` CLI or GitHub OAuth)
- Secondary: BYOK via SDK provider config
- The SDK's `client.getAuthStatus()` is the single source of truth for auth state

---

## Architecture Implications

```
User Prompt
    │
    ▼
POST /projects/:id/chat
    │
    ▼
CopilotEngine (singleton)
    │
    ├─ createSession() ─── registers Doable tools, system prompt, working directory
    │
    ├─ sendMessage() ──── streams SessionEvents via async generator
    │
    └─ Session Events ──── mapped to SSE by mapEventToSSE() ──── sent to frontend
```

There is ONE path. Not two. Not "try A, fall back to B." One path through the Copilot SDK.

---

## Event Flow (SDK → Frontend)

The Copilot SDK emits these event types. `mapEventToSSE()` normalizes them for the frontend:

| SDK Event | SSE Event | Frontend Action |
|-----------|-----------|-----------------|
| `text_delta` | `text_delta` | Append text to message |
| `assistant.reasoning` | `thinking` | Show thinking indicator |
| `tool.execution_start` | `tool_call` | Show tool action card (running) |
| `tool.execution_complete` | `tool_result` | Update tool card (complete), refresh files |
| `external_tool.requested` | `tool_call` | Show custom tool executing |
| `external_tool.completed` | `tool_result` | Custom tool done |
| `session.error` | `error` | Show error message |
| `session.idle` / `done` | `done` | End streaming |

Noise events (`pending_messages.modified`, `session.usage_info`, `assistant.usage`, `permission.*`, `assistant.turn_*`, `user.message`, `session.tools_updated`) are filtered out — they never reach the frontend.

---

## Custom Tools (defineTool)

Doable registers project-specific tools with the SDK. The correct `defineTool` signature is:

```typescript
defineTool("tool_name", {
  description: "What this tool does",
  parameters: { type: "object", properties: {...}, required: [...] },
  handler: async (args, invocation) => { return result; }
})
```

**NOT** `defineTool(name, description, schema, handler)` — that is a 4-argument form that does not exist.

Current tools:
- `create_file` — Create a new file in the project
- `edit_file` — Replace entire file content
- `read_file` — Read file contents
- `list_files` — List project files
- `install_package` — Run pnpm add
- `deploy_preview` — Deploy to preview URL

---

## What to Do When Copilot SDK Fails

1. Check if `@github/copilot-sdk` is installed: `pnpm list @github/copilot-sdk`
2. Check if the CLI can start: the SDK spawns a CLI process via JSON-RPC
3. Check auth: `engine.getAuthStatus()` — user needs GitHub Copilot subscription or BYOK config
4. Check the error message in the server logs — the SDK logs to stderr
5. **Fix the root cause.** Do not add workarounds or alternative providers.

---

## Summary

The Copilot SDK is not a dependency — it IS the product. Doable is a UI and tool layer built on top of the Copilot SDK's agent capabilities. Every architectural decision should reinforce this, not work around it.
