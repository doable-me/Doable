# Doable E2E UI Test Cases — Master Index

## Test Suite Organization

| File | Area | Test Cases | Priority |
|------|------|------------|----------|
| [01-dashboard-core.md](01-dashboard-core.md) | Dashboard, Navigation, Search, Views | 45+ | P0-P2 |
| [02-project-creation.md](02-project-creation.md) | Create Projects, Build/Plan Modes, Attachments | 35+ | P0-P1 |
| [03-ai-chat.md](03-ai-chat.md) | AI Chat, Streaming, Multi-turn, Tool Calls | 60+ | P0-P1 |
| [04-code-editor.md](04-code-editor.md) | Monaco Editor, File Tree, Tabs, Code Editing | 40+ | P0-P2 |
| [05-preview-panel.md](05-preview-panel.md) | Live Preview, Responsive, Visual Edit | 30+ | P0-P2 |
| [06-templates.md](06-templates.md) | Template Gallery, Scaffold, Customization | 25+ | P1-P2 |
| [07-integrations-supabase.md](07-integrations-supabase.md) | Supabase, DB-backed Apps, Integrations | 30+ | P0-P1 |
| [08-collaboration.md](08-collaboration.md) | Real-time Collab, CRDT, Team Chat, Presence | 35+ | P1-P2 |
| [09-environments.md](09-environments.md) | Environments, Knowledge, Skills, Rules, Identity | 30+ | P1-P2 |
| [10-sharing-publishing.md](10-sharing-publishing.md) | Share, Publish, Thumbnails, Custom Domains | 25+ | P1-P2 |
| [11-settings-workspace.md](11-settings-workspace.md) | User Settings, Workspace Settings, Members | 25+ | P1-P2 |
| [12-marketplace.md](12-marketplace.md) | Marketplace, Discover, Import/Export | 20+ | P2-P3 |
| [13-edge-cases-stress.md](13-edge-cases-stress.md) | Edge Cases, Error Handling, Stress, Security | 40+ | P0-P3 |
| [14-user-journey-flows.md](14-user-journey-flows.md) | End-to-End User Journeys (Personas) | 15+ | P0-P1 |
| [15-environments-deep.md](15-environments-deep.md) | Environments: CRUD, Templates, Import/Export, Assignment, Env Vars, Resolution Priority | 65+ | P0-P2 |
| [16-mcp-servers-deep.md](16-mcp-servers-deep.md) | MCP Servers: Add/Test/Delete, Transports, Auth, AI Tool Invocation, Pooling, Errors | 70+ | P0-P2 |
| [17-knowledge-deep.md](17-knowledge-deep.md) | Knowledge Files: identity/soul/instructions/knowledge/user/plan/memory, Multi-scope Merge, Token Budget, Behavioral Verification | 85+ | P0-P2 |
| [18-ai-chat-integration-deep.md](18-ai-chat-integration-deep.md) | AI Chat + Settings Integration: Environment→Chat, MCP→Chat, Knowledge→Chat, Combined, Cross-Feature | 55+ | P0-P2 |
| [19-project-settings-deep.md](19-project-settings-deep.md) | Project Settings: All 8 Tabs — General, Integrations, MCP, Skills & Rules, Knowledge, Custom Domain, Environments, Danger Zone | 130+ | P0-P2 |
| [20-inheritance-scope-resolution.md](20-inheritance-scope-resolution.md) | Workspace↔Project Inheritance: Environment Chain, Knowledge Merge (replace/append), Skills/Rules Resolution, MCP Merge, Env Var Override, Integration Dedup, Full AI Verification | 95+ | P0-P2 |
| [21-users-roles-plans-permissions.md](21-users-roles-plans-permissions.md) | Users, Roles, Plans, Permissions & Admin: Test User Creation Guide, Registration (email/OAuth), 4 Workspace Roles (owner/admin/member/viewer), 4 Plans (free/pro/business/enterprise), Credits, Billing, Platform Admin Panel, Feature Flags, Invitation Flow, RBAC Matrix, Security | 145+ | P0-P2 |

## Priority Legend
- **P0** — Critical path. Must work for basic product viability. Test first.
- **P1** — Important. Core features users expect. Test after P0.
- **P2** — Standard. Features that enhance UX. Test after P1.
- **P3** — Nice-to-have. Polish items. Test last.

## Testing Rules
1. Always logged in as Google OAuth user (uniquegodwin@gmail.com) unless testing auth
2. Base URL: `http://localhost:3000`
3. API: `http://localhost:4000`
4. WS: `ws://localhost:4001`
5. Test on dashboard page first, then editor pages
6. Capture screenshots for visual regressions where possible
7. Check console for JS errors after every major action
8. Monitor network tab for failed requests (4xx, 5xx)
