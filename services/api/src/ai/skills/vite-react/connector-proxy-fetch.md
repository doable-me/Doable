# Calling the Connector Bridge Proxy from a Vite + React SPA

A Vite-built static SPA has no server runtime, so it cannot read connector
secrets (Slack tokens, Notion keys, etc.) directly. Instead it calls Doable's
connector-bridge proxy, which is mounted same-origin at:

```
POST /__doable/connector-proxy/:integration/:action
```

The proxy is hosted by Caddy in front of the published preview, so the SPA
just does a same-origin `fetch` — no CORS, no API URL config.

## Auth — short-lived JWT

Every call MUST include a Bearer token in `Authorization`. The token is
minted by the editor and sent into the iframe via `window.postMessage`
on load (PRD 10 wires this up). Cache it in a module-level variable.

```ts
let connectorJwt: string | null = null;

window.addEventListener("message", (e) => {
  if (e.data?.type === "doable:connector-jwt") {
    connectorJwt = e.data.token;
  }
});
```

## Allowlist — deny by default

The proxy refuses any `(integration, action)` pair not listed in
`.doable/connector-allowlist.json` at the project root. Add an entry
BEFORE writing the call site, e.g.:

```json
{
  "allow": [
    { "integration": "slack", "action": "post-message" }
  ]
}
```

Without the entry the proxy returns `403 not_allowed`.

## Response shape

```ts
type ProxyResult<T> =
  | { success: true; output: T }
  | { success: false; error: string };
```

## Worked example — Slack post-message hook

```tsx
import { useState } from "react";

type SlackOk = { ts: string; channel: string };

export function useSlackPost() {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "ok"; ts: string } | { kind: "err"; msg: string }
  >({ kind: "idle" });

  async function post(channel: string, text: string) {
    if (!connectorJwt) {
      setState({ kind: "err", msg: "no token yet" });
      return;
    }
    setState({ kind: "loading" });
    const r = await fetch("/__doable/connector-proxy/slack/post-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connectorJwt}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const json = (await r.json()) as ProxyResult<SlackOk>;
    if (!json.success) setState({ kind: "err", msg: json.error });
    else setState({ kind: "ok", ts: json.output.ts });
  }

  return { state, post };
}
```

## Checklist before writing the call site

1. Add the `(integration, action)` pair to `.doable/connector-allowlist.json`.
2. Confirm the integration is connected in the project's Integrations panel.
3. Wire the postMessage listener once at app boot, not per-component.
4. Always handle `success: false` — the user may have revoked the connection.
