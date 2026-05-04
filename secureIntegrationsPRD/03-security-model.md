# Security Model

## Threat Model

### Assets to Protect

| Asset | Impact if Compromised |
|-------|----------------------|
| Integration OAuth tokens (Slack, GitHub, etc.) | Attacker impersonates user on third-party services |
| Integration API keys (Stripe secret, OpenAI key) | Financial loss, data exfiltration |
| User data flowing through integrations | Privacy breach, compliance violation |
| Doable infrastructure | Lateral movement, denial of service |

### Threat Actors

1. **Malicious app visitor** — Someone visiting a deployed Doable app, inspecting network traffic
2. **Malicious app builder** — A Doable user trying to exfiltrate other users' credentials
3. **Compromised preview** — XSS in a generated app's preview iframe
4. **MITM on internal network** — Unlikely (localhost only) but defense-in-depth

### Attack Vectors & Mitigations

| # | Vector | Mitigation |
|---|--------|-----------|
| 1 | Extract credentials from browser DevTools | Credentials never reach browser — only proxy tokens |
| 2 | Steal JWT from preview postMessage | JWT is project-scoped + 15-min expiry + single-kind |
| 3 | Forge JWT | HMAC-SHA256 with server-only secret; clock-verified `exp` |
| 4 | Brute-force project API key | 32-char entropy (128-bit), stored as SHA-256 hash, rate-limited |
| 5 | Use stolen project API key from another origin | API keys are not origin-restricted (intentional for server-side use). Mitigation: key rotation, audit log alerts. |
| 6 | Call integrations for a different project | Token embeds project ID; vault lookup is scoped to that project's workspace |
| 7 | Enumerate project UUIDs to find valid tokens | UUIDs are v4 (122-bit entropy); JWT validation fails without valid signing |
| 8 | Exploit runAction for RCE | Activepieces actions run in isolated context; no eval/exec; HTTP-only |
| 9 | SSRF via integration action | Activepieces actions hit external APIs only; internal 127.0.0.1 ranges blocked in HTTP client |
| 10 | DoS via rapid integration calls | Per-project + per-integration rate limiting |
| 11 | Token theft via XSS in preview | Token is memory-only (not in localStorage/cookies); frame CSP limits exfil targets |
| 12 | Replay expired JWT | `exp` claim enforced; clock skew tolerance is 30 seconds |
| 13 | Project API key leaked in client bundle | Client keys (`VITE_*`) have lower rate limits; server keys (`DOABLE_PROJECT_KEY`) are never client-prefixed |

## Token Lifecycle

### Preview JWT

```
┌────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ User opens │     │ Editor requests  │     │ API issues JWT      │
│ project in │────▶│ token via        │────▶│ (15-min, signed,    │
│ editor     │     │ POST /connector- │     │ project+user scoped)│
└────────────┘     │ proxy-token      │     └─────────┬───────────┘
                   └──────────────────┘               │
                                                      ▼
                   ┌──────────────────┐     ┌─────────────────────┐
                   │ Preview iframe   │◀────│ Token delivered via  │
                   │ receives token   │     │ postMessage          │
                   │ (in memory only) │     └─────────────────────┘
                   └────────┬─────────┘
                            │
                            │ Uses token for connector-proxy calls
                            │
                            ▼
                   ┌──────────────────┐
                   │ Token expires    │     ← 15 minutes
                   │ (401 response)   │
                   └────────┬─────────┘
                            │
                            │ SDK re-requests via postMessage
                            ▼
                   ┌──────────────────┐
                   │ Fresh token      │     ← Cycle repeats
                   │ delivered        │
                   └──────────────────┘
```

**JWT Properties:**
- Algorithm: HS256
- Secret: `PROJECT_JWT_SECRET` env var (256-bit, randomly generated per deployment)
- Lifetime: 15 minutes (configurable via `CONNECTOR_PROXY_TOKEN_TTL_SEC`)
- Claims: `{ sub, pid, wid, kind: "connector-proxy", iat, exp }`
- Not stored server-side (stateless verification)

### Project API Key

```
┌────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ User deploys   │     │ System generates     │     │ Key stored as   │
│ project        │────▶│ dpk_<32-random>     │────▶│ SHA-256 hash    │
│ (first deploy) │     │ (shown once)        │     │ in DB           │
└────────────────┘     └─────────────────────┘     └─────────────────┘
```

**API Key Properties:**
- Format: `dpk_` + 32 alphanumeric chars (192-bit entropy)
- Storage: only the SHA-256 hash stored in `project_api_keys` table
- Rotation: users can regenerate (old key immediately invalidated)
- Scope: one key per project (not per integration)
- Two tiers:
  - **Client key** (`dpk_c_*`): rate-limited, for browser-side usage
  - **Server key** (`dpk_s_*`): higher limits, for Next.js server-side

## Database Schema

```sql
CREATE TABLE project_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash      text NOT NULL,              -- SHA-256 of the full key
  key_prefix    text NOT NULL,              -- first 8 chars for identification (dpk_c_xx or dpk_s_xx)
  tier          text NOT NULL DEFAULT 'client',  -- 'client' or 'server'
  created_by    uuid NOT NULL REFERENCES users(id),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_tier CHECK (tier IN ('client', 'server'))
);

CREATE INDEX idx_project_api_keys_hash ON project_api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_project_api_keys_project ON project_api_keys (project_id);
```

## Rate Limiting Strategy

### Tiered Limits

| Token Type | Per-Integration/min | Per-Project/min | Per-Workspace/hour |
|-----------|--------------------|-----------------|--------------------|
| Preview JWT | 30 | 100 | 2000 |
| Client API key (`dpk_c_*`) | 60 | 200 | 5000 |
| Server API key (`dpk_s_*`) | 120 | 500 | 10000 |

### Implementation

```typescript
// Rate limit keys in KV store:
`cp:${projectId}:${integrationId}:rpm`   // per-integration per-minute
`cp:${projectId}:rpm`                     // per-project per-minute
`cp:${workspaceId}:rph`                   // per-workspace per-hour
```

Rate limit headers returned on every response:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1717500000
```

## Audit Logging

Every connector-proxy call emits an audit event:

```typescript
interface ConnectorProxyAuditEvent {
  type: "connector-proxy.call";
  timestamp: string;             // ISO 8601
  projectId: string;
  workspaceId: string;
  userId: string;                // Who owns the credentials being used
  integrationId: string;
  actionName: string;
  authMode: "jwt" | "api-key-client" | "api-key-server";
  success: boolean;
  errorCode?: string;
  durationMs: number;
  requestIp: string;            // From X-Forwarded-For
  rateLimitRemaining: number;
}
```

Stored in:
- **Short-term:** `connector_proxy_audit_log` table (30-day retention, auto-pruned)
- **Real-time:** Emitted via existing xray/tracing infrastructure

Users can view their audit log via: `GET /workspaces/:id/integrations/audit-log?limit=100`

## Credential Isolation

### Between Projects

```
Workspace A
├── Slack (connected at workspace level)
│   └── Available to: Project 1, Project 2, Project 3
├── Project 1
│   └── Stripe (connected at project level)
│       └── Available to: Project 1 ONLY
└── Project 2
    └── Different Stripe (connected at project level)
        └── Available to: Project 2 ONLY
```

**Vault lookup priority** (same as existing `credentialVault.getEffective`):
1. Project-level connection (if exists) → wins
2. User-level connection → fallback
3. Workspace-level connection → final fallback

### Between Users

- Credentials are stored per-user (the user who connected the integration)
- The connector-proxy uses the **project owner's** credentials (or the user who connected)
- A collaborator using the preview sees the project owner's connected integrations
- A published app uses the deploy-time credentials (snapshot at publish)

## Secret Management

| Secret | Where Stored | Who Can Access |
|--------|-------------|----------------|
| Integration OAuth tokens | `integration_connections.credentials` (AES-256-GCM encrypted) | Vault decrypt only |
| Integration API keys | Same as above | Same |
| JWT signing secret | `PROJECT_JWT_SECRET` env var | API server process only |
| Project API key hash | `project_api_keys.key_hash` | DB read (no plaintext) |
| Project API key plaintext | Nowhere (shown once, user stores it) | User's responsibility |

## Content Security Policy

Preview iframes get these CSP headers ensuring the proxy is the only integration path:

```
connect-src 'self' /__doable/ https://*.supabase.co wss://*.supabase.co;
```

This means:
- `'self'` — fetch to same origin (for HMR, static assets)
- `/__doable/` — connector-proxy calls
- Supabase direct (special case, client SDK needs websocket)
- All other external API calls are **blocked in the browser** — forces use of the proxy

For deployed apps, CSP is relaxed (users may need direct API calls for Supabase, Firebase, etc.).

## Defense in Depth Layers

```
Layer 1: Token validation (reject unsigned/expired/wrong-kind)
    │
Layer 2: Project existence check (404 if deleted/invalid)
    │
Layer 3: Integration connection check (403 if not connected)
    │
Layer 4: Rate limiting (429 if over quota)
    │
Layer 5: Action existence check (400 if action not found)
    │
Layer 6: Activepieces sandboxed execution (no eval, no fs, no net to internal)
    │
Layer 7: Output sanitization (strip internal metadata, cap response size)
    │
Layer 8: Audit log (detect anomalies post-hoc)
```

## Key Rotation

### JWT Secret Rotation
- Zero-downtime: support array of secrets in `PROJECT_JWT_SECRETS` (sign with newest, verify with any)
- Rotate quarterly or on suspected compromise

### Project API Key Rotation
- User triggers via UI: Settings → Integrations → Regenerate Key
- Old key immediately invalidated (revoked_at set)
- New key issued (shown once)
- Deployed app needs env var update + restart

### Integration Credential Rotation
- OAuth tokens: auto-refreshed by Activepieces runner (existing behavior)
- API keys: user updates in integration settings (vault re-encrypts)
