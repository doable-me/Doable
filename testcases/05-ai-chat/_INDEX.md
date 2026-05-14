# 05-ai-chat — Test Case Index

| File | Area | Cases |
|---|---|---|
| TC-AI-CHAT-SEND.md | Send messages, SSE, abort/retry, idempotency, concurrency | 50 |
| TC-AI-CHAT-MODES.md | Agent / Plan / Chat modes & switching | 40 |
| TC-AI-CHAT-CREDITS.md | Credit deduction, quota gating, refunds, races | 50 |
| TC-AI-CHAT-TOOLS.md | Tool dispatch, MCP tools, errors, rendering | 50 |
| TC-AI-CHAT-CONTEXT.md | Context injection (files, env, integrations, memory) | 40 |
| TC-AI-CHAT-ATTACH.md | Doc/csv/pdf attachments, validation, extraction | 40 |
| TC-AI-CHAT-HISTORY.md | Sessions list, pagination, edit/delete/export, search | 45 |
| TC-AI-CHAT-MODELS.md | Model selection, BYOK, fallback, audit | 40 |
| TC-AI-CHAT-MULTIPAGE.md | Multi-page React Router app build (5-turn integration) | 5 |
| TC-AI-CHAT-PDF-SRS-FULL.md | Real SRS PDF → AI-generated domain app; corrupted PDF; empty-prompt guard (R11) | 4 |
| TC-AI-CHAT-HISTORY-PERSIST.md | Chat history persistence, session_id UUID integrity, multi-turn ordering, pagination (R11) | 5 |

**Total:** 369 cases

## Conventions
- Severity tiers: smoke, critical, high, medium, low
- Endpoints abbreviated; full paths under /api/...
- Cross-references: see 06-billing for credit ledger, 14-mcp for tool registry, 07-integrations for connector proxy
