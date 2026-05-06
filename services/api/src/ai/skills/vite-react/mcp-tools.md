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
const tools = await doable.mcp.list();
// Returns: [{ fullName, connectorName, toolName, description }]
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

## Tool Name Format

Tool names follow this pattern: `mcp_{connectorName}_{toolName}`
- Connector name: lowercased, non-alphanumeric chars replaced with `_`
- Tool name: lowercased, non-alphanumeric chars replaced with `_`

Example: Connector "HPCA MCP" + Tool "get_user_info" → `mcp_hpca_mcp_get_user_info`

## Auth — Handled Automatically

Same as integrations:
- **In preview**: Token arrives via postMessage from the Doable editor
- **When deployed**: Uses `VITE_DOABLE_PROJECT_KEY` env var

## Rules

- NEVER implement a custom postMessage bridge for MCP calls
- NEVER hardcode MCP server URLs or credentials
- NEVER use raw fetch() to MCP endpoints
- ALWAYS use `@doable/sdk` — it handles auth, retries, and error normalization
