# 19 — Native Integrations Engine (630+ Integrations via Activepieces)

## Executive Summary

Add 630+ native integrations to Doable by consuming Activepieces "pieces" as npm library dependencies — NOT as a fork, NOT via MCP bridge. Pieces run directly in the Doable API process with a thin ActionContext adapter. Users see a polished catalog with one-click OAuth connect. The AI copilot uses integrations as native tools — no `mcp_` prefixes, no `[MCP:]` tags, no server URLs. The existing MCP system remains for power-user custom connectors.

### Why This Approach

| Approach | Native Feel | Maintenance | Effort | License |
|----------|-------------|-------------|--------|---------|
| MCP bridge to Activepieces instance | 5/10 | Low | 2 days | MIT |
| Fork Activepieces repo | 10/10 | Very High | Weeks | MIT |
| **npm install pieces as libraries** | **10/10** | **Low** | **~2 weeks** | **MIT** |
| Build everything from scratch | 10/10 | Very High | Months | N/A |

Consuming npm packages means: MIT licensed, no fork to maintain, `pnpm update` gets upstream fixes, full control over UX/naming/auth.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                           DOABLE                                  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                    AI ENGINE (Copilot)                      │   │
│  │                                                            │   │
│  │  Built-in tools        Native integration tools            │   │
│  │  ┌─────────────┐       ┌──────────────────────────────┐   │   │
│  │  │ create_file  │       │ slack_send_message           │   │   │
│  │  │ edit_file    │       │ notion_create_page           │   │   │
│  │  │ read_file    │       │ google_sheets_append_row     │   │   │
│  │  │ run_build    │       │ airtable_create_record       │   │   │
│  │  │ ...          │       │ discord_send_message         │   │   │
│  │  └─────────────┘       │ gmail_send_email             │   │   │
│  │                         │ ... (630+ actions)           │   │   │
│  │                         └──────────┬───────────────────┘   │   │
│  └─────────────────────────────────────┼──────────────────────┘   │
│                                        │                           │
│  ┌─────────────────────────────────────▼──────────────────────┐   │
│  │              INTEGRATION ENGINE (new)                       │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │   │
│  │  │  Registry     │  │  Runner      │  │  Credential      │ │   │
│  │  │  (catalog +   │  │  (context    │  │  Vault           │ │   │
│  │  │   metadata)   │  │   adapter)   │  │  (OAuth + keys)  │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘ │   │
│  │         │                 │                  │              │   │
│  │         ▼                 ▼                  ▼              │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │         @activepieces/piece-* (npm packages)         │   │   │
│  │  │  piece-slack  piece-notion  piece-google-sheets ...  │   │   │
│  │  └──────────────────────┬──────────────────────────────┘   │   │
│  │                         │                                   │   │
│  │  ┌──────────────────────▼──────────────────────────────┐   │   │
│  │  │  @activepieces/pieces-framework  (npm dependency)    │   │   │
│  │  │  @activepieces/pieces-common     (npm dependency)    │   │   │
│  │  │  @activepieces/shared            (npm dependency)    │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  EXISTING MCP SYSTEM (unchanged, for custom connectors)     │   │
│  │  connector-manager.ts  tool-bridge.ts  client.ts            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  DATABASE                                                    │   │
│  │  integration_connections  │  integration_credentials         │   │
│  │  integration_store        │  oauth_apps                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  FRONTEND                                                    │   │
│  │  Integration Catalog  │  OAuth Flow  │  Connection Manager   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Activepieces Framework Analysis

### 2.1 What We're Consuming

Three npm packages form the runtime foundation:

| Package | Purpose | Size | Dependencies |
|---------|---------|------|--------------|
| `@activepieces/pieces-framework` | createPiece, createAction, ActionContext, Property, PieceAuth | ~50KB | zod, semver, ai (vercel) |
| `@activepieces/pieces-common` | httpClient (axios wrapper), polling helper, validation | ~30KB | axios, form-data, mime-types |
| `@activepieces/shared` | Enums, types, utilities (isNil, isEmpty) | ~200KB | dayjs, nanoid, zod |

Plus 630 individual piece packages (`@activepieces/piece-slack`, etc.), each 5-50KB.

### 2.2 The ActionContext Contract

Every piece action receives an `ActionContext` object. Here's the full interface and what we must implement:

```typescript
// FULL ActionContext interface from pieces-framework
type ActionContext<PieceAuth, ActionProps> = {
  // ═══ CRITICAL — every action uses these ═══
  auth: ResolvedAuthValue;              // OAuth token, API key, etc.
  propsValue: StaticPropsValue<Props>;  // Resolved input property values

  // ═══ IMPORTANT — some actions use these ═══
  store: Store;                         // Key-value persistence (triggers use heavily)
  files: FilesService;                  // Binary file storage (file-processing actions)
  server: ServerContext;                // { apiUrl, publicUrl, token }

  // ═══ RARELY USED — safe to stub ═══
  executionType: ExecutionType;         // BEGIN or RESUME
  connections: ConnectionsManager;      // Cross-connection lookup
  tags: TagsManager;                    // Flow tagging
  output: OutputContext;                // Step output metadata
  agent: AgentContext;                  // AI tool resolution (Vercel AI SDK)
  project: ProjectContext;              // { id, externalId() }
  flows: FlowsContext;                  // { current, list() }
  step: StepContext;                    // { name }
  run: RunContext;                      // { id, stop, pause, respond }
  generateResumeUrl: Function;         // Webhook resume URLs
};
```

**Usage analysis across 630 pieces:**

| Service | Used by | Implementation needed |
|---------|---------|----------------------|
| `auth` + `propsValue` | 100% of actions | Real — from credential vault |
| `store` | ~15% (triggers, stateful actions) | Real — PostgreSQL backed |
| `files` | ~5% (file upload/download actions) | Real — local/S3 storage |
| `server.publicUrl` | ~3% (webhook registration) | Real — Doable's public URL |
| `connections` | ~2% (cross-integration lookup) | Real — query credential vault |
| Everything else | <1% | Stub / no-op |

### 2.3 Auth Types in Pieces

| Auth Type | Pieces Using It | Runtime Value Shape |
|-----------|-----------------|---------------------|
| `PieceAuth.OAuth2` | ~180 pieces | `{ access_token, props?, data }` |
| `PieceAuth.SecretText` | ~250 pieces | `string` (the API key) |
| `PieceAuth.CustomAuth` | ~120 pieces | `{ props: { field1, field2, ... } }` |
| `PieceAuth.BasicAuth` | ~30 pieces | `{ username, password }` |
| `PieceAuth.None` | ~50 pieces | `undefined` |

Many pieces offer **multiple auth options** (array): e.g., Slack exports `[OAuth2, CustomAuth]` so users can either do OAuth flow or paste a bot token.

### 2.4 Property System

Pieces define their inputs using a typed property system with 21 property types:

**Static properties** (can be resolved from AI tool parameters directly):
- `ShortText`, `LongText`, `Number`, `Checkbox`, `DateTime`, `Color`, `Json`, `Object`, `Array`, `File`
- `StaticDropdown`, `StaticMultiSelectDropdown` — fixed options list
- `MarkDown` — display-only, no value

**Dynamic properties** (need runtime resolution via API calls):
- `Dropdown` — options fetched via async function (e.g., "list Slack channels")
- `MultiSelectDropdown` — same, multi-select
- `DynamicProperties` — entire property schema generated at runtime

**Dynamic property resolution requires `PropertyContext`:**
```typescript
type PropertyContext = {
  server: ServerContext;
  project: { id: string; externalId: () => Promise<string | undefined> };
  searchValue?: string;
  flows: FlowsContext;
  connections: ConnectionsManager;
};
```

**For the AI copilot, dynamic dropdowns are handled differently:** The AI doesn't need a visual dropdown — it can call a separate "list" action first (e.g., `slack_list_channels`) and then pass the channel ID to `slack_send_message`. This eliminates the need for PropertyContext resolution in most cases.

### 2.5 The httpClient (Zero Platform Dependency)

The `httpClient` from `@activepieces/pieces-common` is a standalone axios wrapper:

```typescript
// This is completely self-contained — no Activepieces platform calls
httpClient.sendRequest({
  method: HttpMethod.POST,
  url: 'https://slack.com/api/chat.postMessage',
  authentication: { type: AuthenticationType.BEARER_TOKEN, token: accessToken },
  body: { channel, text },
});
```

It handles: Bearer/Basic auth header injection, retry with exponential backoff, query params, timeout, binary responses. No platform dependency.

---

## 3. Backend: Integration Registry

### 3.1 Registry Structure

A static TypeScript registry maps integration IDs to metadata and piece references:

**File:** `services/api/src/integrations/registry.ts`

```typescript
interface IntegrationDefinition {
  // ── Identity ──
  id: string;                          // e.g., "slack"
  piecePackage: string;                // e.g., "@activepieces/piece-slack"
  displayName: string;                 // e.g., "Slack"
  description: string;
  logoUrl: string;                     // Path to bundled icon
  category: IntegrationCategory;
  tags: string[];                      // Searchable tags

  // ── Auth Config ──
  authType: "oauth2" | "api_key" | "custom_auth" | "basic_auth" | "none";
  oauth2Config?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    pkce?: boolean;
    pkceMethod?: "plain" | "S256";
    authorizationMethod?: "HEADER" | "BODY";
    prompt?: "consent" | "login" | "none" | "omit";
    extraParams?: Record<string, string>;
  };
  customAuthFields?: Array<{
    name: string;
    displayName: string;
    description?: string;
    type: "text" | "secret" | "dropdown";
    required: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;

  // ── Actions ──
  actions: string[];                   // Action names to expose as AI tools
  actionOverrides?: Record<string, {
    description?: string;              // Override description for AI
    hidden?: boolean;                  // Hide from AI (but keep available)
  }>;

  // ── Trigger Config ──
  triggers?: string[];                 // Trigger names (Phase 3)

  // ── Behavioral ──
  tier: "built_in" | "community";     // Curation level
  requiresOAuthApp: boolean;          // Needs pre-registered OAuth client ID/secret
  supportsUserProvidedCredentials: boolean;
}

type IntegrationCategory =
  | "communication"
  | "productivity"
  | "developer_tools"
  | "crm_sales"
  | "marketing"
  | "finance_payments"
  | "ai_ml"
  | "data_storage"
  | "social_media"
  | "ecommerce"
  | "project_management"
  | "customer_support"
  | "hr"
  | "analytics"
  | "content"
  | "automation"
  | "other";
```

### 3.2 Registry Population Strategy

**Phase 1 (launch — 50 integrations):** Hand-curate the top 50 most requested integrations with full metadata, tested auth configs, and carefully selected action subsets.

**Phase 2 (scale — 300+ integrations):** Script to auto-generate registry entries from piece `metadata()` calls. Each piece package exports a `Piece` class with `displayName`, `description`, `auth`, `actions`, `categories` — extract all of it.

**Phase 3 (full — 630+):** All remaining pieces, auto-generated with sensible defaults.

### 3.3 Auto-Generation Script

```typescript
// tools/generate-registry.ts
// Reads each installed @activepieces/piece-* package
// Calls piece.metadata() to extract displayName, auth, actions, triggers
// Generates registry.ts entries with all metadata pre-filled
// Requires manual review for: OAuth URLs, category assignment, action selection
```

### 3.4 Priority 50 (Phase 1)

**Communication:** Slack, Discord, Microsoft Teams, Telegram, WhatsApp, Gmail, Microsoft Outlook, Twilio
**Productivity:** Notion, Google Sheets, Google Docs, Google Calendar, Google Drive, Airtable, Monday, Asana, ClickUp, Trello, Todoist, Linear, Jira Cloud
**CRM/Sales:** HubSpot, Salesforce, Pipedrive, Zoho CRM
**Developer:** GitHub, GitLab, Postgres, MySQL, MongoDB, Supabase, Firebase
**Finance:** Stripe, QuickBooks, Xero
**Marketing:** Mailchimp, SendGrid, ActiveCampaign, Beehiiv, ConvertKit
**Social:** Twitter/X, LinkedIn, Instagram Business, Facebook Pages, Reddit, Bluesky
**AI:** OpenAI, Anthropic (Claude), Google Gemini, Groq, Perplexity, ElevenLabs
**Storage:** Amazon S3, Google Cloud Storage, Dropbox, Box
**Other:** Shopify, WooCommerce, WordPress, Webflow

---

## 4. Backend: Integration Runner (ActionContext Adapter)

### 4.1 Core Runner

**File:** `services/api/src/integrations/runner.ts`

The runner is the thin adapter between Doable's tool system and Activepieces piece actions:

```typescript
interface RunActionParams {
  integrationId: string;     // e.g., "slack"
  actionName: string;        // e.g., "send_channel_message"
  props: Record<string, unknown>;
  userId: string;
  workspaceId: string;
  projectId?: string;
}

interface RunActionResult {
  success: boolean;
  output: unknown;
  error?: string;
}

async function runAction(params: RunActionParams): Promise<RunActionResult>
```

**Algorithm:**
1. Look up integration in registry
2. Dynamic import the piece package: `await import(registry[id].piecePackage)`
3. Get action: `piece.getAction(actionName)`
4. Load credentials from vault: `credentialVault.get(userId, integrationId, workspaceId)`
5. Resolve auth value to correct shape (OAuth2 → `{ access_token }`, SecretText → `string`, etc.)
6. If OAuth2 and token expired → refresh token before executing
7. Build ActionContext with real auth/props + stubs for unused services
8. Call `action.run(context)`
9. Return result

### 4.2 ActionContext Builder

**File:** `services/api/src/integrations/context-builder.ts`

```typescript
function buildActionContext(params: {
  auth: unknown;
  props: Record<string, unknown>;
  userId: string;
  workspaceId: string;
  projectId?: string;
}): ActionContext {
  return {
    // ── Real implementations ──
    auth: params.auth,
    propsValue: params.props,
    executionType: ExecutionType.BEGIN,
    store: new PostgresStore(params.userId, params.workspaceId),
    files: new DoableFilesService(),
    server: {
      apiUrl: config.API_URL,
      publicUrl: config.PUBLIC_URL,
      token: "",  // Not needed for most actions
    },
    connections: new DoableConnectionsManager(params.userId, params.workspaceId),

    // ── Stubs ──
    tags: { add: async () => {} },
    output: { update: async () => {} },
    agent: { tools: async () => ({}) },
    project: {
      id: params.projectId ?? params.workspaceId,
      externalId: async () => undefined,
    },
    flows: {
      current: { id: "doable", version: { id: "1" } },
      list: async () => ({ data: [], next: null, previous: null }),
    },
    step: { name: "doable_action" },
    run: {
      id: crypto.randomUUID(),
      stop: () => ({ type: "STOP" }),
      pause: () => ({ type: "PAUSE" }),
      respond: () => ({}),
    },
    generateResumeUrl: () => "",
  };
}
```

### 4.3 PostgresStore Implementation

**File:** `services/api/src/integrations/store.ts`

Implements `Store` interface backed by a `integration_store` PostgreSQL table:

```typescript
class PostgresStore implements Store {
  constructor(
    private userId: string,
    private workspaceId: string,
  ) {}

  async put<T>(key: string, value: T, scope?: StoreScope): Promise<T> {
    const scopeKey = this.buildKey(key, scope);
    await sql`
      INSERT INTO integration_store (scope_key, value, workspace_id, user_id, updated_at)
      VALUES (${scopeKey}, ${JSON.stringify(value)}, ${this.workspaceId}, ${this.userId}, NOW())
      ON CONFLICT (scope_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return value;
  }

  async get<T>(key: string, scope?: StoreScope): Promise<T | null> {
    const scopeKey = this.buildKey(key, scope);
    const [row] = await sql`
      SELECT value FROM integration_store WHERE scope_key = ${scopeKey}
    `;
    return row ? JSON.parse(row.value) : null;
  }

  async delete(key: string, scope?: StoreScope): Promise<void> {
    const scopeKey = this.buildKey(key, scope);
    await sql`DELETE FROM integration_store WHERE scope_key = ${scopeKey}`;
  }

  private buildKey(key: string, scope?: StoreScope): string {
    const prefix = scope === StoreScope.FLOW
      ? `flow:${this.userId}`
      : `project:${this.workspaceId}`;
    return `${prefix}:${key}`;
  }
}
```

### 4.4 DoableFilesService Implementation

**File:** `services/api/src/integrations/files.ts`

```typescript
class DoableFilesService implements FilesService {
  async write({ fileName, data }: { fileName: string; data: Buffer }): Promise<string> {
    // Write to local temp directory (same pattern as thumbnail generation)
    const dir = path.join(config.DATA_DIR, "integration-files");
    await fs.mkdir(dir, { recursive: true });
    const id = crypto.randomUUID();
    const ext = path.extname(fileName) || "";
    const filePath = path.join(dir, `${id}${ext}`);
    await fs.writeFile(filePath, data);
    return `${config.PUBLIC_URL}/files/integration/${id}${ext}`;
  }
}
```

### 4.5 DoableConnectionsManager Implementation

**File:** `services/api/src/integrations/connections-manager.ts`

For the ~2% of actions that call `context.connections.get()` to fetch another integration's credentials:

```typescript
class DoableConnectionsManager implements ConnectionsManager {
  constructor(
    private userId: string,
    private workspaceId: string,
  ) {}

  async get(key: string): Promise<unknown | null> {
    // key is typically the integration name (e.g., "slack")
    const credential = await credentialVault.get(this.userId, key, this.workspaceId);
    if (!credential) return null;
    return credential.resolvedValue;
  }
}
```

### 4.6 Piece Loading & Caching

```typescript
// Cache loaded pieces to avoid repeated dynamic imports
const pieceCache = new Map<string, Piece>();

async function loadPiece(integrationId: string): Promise<Piece> {
  if (pieceCache.has(integrationId)) return pieceCache.get(integrationId)!;

  const def = REGISTRY[integrationId];
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  const mod = await import(def.piecePackage);
  // Activepieces pieces export default or named export
  const piece = mod.default ?? mod[Object.keys(mod)[0]];

  pieceCache.set(integrationId, piece);
  return piece;
}
```

---

## 5. Backend: OAuth2 & Credential Vault

### 5.1 Credential Storage Schema

**Table:** `integration_connections`

```sql
CREATE TABLE integration_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id  varchar(100) NOT NULL,   -- e.g., "slack", "notion"
  scope           varchar(20) NOT NULL DEFAULT 'user'
                  CHECK (scope IN ('workspace', 'project', 'user')),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  auth_type       varchar(20) NOT NULL
                  CHECK (auth_type IN ('oauth2', 'secret_text', 'custom_auth', 'basic_auth', 'none')),

  -- Encrypted credential blob (AES-256-CBC via pgp_sym_encrypt)
  -- Contains the full AppConnectionValue:
  --   OAuth2: { access_token, refresh_token, expires_in, claimed_at, token_url, client_id, client_secret, data }
  --   SecretText: { secret_text: "..." }
  --   CustomAuth: { props: { field1: "...", field2: "..." } }
  --   BasicAuth: { username: "...", password: "..." }
  credentials_encrypted bytea NOT NULL,

  display_name    varchar(200),           -- User-facing label (e.g., "My Slack Workspace")
  status          varchar(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'error', 'expired', 'revoked')),
  error_message   text,
  metadata        jsonb DEFAULT '{}',     -- Extra info (e.g., Slack workspace name, email)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, user_id, integration_id, scope, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'))
);

CREATE INDEX idx_ic_workspace_user ON integration_connections (workspace_id, user_id);
CREATE INDEX idx_ic_integration ON integration_connections (integration_id, status);
CREATE INDEX idx_ic_scope ON integration_connections (workspace_id, scope, status);
```

### 5.2 OAuth App Configuration

For OAuth2 integrations, Doable needs a registered OAuth app (client_id + client_secret) per service. Platform admins configure these:

**Table:** `oauth_apps`

```sql
CREATE TABLE oauth_apps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id  varchar(100) NOT NULL,   -- e.g., "slack"
  client_id       varchar(500) NOT NULL,
  client_secret_encrypted bytea NOT NULL,  -- pgp_sym_encrypt
  extra_config    jsonb DEFAULT '{}',      -- Additional OAuth params if needed
  is_global       boolean DEFAULT false,   -- Platform-wide vs workspace-specific
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'), integration_id)
);
```

**Resolution order for OAuth client credentials:**
1. Workspace-specific `oauth_apps` entry
2. Global `oauth_apps` entry (`is_global = true`)
3. Environment variables: `OAUTH_{INTEGRATION_ID}_CLIENT_ID` / `OAUTH_{INTEGRATION_ID}_CLIENT_SECRET`
4. Error: "OAuth not configured for this integration"

### 5.3 OAuth2 Flow

**File:** `services/api/src/integrations/oauth2.ts`

**Single redirect URL for all integrations:**
`https://app.doable.me/integrations/oauth/callback`

**Authorization URL construction:**
```typescript
function buildAuthorizationUrl(integrationId: string, params: {
  userId: string;
  workspaceId: string;
  scope: string;
  projectId?: string;
}): string {
  const def = REGISTRY[integrationId];
  const oauth = def.oauth2Config!;
  const oauthApp = await getOAuthApp(integrationId, params.workspaceId);

  const state = encryptState({
    integrationId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    scope: params.scope,
    projectId: params.projectId,
    nonce: crypto.randomUUID(),
  });

  const query: Record<string, string> = {
    response_type: "code",
    client_id: oauthApp.clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: oauth.scopes.join(" "),
    state,
    access_type: "offline",
    ...(oauth.prompt !== "omit" ? { prompt: oauth.prompt ?? "consent" } : {}),
    ...oauth.extraParams,
  };

  // PKCE support
  if (oauth.pkce) {
    const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    // Store verifier in short-lived cache (5 min TTL)
    await storeCodeVerifier(state, verifier);
    query.code_challenge = oauth.pkceMethod === "S256"
      ? crypto.createHash("sha256").update(verifier).digest("base64url")
      : verifier;
    query.code_challenge_method = oauth.pkceMethod ?? "S256";
  }

  return `${oauth.authUrl}?${new URLSearchParams(query)}`;
}
```

**Token exchange (callback handler):**
```typescript
async function handleOAuthCallback(code: string, state: string): Promise<IntegrationConnection> {
  const decoded = decryptState(state);
  const { integrationId, userId, workspaceId, scope, projectId } = decoded;
  const def = REGISTRY[integrationId];
  const oauth = def.oauth2Config!;
  const oauthApp = await getOAuthApp(integrationId, workspaceId);

  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: oauthApp.clientId,
    client_secret: oauthApp.clientSecret,
  };

  // PKCE
  const verifier = await getCodeVerifier(state);
  if (verifier) body.code_verifier = verifier;

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  // Some providers want client credentials in header (Notion, etc.)
  if (oauth.authorizationMethod === "HEADER") {
    headers.Authorization = `Basic ${Buffer.from(`${oauthApp.clientId}:${oauthApp.clientSecret}`).toString("base64")}`;
    delete body.client_id;
    delete body.client_secret;
  }

  const tokenRes = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });
  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new Error(tokenData.error_description ?? tokenData.error);
  }

  // Store encrypted connection
  const connectionValue = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    claimed_at: Math.floor(Date.now() / 1000),
    token_url: oauth.tokenUrl,
    client_id: oauthApp.clientId,
    client_secret: oauthApp.clientSecret,
    data: tokenData,  // Full response for provider-specific fields
  };

  return credentialVault.store({
    workspaceId, userId, integrationId, scope, projectId,
    authType: "oauth2",
    credentials: connectionValue,
  });
}
```

### 5.4 Token Refresh

```typescript
async function refreshOAuth2Token(connection: IntegrationConnection): Promise<void> {
  const creds = await credentialVault.decrypt(connection.credentials_encrypted);

  // Check if token is expired (15-minute buffer)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = creds.claimed_at + (creds.expires_in ?? 3600);
  if (now + 900 < expiresAt) return; // Not expired yet

  const def = REGISTRY[connection.integration_id];
  const oauth = def.oauth2Config!;

  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (oauth.authorizationMethod === "HEADER") {
    headers.Authorization = `Basic ${Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64")}`;
    delete body.client_id;
    delete body.client_secret;
  }

  const res = await fetch(creds.token_url ?? oauth.tokenUrl, {
    method: "POST", headers,
    body: new URLSearchParams(body),
  });
  const data = await res.json();

  if (data.error === "invalid_grant") {
    // Token revoked — mark connection as expired
    await credentialVault.updateStatus(connection.id, "revoked", "Token revoked. Please reconnect.");
    throw new Error("Integration token revoked. Please reconnect.");
  }

  if (data.error) throw new Error(data.error_description ?? data.error);

  // Merge: only overwrite non-null values (preserve refresh_token if not returned)
  const updated = { ...creds };
  if (data.access_token) updated.access_token = data.access_token;
  if (data.refresh_token) updated.refresh_token = data.refresh_token;
  if (data.expires_in) updated.expires_in = data.expires_in;
  updated.claimed_at = Math.floor(Date.now() / 1000);
  if (data.scope) updated.data.scope = data.scope;

  await credentialVault.update(connection.id, updated);
}
```

### 5.5 Credential Vault API

**File:** `services/api/src/integrations/credential-vault.ts`

```typescript
interface CredentialVault {
  // Store new credentials (encrypted at rest)
  store(params: StoreParams): Promise<IntegrationConnection>;

  // Get and decrypt credentials for an integration
  get(userId: string, integrationId: string, workspaceId: string): Promise<DecryptedConnection | null>;

  // Get effective connections (workspace + project + user scope)
  getEffective(workspaceId: string, projectId?: string, userId?: string): Promise<IntegrationConnection[]>;

  // Update credentials (re-encrypt)
  update(connectionId: string, credentials: unknown): Promise<void>;

  // Update status
  updateStatus(connectionId: string, status: string, errorMessage?: string): Promise<void>;

  // Delete connection
  delete(connectionId: string): Promise<void>;

  // Decrypt raw credentials blob
  decrypt(encrypted: Buffer): Promise<unknown>;
}
```

Encryption uses the same `pgp_sym_encrypt`/`pgp_sym_decrypt` pattern already used for AI provider keys and GitHub tokens in Doable.

---

## 6. Backend: AI Tool Bridge

### 6.1 Tool Registration Strategy

Integration actions become AI tools via a new bridge that replaces the MCP tool bridge for native integrations:

**File:** `services/api/src/integrations/tool-bridge.ts`

```typescript
interface IntegrationToolOptions {
  workspaceId: string;
  projectId?: string;
  userId: string;
}

async function createIntegrationTools(opts: IntegrationToolOptions): Promise<Tool[]> {
  // 1. Get all active connections for this scope
  const connections = await credentialVault.getEffective(
    opts.workspaceId, opts.projectId, opts.userId
  );

  const tools: Tool[] = [];

  for (const conn of connections) {
    const def = REGISTRY[conn.integration_id];
    if (!def) continue;

    const piece = await loadPiece(conn.integration_id);

    for (const actionName of def.actions) {
      const action = piece.getAction(actionName);
      if (!action) continue;

      // Check if hidden via override
      if (def.actionOverrides?.[actionName]?.hidden) continue;

      const toolName = `${conn.integration_id}_${actionName}`;
      const description = def.actionOverrides?.[actionName]?.description
        ?? action.description;

      tools.push({
        name: toolName,
        description,
        parameters: actionPropsToJsonSchema(action.props),
        execute: async (params, ctx) => {
          try {
            const result = await runAction({
              integrationId: conn.integration_id,
              actionName,
              props: params,
              userId: opts.userId,
              workspaceId: opts.workspaceId,
              projectId: opts.projectId,
            });
            return {
              success: result.success,
              output: typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output, null, 2),
              error: result.error,
            };
          } catch (err) {
            return {
              success: false,
              output: "",
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      });
    }
  }

  return tools;
}
```

### 6.2 Property-to-JSON-Schema Converter

Converts Activepieces property definitions to JSON Schema for AI tool parameters:

```typescript
function actionPropsToJsonSchema(props: InputPropertyMap): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, prop] of Object.entries(props)) {
    if (prop.type === PropertyType.MARKDOWN) continue; // Display-only

    const schema: Record<string, unknown> = {
      description: prop.description ?? prop.displayName,
    };

    switch (prop.type) {
      case PropertyType.SHORT_TEXT:
      case PropertyType.LONG_TEXT:
      case PropertyType.DATE_TIME:
      case PropertyType.COLOR:
        schema.type = "string";
        break;
      case PropertyType.NUMBER:
        schema.type = "number";
        break;
      case PropertyType.CHECKBOX:
        schema.type = "boolean";
        break;
      case PropertyType.JSON:
      case PropertyType.OBJECT:
        schema.type = "object";
        break;
      case PropertyType.ARRAY:
        schema.type = "array";
        break;
      case PropertyType.STATIC_DROPDOWN:
        schema.type = "string";
        schema.enum = prop.options.options.map(o => o.value);
        break;
      case PropertyType.DROPDOWN:
        schema.type = "string";
        // Dynamic dropdowns become free-text for AI — it discovers values via list actions
        break;
      case PropertyType.MULTI_SELECT_DROPDOWN:
      case PropertyType.STATIC_MULTI_SELECT_DROPDOWN:
        schema.type = "array";
        schema.items = { type: "string" };
        break;
      case PropertyType.FILE:
        schema.type = "string";
        schema.description += " (file URL or base64 data)";
        break;
      case PropertyType.DYNAMIC:
        schema.type = "object";
        schema.additionalProperties = true;
        break;
      default:
        schema.type = "string";
    }

    if (prop.defaultValue !== undefined) schema.default = prop.defaultValue;
    properties[name] = schema;
    if (prop.required) required.push(name);
  }

  return { type: "object", properties, required };
}
```

### 6.3 Tool Merging in Chat Route

Modify `createAllTools()` in `services/api/src/ai/providers/copilot.ts`:

```typescript
export async function createAllTools(
  projectId: string,
  workspaceId?: string,
  userId?: string,
): Promise<Tool[]> {
  // 1. Built-in tools (unchanged)
  const builtinTools = createDoableTools(projectId);

  if (!workspaceId) return builtinTools;

  // 2. Native integration tools (NEW)
  let integrationTools: Tool[] = [];
  try {
    integrationTools = await createIntegrationTools({
      workspaceId,
      projectId,
      userId: userId!,
    });
  } catch (err) {
    logger.warn("Failed to load integration tools", err);
  }

  // 3. MCP connector tools (existing, unchanged)
  let mcpTools: Tool[] = [];
  try {
    const configs = await connectors.getEffectiveConnectors(workspaceId, projectId, userId);
    // ... existing MCP tool loading ...
    mcpTools = createMcpTools(resolvedTools, manager, configMap);
  } catch (err) {
    logger.warn("Failed to load MCP tools", err);
  }

  return [...builtinTools, ...integrationTools, ...mcpTools];
}
```

**Tool naming comparison:**

| Type | Name Pattern | Example |
|------|-------------|---------|
| Built-in | `{name}` | `create_file` |
| **Native integration** | **`{integration}_{action}`** | **`slack_send_message`** |
| MCP custom | `mcp_{connector}_{tool}` | `mcp_my_api_get_users` |

---

## 7. Backend: API Routes

### 7.1 New Routes

**File:** `services/api/src/routes/integrations.ts`

```
GET    /integrations/catalog                     → List available integrations (registry)
GET    /integrations/catalog/:id                 → Get integration details
GET    /integrations/catalog/:id/actions          → List actions for an integration

GET    /workspaces/:wid/integrations             → List connected integrations
POST   /workspaces/:wid/integrations/:id/connect → Start connection (API key, custom auth)
DELETE /workspaces/:wid/integrations/:id/disconnect → Remove connection
POST   /workspaces/:wid/integrations/:id/test    → Test connection (runs piece's validate())
PATCH  /workspaces/:wid/integrations/:id         → Update connection (scope, credentials)

GET    /integrations/oauth/:id/authorize         → Start OAuth flow (returns redirect URL)
GET    /integrations/oauth/callback              → OAuth callback handler

GET    /admin/oauth-apps                         → List configured OAuth apps
POST   /admin/oauth-apps                         → Register OAuth app (client_id/secret)
DELETE /admin/oauth-apps/:id                     → Remove OAuth app
```

### 7.2 Catalog Endpoint

```typescript
// GET /integrations/catalog?category=communication&search=slack
app.get("/integrations/catalog", async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("search");
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");

  let items = Object.values(REGISTRY);

  if (category) items = items.filter(i => i.category === category);
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i =>
      i.displayName.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.tags.some(t => t.includes(q))
    );
  }

  // Enrich with connection status if workspaceId provided
  let connections: IntegrationConnection[] = [];
  if (workspaceId && userId) {
    connections = await credentialVault.getEffective(workspaceId, undefined, userId);
  }

  const connectedIds = new Set(connections.map(c => c.integration_id));

  return c.json({
    data: items.map(i => ({
      id: i.id,
      displayName: i.displayName,
      description: i.description,
      logoUrl: i.logoUrl,
      category: i.category,
      authType: i.authType,
      tier: i.tier,
      connected: connectedIds.has(i.id),
      actionCount: i.actions.length,
    })),
    categories: [...new Set(items.map(i => i.category))],
  });
});
```

---

## 8. Frontend: Integration Catalog UI

### 8.1 New Components

Replace the current manual "Add Integration" form with a visual catalog:

**Files to create:**
```
apps/web/src/modules/integrations/
  integration-catalog.tsx        — Browsable catalog with search & categories
  integration-card.tsx           — Individual integration card (logo, name, connect btn)
  integration-detail-sheet.tsx   — Slide-out with actions, description, auth setup
  connect-flow.tsx               — OAuth popup / API key form / custom auth form
  connected-integrations.tsx     — List of user's active connections
  use-integration-catalog.ts     — API hooks for catalog + connections
```

### 8.2 Catalog Layout

```
┌─────────────────────────────────────────────────────────┐
│  Integrations                              🔍 Search... │
│                                                         │
│  Categories:  All  Communication  Productivity  AI  ... │
│                                                         │
│  Connected (3)                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ [Slack logo]  │ │ [GH logo]    │ │ [Notion logo]│    │
│  │ Slack         │ │ GitHub       │ │ Notion       │    │
│  │ ● Connected   │ │ ● Connected  │ │ ● Connected  │    │
│  │ [Manage]      │ │ [Manage]     │ │ [Manage]     │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│  Available (47)                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ [Sheets logo] │ │ [Stripe logo]│ │ [Linear logo]│    │
│  │ Google Sheets │ │ Stripe       │ │ Linear       │    │
│  │ Spreadsheets  │ │ Payments     │ │ Issue track  │    │
│  │ [Connect]     │ │ [Connect]    │ │ [Connect]    │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ [Airtable]   │ │ [HubSpot]   │ │ [Discord]    │    │
│  │ ...          │ │ ...          │ │ ...          │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│  ─────────────────────────────────────────────────       │
│  Custom MCP Connectors                    [+ Add MCP]   │
│  (existing MCP UI stays here for power users)           │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Connect Flows by Auth Type

**OAuth2:** Click "Connect" → popup opens to provider's auth page → user grants access → popup closes → card shows "Connected"

**API Key (SecretText):** Click "Connect" → inline form appears with password field → paste key → "Connect" button → validates via piece's `validate()` function → card shows "Connected"

**Custom Auth:** Click "Connect" → form renders fields from piece's `customAuthProps` → fill in → validate → connect

**Basic Auth:** Click "Connect" → username + password fields → validate → connect

**None:** Automatically connected, no credentials needed.

### 8.4 Integration Detail Sheet

When user clicks on a connected integration or "Learn more":

```
┌─────────────────────────────────────────┐
│  ← Slack                          [×]    │
│                                          │
│  [Slack logo]                            │
│  Communication                           │
│  Send messages, manage channels, and     │
│  interact with your Slack workspace.     │
│                                          │
│  Status: ● Connected                     │
│  Connected as: workspace-name            │
│  Scope: Everyone in this workspace       │
│                                          │
│  ─────────────────────────────────       │
│  Available Actions (25)                  │
│                                          │
│  ⚡ Send Channel Message                 │
│     Post a message to a channel          │
│  ⚡ Send Direct Message                  │
│     Send a DM to a user                  │
│  ⚡ Create Channel                       │
│     Create a new Slack channel           │
│  ⚡ Find User by Email                   │
│     Look up a user by email address      │
│  ...                                     │
│                                          │
│  ─────────────────────────────────       │
│  [Test Connection]    [Disconnect]       │
└─────────────────────────────────────────┘
```

### 8.5 Integration Icons

Bundle SVG logos for all 50 Phase 1 integrations in `apps/web/public/integrations/`. For Phase 2+, use the `logoUrl` from piece metadata (Activepieces hosts these at their CDN, but we should vendor critical ones).

---

## 9. Database Schema Summary

### 9.1 New Tables

```sql
-- Migration: 02X_native_integrations.sql

-- 1. User/workspace connections to integrations
CREATE TABLE integration_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id        varchar(100) NOT NULL,
  scope                 varchar(20) NOT NULL DEFAULT 'user'
                        CHECK (scope IN ('workspace', 'project', 'user')),
  project_id            uuid REFERENCES projects(id) ON DELETE CASCADE,
  auth_type             varchar(20) NOT NULL,
  credentials_encrypted bytea NOT NULL,
  display_name          varchar(200),
  status                varchar(20) NOT NULL DEFAULT 'active',
  error_message         text,
  metadata              jsonb DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ic_lookup ON integration_connections (workspace_id, user_id, integration_id);
CREATE INDEX idx_ic_scope ON integration_connections (workspace_id, scope, status);

-- 2. OAuth app configurations (admin-managed)
CREATE TABLE oauth_apps (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id          varchar(100) NOT NULL,
  client_id               varchar(500) NOT NULL,
  client_secret_encrypted bytea NOT NULL,
  extra_config            jsonb DEFAULT '{}',
  is_global               boolean DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 3. Key-value store for piece actions/triggers
CREATE TABLE integration_store (
  scope_key     varchar(500) PRIMARY KEY,
  value         jsonb NOT NULL,
  workspace_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_is_workspace ON integration_store (workspace_id);

-- 4. Integration usage log (for analytics, rate limiting)
CREATE TABLE integration_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  user_id         uuid NOT NULL,
  integration_id  varchar(100) NOT NULL,
  action_name     varchar(200) NOT NULL,
  success         boolean NOT NULL,
  duration_ms     integer,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iul_lookup ON integration_usage_log (workspace_id, integration_id, created_at DESC);
```

---

## 10. Implementation Phases

### Phase 1: Foundation + 50 Integrations (Week 1-2)

**Week 1: Backend Engine**

| Day | Task | Files |
|-----|------|-------|
| 1 | Install framework packages (`pieces-framework`, `pieces-common`, `shared`). Install 50 priority piece packages. Verify imports work. | `package.json` |
| 1 | Database migration: `integration_connections`, `oauth_apps`, `integration_store`, `integration_usage_log` | `migrations/02X_native_integrations.sql` |
| 2 | Integration registry: Define `IntegrationDefinition` type, create entries for 50 pieces with auth configs | `integrations/registry.ts` |
| 2 | Credential vault: Encrypt/decrypt/store/get/getEffective/update/delete | `integrations/credential-vault.ts` |
| 3 | ActionContext adapter: `buildActionContext()`, `PostgresStore`, `DoableFilesService`, `DoableConnectionsManager` | `integrations/context-builder.ts`, `integrations/store.ts`, `integrations/files.ts`, `integrations/connections-manager.ts` |
| 3 | Integration runner: `loadPiece()`, `runAction()`, piece cache | `integrations/runner.ts` |
| 4 | Tool bridge: `createIntegrationTools()`, `actionPropsToJsonSchema()`, tool merging in `createAllTools()` | `integrations/tool-bridge.ts`, `ai/providers/copilot.ts` |
| 4 | API routes: Catalog, connect/disconnect, test, OAuth flow | `routes/integrations.ts` |
| 5 | OAuth2 flow: Authorization URL, callback handler, token exchange, PKCE support | `integrations/oauth2.ts` |
| 5 | Token refresh: Expiry detection, refresh flow, error handling, distributed locking | `integrations/oauth2.ts` |

**Week 2: Frontend + Testing**

| Day | Task | Files |
|-----|------|-------|
| 1-2 | Integration catalog UI: Grid layout, search, category filter, cards | `integrations/integration-catalog.tsx`, `integration-card.tsx` |
| 2 | Connect flows: OAuth popup, API key form, custom auth form | `integrations/connect-flow.tsx` |
| 3 | Connected integrations management: Status, test, disconnect | `integrations/connected-integrations.tsx` |
| 3 | Integration detail sheet: Action list, description, manage | `integrations/integration-detail-sheet.tsx` |
| 4 | API hooks: `useIntegrationCatalog()`, `useIntegrationConnections()` | `integrations/use-integration-catalog.ts` |
| 4 | Merge with existing integrations panel (keep MCP section at bottom) | `integrations/integrations-panel.tsx` |
| 5 | End-to-end testing: OAuth flow for Slack/Google/Notion, API key for Airtable, AI tool execution | Manual + test scripts |

### Phase 1.5: Knowledge Files for Priority 50 (Week 2-3, parallel with frontend)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1-2 | Write description overrides for all 50 integrations in registry | Rich 3-4 sentence descriptions replacing one-liners |
| 2-3 | Write knowledge.md for Tier A integrations (Slack, Notion, Sheets, GitHub, HubSpot, Jira, Salesforce) | 7 knowledge files (~400 tokens each) |
| 3-4 | Write knowledge.md for Tier B integrations (20 moderate-complexity ones) | 20 knowledge files |
| 4-5 | Write knowledge.md for Tier C integrations (23 simple ones) | 23 knowledge files |
| 5-6 | Write playbooks.md for Tier A + B integrations | 27 playbook files with multi-step recipes |
| 6 | Write examples.md for Tier A integrations | 7 example files with few-shot patterns |
| 6 | Build knowledge injector + two-stage tool selection | `knowledge-injector.ts`, `search_integrations` meta-tool |
| 6 | Test: verify AI effectiveness with vs without knowledge files | Before/after comparison on 10 sample prompts |

### Phase 2: Scale to 300+ (Week 4-5)

| Task | Description |
|------|-------------|
| Registry auto-generator | Script that reads piece metadata and generates registry entries |
| Install remaining pieces | `pnpm add @activepieces/piece-*` for next 250 |
| AI-generated knowledge files | Feed piece schemas to Claude, generate draft knowledge.md for 250 integrations |
| Human review of AI-generated knowledge | Review and fix top 50 most-used AI-generated knowledge files |
| OAuth app registration guide | Documentation for admins to register OAuth apps per service |
| Category refinement | Assign correct categories to all 300+ integrations |
| Connection validation | Run each piece's `validate()` function on connect |
| Error handling polish | User-friendly error messages for auth failures, rate limits, etc. |

### Phase 3: Full Coverage + Triggers (Week 5-6)

| Task | Description |
|------|-------------|
| Remaining 330 pieces | Install and register all remaining pieces |
| Trigger support | Webhook endpoint for WEBHOOK triggers, cron for POLLING triggers |
| Usage analytics | Dashboard showing integration usage, error rates |
| Rate limiting | Per-integration, per-user rate limits |
| Batch operations | Execute multiple integration actions in parallel |
| Integration search in chat | AI can suggest integrations to connect based on user intent |

### Phase 4: Advanced Features (Week 7+)

| Task | Description |
|------|-------------|
| User-provided OAuth apps | Let users bring their own OAuth client ID/secret |
| Integration marketplace | Community can submit custom pieces |
| Workflow chains | Chain multiple integration actions (Slack → Sheets → Email) |
| Scheduled actions | Cron-based recurring integration calls |
| Event-driven triggers | Real-time webhooks from external services → Doable actions |

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Component | Test |
|-----------|------|
| `actionPropsToJsonSchema()` | Property type conversion for all 21 types |
| `buildActionContext()` | Context shape matches framework expectations |
| `PostgresStore` | CRUD operations, scope isolation |
| `credentialVault` | Encrypt/decrypt round-trip, getEffective scope resolution |
| `buildAuthorizationUrl()` | URL construction, PKCE challenge, state encryption |
| `refreshOAuth2Token()` | Refresh flow, merge strategy, expiry detection |

### 11.2 Integration Tests

| Scenario | Test |
|----------|------|
| API key flow | Register Airtable API key → validate → list tables |
| OAuth2 flow | Slack OAuth → token exchange → send message |
| OAuth2 refresh | Simulate expired token → auto-refresh → action succeeds |
| Token revocation | Simulate `invalid_grant` → connection marked as revoked |
| AI tool execution | Chat message "send a Slack message" → AI calls `slack_send_channel_message` → message sent |
| Scope resolution | Workspace + project + user connections → correct tools visible |

### 11.3 End-to-End Tests

| Scenario | Verify |
|----------|--------|
| Connect Slack via OAuth | Full popup flow → connection stored → tools available in chat |
| Connect Airtable via API key | Paste key → validated → tools available |
| Disconnect integration | Remove connection → tools removed from chat |
| Multi-user scoping | Admin connects Slack workspace-wide → all users see Slack tools |
| MCP still works | Existing MCP connectors unaffected by new integration system |

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Credential storage | AES-256-CBC via `pgp_sym_encrypt` (existing Doable pattern) |
| OAuth state tampering | State parameter encrypted + nonce (CSRF protection) |
| Token exposure | Tokens never sent to frontend; API returns connection status only |
| Scope escalation | Workspace-scoped connections require admin role |
| Piece code injection | Pieces run in-process but only make HTTP calls; no filesystem/shell access |
| Rate limiting | Per-user, per-integration limits in `integration_usage_log` |
| OAuth app secrets | Stored encrypted, same as AI provider keys |
| Token refresh race | Database-level advisory lock prevents concurrent refresh |

---

## 13. Migration Path from Current System

The existing MCP system is **NOT replaced** — it's complemented:

```
BEFORE:
  Built-in tools + MCP tools (manual URL setup)

AFTER:
  Built-in tools + Native integration tools (catalog) + MCP tools (power users)
```

**UI change:** The "Integrations" panel gets a new top section (the catalog) with the existing MCP connector section moved to a "Custom Connectors" area at the bottom, keeping it accessible for power users.

**No breaking changes:** All existing MCP connectors continue to work unchanged. The `mcp_` prefix naming for MCP tools remains. Native integration tools use the clean `{integration}_{action}` naming.

---

## 14. Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Activepieces breaks npm package API | Low | High | Pin versions, test on update |
| OAuth providers change endpoints | Low | Medium | Registry is config — update URLs without code changes |
| Piece action fails silently | Medium | Medium | Wrap all `run()` calls with try/catch, log to `integration_usage_log` |
| Too many tools overwhelm AI context | Medium | High | Cap at 50 tools per chat session; show only connected integrations |
| `@activepieces/shared` package is too large | Low | Low | Tree-shaking or minimal subset extraction |
| OAuth app registration is manual work | High | Medium | Start with env vars, build admin UI in Phase 2 |

---

## 15. Success Metrics

| Metric | Target |
|--------|--------|
| Integrations available at launch | 50+ |
| Time to connect a new integration | < 30 seconds (OAuth), < 10 seconds (API key) |
| AI tool call success rate | > 95% |
| Token refresh success rate | > 99% |
| User perception | "These feel like built-in features, not add-ons" |
| Integration page load time | < 500ms |
| Total integrations by end of Phase 3 | 630+ |

---

## 16. Per-Integration Knowledge System (CRITICAL for AI Effectiveness)

### 16.1 Why This Is Non-Negotiable

Activepieces piece descriptions are **terrible for AI tool calling**:

```
Slack send_channel_message: "Send message to a channel"
Gmail send_email: "Send an email through a Gmail account"
Google Sheets insert_row: "Add a new row of data to a specific spreadsheet."
```

These one-liners tell the AI nothing about when to use a tool, what pitfalls to avoid, what parameters actually mean, or how to chain tools together. Anthropic's engineering team found that **"extremely detailed descriptions are by far the most important factor in tool performance."**

Without per-integration knowledge, the AI will:
- Pick wrong tools when multiple seem similar
- Pass wrong parameter formats (channel names vs IDs, date formats, etc.)
- Not know multi-step workflows ("list channels first, then send")
- Hit rate limits and API gotchas without recovery guidance
- Miss context about what data a tool returns vs doesn't return

### 16.2 Architecture: Three-Layer Knowledge System

Inspired by OpenClaw's SKILL.md pattern (209K GitHub stars, 13,700+ community skills) and Composio's `executionGuidance` + `knownPitfalls` pattern:

```
services/api/src/integrations/
  knowledge/                          ← Per-integration knowledge directory
    _index.ts                         ← Auto-generated index of all knowledge files
    slack/
      knowledge.md                    ← Core knowledge (always loaded when connected)
      playbooks.md                    ← Multi-step workflow recipes (loaded on-demand)
      examples.md                     ← Few-shot examples (loaded on-demand)
    notion/
      knowledge.md
      playbooks.md
    google-sheets/
      knowledge.md
      playbooks.md
      examples.md
    github/
      knowledge.md
      playbooks.md
    ...
```

**Three layers with different loading strategies:**

| Layer | File | When Loaded | Token Cost | Purpose |
|-------|------|-------------|------------|---------|
| **L1: Description Overrides** | In registry | Always (part of tool schema) | ~20-50 tokens/tool | Replace Activepieces' one-liners with rich descriptions |
| **L2: Core Knowledge** | `knowledge.md` | When integration is connected | ~200-500 tokens | When/when-not to use, gotchas, parameter guidance |
| **L3: Playbooks & Examples** | `playbooks.md`, `examples.md` | On-demand (deferred) | ~300-1000 tokens | Multi-step recipes, few-shot examples |

### 16.3 Layer 1: Description Overrides (In Registry)

Every action gets a rewritten description in the registry. These replace the Activepieces one-liners in the tool schema sent to the AI:

```typescript
// In registry.ts — actionOverrides
actionOverrides: {
  send_channel_message: {
    description:
      "Send a message to a Slack channel. Use when the user wants to post " +
      "a notification, update, or message to a specific Slack channel. " +
      "Requires channel ID (not channel name) — use slack_list_channels " +
      "first if you only have a name. Supports Slack markdown formatting " +
      "(bold: *text*, italic: _text_, code: `code`). " +
      "Returns: timestamp of the sent message.",
  },
  search_messages: {
    description:
      "Search Slack messages matching a query string. Use when the user " +
      "wants to find specific messages, conversations, or information " +
      "shared in Slack. Supports Slack search operators: from:@user, " +
      "in:#channel, has:link, before:YYYY-MM-DD, after:YYYY-MM-DD. " +
      "Returns: array of matching messages with channel, user, timestamp, text. " +
      "Does NOT return thread replies — use get_thread_messages for that.",
  },
},
```

**Template for writing overrides (from Anthropic's guidelines):**

```
"{What it does}. Use when {trigger conditions}. {NOT for: disambiguation}.
Requires {critical parameter guidance}. Returns: {what comes back}.
{One key gotcha if applicable}."
```

### 16.4 Layer 2: Core Knowledge Files (knowledge.md)

Each `knowledge.md` follows a strict structure with YAML frontmatter:

```markdown
---
integration: slack
loadWhen: connected
tokenBudget: 400
priority: 0.8
---

## Slack Integration Knowledge

### Authentication
- Uses OAuth2 or Bot Token (custom auth)
- Bot tokens start with `xoxb-`, user tokens with `xoxp-`
- OAuth scope determines what actions are available

### Critical Rules
- ALWAYS use channel IDs (C0123ABC), never #channel-names
- ALWAYS use user IDs (U0123ABC), never @usernames
- Use `slack_list_channels` to resolve names to IDs
- Use `slack_find_user_by_email` to resolve emails to user IDs
- Rate limit: 1 message/second/channel (Tier 2), 20 req/min for search (Tier 3)

### Parameter Formats
- Timestamps: Unix epoch with microseconds (e.g., "1710304378.475129")
- Dates in search: YYYY-MM-DD format
- Markdown: Slack-flavored (*bold*, _italic_, `code`, ```code block```)
- Mentions: <@U0123ABC> format, not @username

### What Actions Return
- send_message: Returns `{ ts, channel }` — save `ts` for threading/updates
- search_messages: Returns up to 100 messages, paginated
- list_channels: Returns all channels the bot is in (not all workspace channels)

### Common Mistakes to Avoid
- Sending to a channel the bot hasn't been invited to → error
- Using #channel-name instead of channel ID → "channel_not_found"
- Not handling pagination for large result sets
- Trying to delete/update messages older than the bot's permissions allow
```

### 16.5 Layer 3: Playbooks (playbooks.md)

Multi-step workflow recipes that teach the AI how to chain actions:

```markdown
---
integration: slack
loadWhen: on_demand
tokenBudget: 600
---

## Playbooks

### Send a notification about a new customer (Slack + HubSpot)
1. `hubspot_get_contact` — fetch contact details by email
2. `slack_list_channels` — find the #sales channel ID
3. `slack_send_channel_message` — post formatted notification with contact details

### Summarize a Slack channel conversation
1. `slack_get_channel_history` — fetch recent messages (limit: 50)
2. Read and summarize the messages (AI does this natively)
3. If user wants it posted: `slack_send_channel_message` with summary

### Find and notify a user
1. `slack_find_user_by_email` — resolve email to user ID
2. `slack_send_direct_message` — send DM to the user ID

### React to a message and follow up
1. User provides message link → extract channel + timestamp
2. `slack_add_reaction` — add the requested emoji
3. `slack_send_channel_message` with `thread_ts` to reply in thread
```

### 16.6 Layer 3: Few-Shot Examples (examples.md)

Concrete input/output examples the AI can reference:

```markdown
---
integration: google-sheets
loadWhen: on_demand
tokenBudget: 400
---

## Examples

### Append a row to a spreadsheet
User: "Add John Smith, john@example.com, $5000 to my sales tracker"
Tool call:
```json
{
  "tool": "google_sheets_insert_row",
  "params": {
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "sheet_name": "Sheet1",
    "values": {
      "A": "John Smith",
      "B": "john@example.com",
      "C": "$5000"
    }
  }
}
```

### Find rows matching a criteria
User: "Find all orders over $1000 in the sales sheet"
Tool call:
```json
{
  "tool": "google_sheets_find_rows",
  "params": {
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "sheet_name": "Orders",
    "column_name": "Amount",
    "search_value": "1000",
    "match_type": "greater_than"
  }
}
```
```

### 16.7 Loading Strategy: Token-Efficient Context Engineering

#### The Budget Reality

Doable's existing context system (`context/injector.ts`) enforces:
- **`MAX_CONTEXT_TOKENS = 12,000`** (48,000 chars at 4 chars/token)
- Files added in priority order, truncated/dropped when budget runs out
- `getContextStats()` tracks `{ totalChars, estimatedTokens, budgetUsedPercent }`
- Stats returned on every context API call (`routes/context.ts`)

**Existing budget usage in agent mode (typical real project):**

| Files | Tokens |
|-------|--------|
| identity.md, soul.md, user.md | ~475 |
| instructions.md, knowledge.md | ~875 |
| memory.md (grows over time) | ~500 |
| boot.md, tools.md | ~125 |
| design-system.md, schema.md, architecture.md, api-reference.md | ~700 |
| agents.md, heartbeat.md | ~125 |
| Preamble | ~75 |
| **Subtotal: project context** | **~2,875** |
| **Remaining for integrations** | **~9,125** |

But memory.md grows. On a mature project with heavy memory, project context can reach ~4,000 tokens — leaving **~8,000 tokens** for integration knowledge + conversation headroom.

**Integration knowledge budget: 1,500 tokens max** (leaves ~6,500+ for conversation).

#### Three-Tier Loading Strategy

```
12,000 token budget
├── Project context files ............... ~3,000 tokens (existing system)
├── Integration knowledge ............... ~1,000 tokens (NEW, compact)
│   ├── Tier 1: Tool descriptions ........ (in tool schema, separate budget)
│   ├── Tier 2: Compact rules ............ ~100 tokens × 10 connected = ~1,000
│   └── Tier 3: Playbooks/examples ....... (via meta-tool, NOT in prompt)
└── Conversation headroom ............... ~8,000 tokens
```

**Key insight from OpenClaw:** They inject a compact index (~97 chars per skill) into the system prompt. The full SKILL.md body is loaded on-demand only when the AI actively uses that skill. We do the same — compact rules in the prompt, detailed playbooks/examples via a tool call.

#### Tier 1: Enhanced Tool Descriptions (In Tool Schema — Separate Budget)

Tool definitions passed via `defineTool()` are sent as function schemas alongside the system message. They do NOT count against the 12K context budget — the SDK/LLM processes them separately. Each enhanced description adds ~50 tokens per tool.

With 50 tools from 10 connected integrations: ~2,500 tokens in tool schemas. This is the LLM's problem, not the context budget's.

#### Tier 2: Compact Knowledge Rules (In System Prompt — Counts Against Budget)

Each knowledge.md has a **compact version** — 5-8 bullet points, ~400 chars (~100 tokens):

```markdown
## Slack
- Use channel IDs (C0ABC), not #names. Call slack_list_channels to resolve.
- Use user IDs (U0ABC), not @names. Call slack_find_user_by_email to resolve.
- Rate: 1 msg/sec/channel. Search: 20 req/min.
- send_message returns { ts, channel } — save ts for threading/updates.
- Markdown: *bold*, _italic_, `code`, <@U0ABC> for mentions.
- Channel must have bot invited, or send will fail with channel_not_found.
```

10 connected integrations × ~100 tokens = **~1,000 tokens**. Fits within budget.

#### Tier 3: Playbooks & Examples (Via Meta-Tool — NOT in Prompt)

Playbooks and examples are too large for the system prompt. They're accessed via a `get_integration_guide` tool — the same pattern used for `plan.md` (which is NOT injected into context but read on-demand via `read_file`):

```typescript
defineTool("get_integration_guide", {
  description:
    "Get detailed usage guide, playbooks, and examples for a connected " +
    "integration. Call this BEFORE performing a multi-step workflow with " +
    "an integration, or when you need parameter format details.",
  parameters: {
    type: "object",
    properties: {
      integration: {
        type: "string",
        description: "Integration ID (e.g., 'slack', 'notion', 'google-sheets')",
      },
      topic: {
        type: "string",
        enum: ["playbooks", "examples", "all"],
        description: "What to retrieve (default: all)",
      },
    },
    required: ["integration"],
  },
  handler: async (args) => {
    const playbooks = await loadPlaybooks(args.integration);
    const examples = await loadExamples(args.integration);
    return {
      success: true,
      result: JSON.stringify({ playbooks, examples }, null, 2),
    };
  },
});
```

This costs 0 tokens in the system prompt. The AI calls it when needed, and the response enters the conversation as a tool result (same as any other tool call).

#### Where It Plugs Into the Existing System

Integration knowledge injects in `chat.ts` right after the existing context assembly. The existing `buildContextPrompt()` pipeline is untouched — integration knowledge is appended as a separate block:

```typescript
// chat.ts — existing code (unchanged):
const systemPrompt = buildSystemPrompt(context, mode);        // base + mode instructions
const dbContextBlock = buildContextPrompt(dbFiles, mode);      // identity, soul, etc.

// NEW: Build compact integration knowledge block
let integrationBlock = "";
if (mode === "agent" && workspaceId && userId) {
  const connectedIds = await getConnectedIntegrationIds(workspaceId, userId);
  if (connectedIds.length > 0) {
    integrationBlock = await buildCompactIntegrationKnowledge(connectedIds);
  }
}

// Combine (existing pattern):
const fullSystemPrompt = [systemPrompt, dbContextBlock, integrationBlock]
  .filter(Boolean)
  .join("\n\n");

// Pass to Copilot SDK session (unchanged):
eng.createSession({ systemPrompt: fullSystemPrompt, tools: sessionTools });
```

**`buildCompactIntegrationKnowledge()`:**

```typescript
const INTEGRATION_KNOWLEDGE_BUDGET = 6_000; // chars (~1,500 tokens)

async function buildCompactIntegrationKnowledge(connectedIds: string[]): Promise<string> {
  let remaining = INTEGRATION_KNOWLEDGE_BUDGET;
  const parts: string[] = [];

  for (const id of connectedIds) {
    const compact = getCompactKnowledge(id); // Pre-loaded, cached
    if (!compact) continue;
    const block = `<integration name="${id}">\n${compact}\n</integration>`;
    if (block.length > remaining) break;
    parts.push(block);
    remaining -= block.length;
  }

  if (parts.length === 0) return "";
  return `<connected-integrations>\nThe following integrations are connected. Follow these rules when using their tools.\n${parts.join("\n")}\n</connected-integrations>`;
}
```

This respects the existing token budget system — `buildContextPrompt()` already tracks and enforces `MAX_CONTEXT_CHARS`. The integration block is appended after, with its own hard cap of 6,000 chars (~1,500 tokens). Combined: project context (~12K chars) + integration knowledge (~6K chars) stays well within what the LLM can process.
```

### 16.8 Knowledge File Specification

**Frontmatter Schema:**

```yaml
---
integration: string        # Must match registry ID (e.g., "slack")
loadWhen: string            # "connected" | "on_demand" | "always"
tokenBudget: number         # Max tokens for this file (enforced via truncation)
priority: number            # 0.0-1.0 for ordering when budget is tight
requires: string[]          # Other integrations that must be connected (optional)
version: string             # Semantic version for cache invalidation (optional)
---
```

**Content Structure Rules:**

1. **knowledge.md** — Required sections: Authentication, Critical Rules, Parameter Formats, Common Mistakes. Optional: What Actions Return, Rate Limits, API Quirks.
2. **playbooks.md** — Each playbook: Title, numbered steps with tool names, expected data flow between steps.
3. **examples.md** — Each example: Natural language user intent → tool call JSON → brief explanation of result.

### 16.9 Two-Stage Tool Selection (For Scale)

When connected integrations exceed 15 (yielding 100+ tools), switch to **deferred tool loading** (the pattern used by Claude Code and Cursor):

```typescript
// Instead of loading ALL integration tools into every chat session:

// 1. Load only built-in tools + a "search_integrations" meta-tool
const tools = [
  ...builtinTools,
  {
    name: "search_integrations",
    description:
      "Search available integration tools by keyword or intent. " +
      "Use this when you need to find the right tool for a task. " +
      "Returns matching tools with their full schemas.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you want to do (e.g., 'send slack message', 'create jira ticket')"
        },
        integration: {
          type: "string",
          description: "Specific integration to search within (optional)"
        }
      },
      required: ["query"]
    },
    execute: async (params) => {
      // Search integration registry + knowledge files
      // Return top 5 matching tools with full schemas
      const matches = await searchIntegrationTools(params.query, params.integration);
      return {
        success: true,
        output: JSON.stringify(matches, null, 2),
      };
    }
  }
];

// 2. AI calls search_integrations("send a message to slack")
// 3. Returns full tool schemas for slack_send_channel_message, slack_send_direct_message
// 4. AI can now call those tools directly (schemas cached for this session)
```

**Token savings:** ~85% reduction. Instead of 100+ tool schemas (50K+ tokens), the AI sees ~10 built-in tools + 1 search tool (~5K tokens), and loads specific integration tools on-demand.

### 16.10 Integration Knowledge for the Priority 50

Phase 1 requires hand-written knowledge files for 50 integrations. Estimated effort:

| Category | Integrations | Effort per Integration | Total |
|----------|-------------|----------------------|-------|
| **Tier A** (complex, many actions) | Slack, Notion, Google Sheets, GitHub, HubSpot, Jira, Salesforce | ~2 hours (knowledge + playbooks + examples) | ~14 hours |
| **Tier B** (moderate complexity) | Gmail, Discord, Airtable, Linear, Stripe, Asana, etc. (20 integrations) | ~1 hour (knowledge + playbooks) | ~20 hours |
| **Tier C** (simple, few actions) | SendGrid, Twilio, Todoist, Bluesky, etc. (23 integrations) | ~30 min (knowledge only) | ~12 hours |
| **Total** | 50 | | **~46 hours (~6 days)** |

For Phase 2+ (300+ integrations), use AI-assisted generation: feed the piece's action descriptions + property schemas to Claude and generate draft knowledge files, then human-review the top 50.

### 16.11 Cross-Integration Playbooks

Some workflows span multiple integrations. These live in a shared directory:

```
services/api/src/integrations/knowledge/
  _cross-integration/
    crm-to-slack-notification.md    ← HubSpot/Salesforce → Slack
    form-to-spreadsheet.md          ← Typeform/JotForm → Google Sheets
    issue-to-message.md             ← Linear/Jira → Slack/Discord
    social-media-posting.md         ← Twitter + LinkedIn + Facebook
```

Loaded when ANY of the referenced integrations are connected.

### 16.12 Community Knowledge (Future)

Inspired by OpenClaw's ClawHub (13,700+ community skills):

- Users can contribute knowledge files for integrations
- Community-submitted playbooks for specific workflows
- Voting/curation system for quality control
- Version-controlled with changelogs

This is Phase 4+ and not in initial scope, but the file-based architecture supports it naturally.

---

## Appendix A: Activepieces Piece Package Names (Priority 50)

```
@activepieces/piece-slack
@activepieces/piece-discord
@activepieces/piece-microsoft-teams
@activepieces/piece-telegram-bot
@activepieces/piece-whatsapp
@activepieces/piece-gmail
@activepieces/piece-microsoft-outlook
@activepieces/piece-twilio
@activepieces/piece-notion
@activepieces/piece-google-sheets
@activepieces/piece-google-docs
@activepieces/piece-google-calendar
@activepieces/piece-google-drive
@activepieces/piece-airtable
@activepieces/piece-monday
@activepieces/piece-asana
@activepieces/piece-clickup
@activepieces/piece-trello
@activepieces/piece-todoist
@activepieces/piece-linear
@activepieces/piece-jira-cloud
@activepieces/piece-hubspot
@activepieces/piece-salesforce
@activepieces/piece-pipedrive
@activepieces/piece-zoho-crm
@activepieces/piece-github
@activepieces/piece-gitlab
@activepieces/piece-postgres
@activepieces/piece-mysql
@activepieces/piece-mongodb
@activepieces/piece-supabase
@activepieces/piece-firebase
@activepieces/piece-stripe
@activepieces/piece-quickbooks
@activepieces/piece-xero
@activepieces/piece-mailchimp
@activepieces/piece-sendgrid
@activepieces/piece-activecampaign
@activepieces/piece-beehiiv
@activepieces/piece-convertkit
@activepieces/piece-twitter
@activepieces/piece-linkedin
@activepieces/piece-instagram-business
@activepieces/piece-facebook-pages
@activepieces/piece-reddit
@activepieces/piece-bluesky
@activepieces/piece-openai
@activepieces/piece-claude
@activepieces/piece-google-gemini
@activepieces/piece-amazon-s3
@activepieces/piece-dropbox
@activepieces/piece-shopify
@activepieces/piece-woocommerce
@activepieces/piece-wordpress
@activepieces/piece-webflow
```

## Appendix B: Full 632 Piece List

activecampaign, activepieces, actualbudget, acuity-scheduling, acumbamail, afforai, agentx, ai, aianswer, aidbase, air-ops, aircall, airparser, airtable, airtop, alai, algolia, alt-text-ai, alttextify, amazon-bedrock, amazon-s3, amazon-secrets-manager, amazon-ses, amazon-sns, amazon-sqs, amazon-textract, aminos, ampeco, anyhook-graphql, anyhook-websocket, apify, apitable, apitemplate-io, apollo, appfollow, asana, ashby, ask-handle, asknews, assembled, assemblyai, attio, autocalls, avoma, azure-blob-storage, azure-communication-services, azure-openai, backblaze, bamboohr, bannerbear, barcode-lookup, baremetrics, base44, baserow, beamer, beehiiv, bettermode, bexio, bigcommerce, bigin-by-zoho, bika, billplz, binance, bitly, bland-ai, blockscout, bluesky, bokio, bolna, bonjoro, bookedin, box, brave-search, brilliant-directories, browse-ai, browserless, bubble, bumpups, bursty-ai, buttondown, cal-com, calendly, call-rounded, camb-ai, campaign-monitor, capsule-crm, captain-data, carbone, cartloom, cashfree-payments, certopus, chain-aware, chainalysis-api, chaindesk, chargekeep, chartly, chat-aid, chat-data, chatbase, chatfly, chatling, chatnode, chatsistant, chatwoot, checkout, circle, clarifai, claude, clearout, clearoutphone, clicdata, clickfunnels, clicksend, clickup, clockify, clockodo, close, cloudconvert, cloudinary, cloutly, coda, cody, cognito-forms, cohere, cometapi, comfyicu, confluence, constant-contact, contentful, contextual-ai, contiguity, convertkit, copper, copy-ai, coralogix, couchbase, crisp, cryptolens, cursor, customer-io, customgpt, cyberark, dappier, dashworks, datadog, datafuel, datocms, deepgram, deepl, deepseek, denser-ai, detecting-ai, devin, digital-ocean, digital-pilot, dimo, discord, discourse, dittofeed, docsbot, doctly, documentpro, documerge, docusign, drip, dropbox, drupal, dub, duckdb, dumpling-ai, dust, easy-peasy-ai, echowin, eden-ai, elevenlabs, emailit, emailoctopus, enrichlayer, esignatures, eth-name-service, everhour, exa, extracta-ai, facebook-leads, facebook-pages, famulor, fathom-analytics, fathom, feathery, fellow, figma, fillout-forms, fireberry, firecrawl, fireflies-ai, flipando, fliqr-ai, flow-helper, flow-parser, flowise, flowlu, folk, foreplay-co, formbricks, formitable, formsite, formspark, formstack, fountain, fragment, frame, free-agent, freshdesk, freshsales, front, gameball, gamma, gcloud-pubsub, gender-api, generatebanners, getresponse, ghostcms, giftbit, gistly, gitea, github, gitlab, gladia, gmail, goodmem, google-bigquery, google-calendar, google-cloud-storage, google-contacts, google-docs, google-drive, google-forms, google-gemini, google-my-business, google-search-console, google-search, google-sheets, google-slides, google-tasks, google-vertexai, googlechat, gotify, gptzero-detect-ai, gravityforms, greenpt, greip, griptape, grist, grok-xai, groq, guidelite, hackernews, harvest, hashi-corp-vault, hastewire, heartbeat, hedy, help-scout, heygen, heymarket-sms, housecall-pro, http-oauth2, hubspot, hugging-face, hume-ai, hunter, hystruct, ibm-cognose, image-router, imap, influencers-club, insightly, insighto-ai, insta-charts, instabase, instagram-business, instantly-ai, instasent, intercom, intruder, invoiceninja, jina-ai, jira-cloud, jira-data-center, jogg-ai, jotform, json, just-invoice, kallabot-ai, kapso, katana, kimai, kissflow, kizeo-forms, klaviyo, knack, kommo, krisp-call, kudosity, lead-connector, leap-ai, leexi, lemlist, lemon-squeezy, lets-calendar, letta, lever, lightfunnels, line, linear, linka, linkedin, linkup, livesession, llmrails, lobstermail, localai, lofty, logrocket, logsnag, lokalise, loops, lucidya, lusha, luxury-presence, magical-api, magicslides, mailchain, mailchimp, mailer-lite, mailercheck, maileroo, mailjet, manus, manychat, mastodon, matomo, matrix, mattermost, mautic, mcp, medullar, meetgeek-ai, meistertask, mem, mempool-space, messagebird, metabase, metatext, microsoft-365-people, microsoft-365-planner, microsoft-copilot, microsoft-dynamics-365-business-central, microsoft-dynamics-crm, microsoft-excel-365, microsoft-onedrive, microsoft-onenote, microsoft-outlook-calendar, microsoft-outlook, microsoft-power-bi, microsoft-sharepoint, microsoft-teams, microsoft-todo, millionverifier, mind-studio, mindee, missive, mistral-ai, mixpanel, modelslab, mollie, monday, mongodb, moonclerk, mooninvoice, motion, motiontools, moveo-ai, moxie-crm, murf-api, mycase-piece, mysendingbox, mysql, netlify, netsuite, neverbounce, nifty, ninox, nocodb, notion, ntfy, nuelink, octopush-sms, odoo, okta, omni-co, omnihr, oncehub, oneclickimpact, onfleet, open-phone, open-router, openai, openmic-ai, opnform, opportify, oracle-database, oracle-fusion-cloud-erp, orimon, outseta, pandadoc, paperform, parser-expert, parseur, pastebin, pastefy, paywhirl, pdf-co, pdfcrowd, pdfmonkey, peekshot, perplexity-ai, personal-ai, phantombuster, phone-validator, photoroom, pinch-payments, pinecone, pinterest, pipedrive, placid, plausible, pocketbase, podio, pollybot-ai, poper, postgres, posthog, predict-leads, predis-ai, presenton, productboard, prompthub, promptmate, pushbullet, pushover, pylon, qdrant, quaderno, queue, quickbase, quickbooks, quickzu, qwilr, rabbitmq, raia-ai, rapidtext-ai, razorpay, reachinbox, recall-ai, reddit, reoon-verifier, resend, respaid, respond-io, retable, retell-ai, retune, returning-ai, robolly, roe-ai, rss, runware, runway, saastic, saleor, salesforce, sap-ariba, sardis, savvycal, scenario, scrapegrapghai, scrapeless, seek-table, segment, send-it, sender, sendfox, sendgrid, sendinblue, sendpulse, sendy, senja, serp-api, serpstat, service-now, sessions-us, seven, shippo, shopify, short-io, sign-now, signrequest, simplepdf, simpliroute, simplybookme, sitespeakai, skyprep, skyvern, slack, slidespeak, smaily, smartlead, smartsheet, smartsuite, smoove, smsmode, snowflake, soap, socialkit, softr, sperse, splitwise, spotify, square, stability-ai, stable-diffusion-webui, straico, stripe, supabase, supadata, surrealdb, surveymonkey, surveytale, swarmnode, synthesia, systeme-io, tableau, talkable, tally, tarvent, taskade, tavily, teable, teamleader, teamwork, telegram-bot, tenzo, textcortex-ai, thankster, ticktick, tidely, tidycal, time-ops, timelines-ai, tiny-talk-ai, tl-dv, todoist, toggl-track, totalcms, trello, truelayer, twenty, twilio, twin-labs, twitch, twitter, typeform, upgradechat, uscreen, vadoo-ai, validatedmails, valyu, vbout, vercel, vero, videoask, vidlab7, vidnoz, village, vimeo, visible, vlm-run, voipstudio, vouchery-io, vtex, vtiger, waitwhile, wealthbox, webex, webflow, webling, webscraping-ai, wedof, week-done, what-converts, whatsable, whatsapp, whatsscale, wonderchat, woocommerce, woodpecker, wootric, wordpress, workable, wrike, writesonic-bulk, wufoo, xero, youcanbookme, youform, youtube, zagomail, zendesk-sell, zendesk, zeplin, zerobounce, zoho-bookings, zoho-books, zoho-campaigns, zoho-crm, zoho-desk, zoho-invoice, zoho-mail, zoo, zoom, zuora.

## Appendix C: Category Assignment (Priority 50)

| Category | Integrations |
|----------|-------------|
| **Communication** | Slack, Discord, Microsoft Teams, Telegram, WhatsApp, Gmail, Outlook, Twilio |
| **Productivity** | Notion, Google Sheets, Google Docs, Google Calendar, Google Drive, Airtable, Monday, Asana, ClickUp, Trello, Todoist |
| **Project Management** | Linear, Jira Cloud |
| **CRM & Sales** | HubSpot, Salesforce, Pipedrive, Zoho CRM |
| **Developer Tools** | GitHub, GitLab, Postgres, MySQL, MongoDB, Supabase, Firebase |
| **Finance & Payments** | Stripe, QuickBooks, Xero |
| **Marketing** | Mailchimp, SendGrid, ActiveCampaign, Beehiiv, ConvertKit |
| **Social Media** | Twitter/X, LinkedIn, Instagram Business, Facebook Pages, Reddit, Bluesky |
| **AI & ML** | OpenAI, Claude, Google Gemini, Groq, Perplexity, ElevenLabs |
| **Data & Storage** | Amazon S3, Dropbox |
| **E-Commerce** | Shopify, WooCommerce |
| **Content** | WordPress, Webflow |
