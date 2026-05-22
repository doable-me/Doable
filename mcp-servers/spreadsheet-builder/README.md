# spreadsheet-builder — Doable built-in MCP App

A standards-compliant MCP App that produces a real Office Open XML
workbook (.xlsx) plus a CSV export, with a live HTML table preview
inside Doable's chat. Theme-adaptive (light/dark) per
[mcpui.dev](https://mcpui.dev).

## Tools

| Tool | Purpose |
|------|---------|
| `create_spreadsheet({ topic, kind?, audience? })` | Status card. Injects a `BUILD_SPREADSHEET` prompt back to the host so the LLM narrates and calls `build_spreadsheet` once. |
| `build_spreadsheet({ topic, sheets, fileName? })` | Renders preview + .xlsx + .csv downloads. |

## Spec shape

```
sheets: [{
  name: "Budget",
  columns: [
    { header: "Category", key: "category", width: 22, format: "text" },
    { header: "Q1",       key: "q1",       format: "currency" },
    { header: "Q2",       key: "q2",       format: "currency" },
    { header: "Total",    key: "total",    format: "currency" },
  ],
  rows: [
    { category: "Engineering", q1: 124000, q2: 138000, total: "=B2+C2" },
    …
  ],
  totals: { columns: ["q1", "q2", "total"] },
  freezeHeader: true,
}]
```

- String values starting with `=` become formulas (`=SUM(B2:B10)`, `=A2*1.05`).
- `format` ∈ `text | number | currency | percent | date | datetime`.
- `totals.columns` adds a styled SUM totals row beneath the data.

## Run locally

```bash
cd mcp-servers/spreadsheet-builder
pnpm install
node index.mjs
```

## Skill

See `skills/SKILL.md`.
