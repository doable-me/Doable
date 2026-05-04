# Calling Connected Integrations from a Vite + React SPA

A Vite-built static SPA has no server runtime, so it cannot read connector
secrets (Slack tokens, Notion keys, etc.) directly. Instead it calls Doable's
connector-bridge proxy through the `@doable/sdk` package.

## Recommended: Use `@doable/sdk`

Add to `package.json` dependencies:
```json
{ "@doable/sdk": "workspace:*" }
```

### Basic usage:
```ts
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();

const result = await doable.integrations.run("slack", "send_channel_message", {
  channel: "#general",
  text: "Hello from my app!"
});
if (result.success) {
  console.log("Sent!", result.data);
} else {
  console.error("Failed:", result.error?.message);
}
```

### React hooks:
```tsx
import { useIntegration, useIntegrationQuery } from "@doable/sdk/react";

// For mutations (send message, create record, etc.):
function SendButton() {
  const slack = useIntegration("slack", "send_channel_message");
  return (
    <button onClick={() => slack.run({ channel: "#general", text: "Hello!" })} disabled={slack.loading}>
      {slack.loading ? "Sending..." : "Send to Slack"}
    </button>
  );
}

// For data fetching (list channels, get records, etc.):
function ChannelList() {
  const { data, loading, error } = useIntegrationQuery("slack", "list_channels", {});
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <ul>{data?.channels?.map((ch: any) => <li key={ch.id}>{ch.name}</li>)}</ul>;
}
```

## Auth — handled automatically

The SDK handles authentication transparently:
- **In preview**: Token arrives via `postMessage` from the Doable editor (no setup needed)
- **When deployed**: Uses `VITE_DOABLE_PROJECT_KEY` env var (auto-provisioned at deploy)

## Allowlist — deny by default (if file exists)

If a `.doable/connector-allowlist.json` file exists, only listed actions are allowed.
If no file exists, all connected integrations are permitted. Add an entry if needed:

```json
{
  "allow": [
    { "integration": "slack", "action": "send_channel_message" }
  ]
}
```

## Response shape

```ts
interface IntegrationCallResult<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { integrationId: string; actionName: string; durationMs: number } | null;
}
```

## Legacy: Direct fetch (still works)

The low-level `window.__doable.callConnector()` global still works for
backwards compatibility, but prefer `@doable/sdk` for new code.

## Checklist before writing integration calls

1. Confirm the integration is connected (check `<connected-integrations>` block in prompt).
2. Add `@doable/sdk` to package.json: `"@doable/sdk": "workspace:*"`.
3. Use `useIntegration()` for mutations, `useIntegrationQuery()` for data fetching.
4. Always handle `result.success === false` — the user may have revoked the connection.
