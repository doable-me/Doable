# Third-Party Software Notices

This product includes software developed by third parties as listed below.
Each component is used in accordance with its respective open-source license.

---

## ActivePieces

- **Repository:** https://github.com/activepieces/activepieces
- **License:** MIT
- **Role in Doable:** Provides the connectors and integrations registry. Doable
  embeds ActivePieces npm pieces to power the 630+ native integrations available
  to workspace administrators and AI agents.

---

## Yjs

- **Repository:** https://github.com/yjs/yjs
- **License:** MIT
- **Role in Doable:** CRDT (Conflict-free Replicated Data Type) library that
  powers real-time collaborative editing. Doable's WebSocket server uses Yjs to
  synchronize editor state across multiple connected users with automatic
  conflict resolution.

---

## Model Context Protocol (MCP)

- **Homepage:** https://modelcontextprotocol.io
- **Repository:** https://github.com/modelcontextprotocol
- **License:** MIT
- **Role in Doable:** Agentic tool protocol that defines how AI models discover
  and invoke external tools and data sources. Doable implements MCP as both a
  host (exposing workspace tools to AI) and as a client (connecting to
  third-party MCP servers configured by workspace administrators).

---

Full license texts are available in each dependency's repository or in the
`node_modules` directory after running `pnpm install`.
