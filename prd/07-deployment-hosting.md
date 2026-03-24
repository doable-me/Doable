# 07 — Deployment & Hosting

## Overview

Doable provides **instant, zero-config publishing** to `*.doable.app` for all users. One click → site is live. No DNS config, no hosting setup, no account creation elsewhere. Just like Lovable.

Hosting is **provider-agnostic**. The default is our own infrastructure, but users can connect any third-party hosting provider (Cloudflare Pages, Vercel, Netlify, etc.).

For Pro+ users who want their own domain, Doable supports custom domains via provider-agnostic DNS management.

---

## 1. Hosting Architecture

### 1.1 Provider-Agnostic Design

No library like Lexicon exists for multi-provider static site hosting, so we build our own **Doable Deploy Adapter** layer — a unified interface that abstracts deployment across providers.

| Layer | Description |
|-------|-------------|
| **Doable Deploy Adapter** | Unified deployment interface we build. One API → deploys to any supported provider |
| **Default provider** | Our own web server (Nginx/Caddy) with per-project directories under `*.doable.app` |
| **Third-party providers** | Cloudflare Pages, Vercel, Netlify, and 10+ others via adapters (user connects their own account) |

```
User clicks Publish
    │
    ▼
Vite production build
    │
    ▼
Doable Deploy Adapter (provider-agnostic interface)
    │
    ├── Default: Doable Cloud (→ our web server → [project].doable.app)
    ├── Cloudflare Pages adapter
    ├── Vercel adapter
    ├── Netlify adapter
    ├── AWS S3 + CloudFront adapter
    ├── GitHub Pages adapter
    ├── Firebase Hosting adapter
    ├── Render adapter
    ├── DigitalOcean App Platform adapter
    ├── Azure Static Web Apps adapter
    ├── Fly.io adapter
    ├── Surge.sh adapter
    └── Custom (any static file host via SSH/SFTP/API)
```

### 1.2 Default: Doable Cloud (`*.doable.app`)

Every project gets an **automatic subdomain** on `doable.app`. This is **our domain**, on **our web server**. Zero config.

| Feature | Description |
|---------|-------------|
| **How Lovable does it** | Every project gets `[project].lovable.app` instantly. No setup. Click Publish → live. We do the same. |
| **Default URL** | `[project-name].doable.app` — auto-provisioned, instant |
| **Infrastructure** | Our own web server (Nginx/Caddy) with per-project static file directories |
| **DNS** | We own `doable.app`. Subdomains created programmatically — no user DNS config |
| **SSL** | Automatic HTTPS via wildcard cert on `*.doable.app` (Let's Encrypt) |
| **CDN** | Reverse proxy cache layer in front of our web server (or optional Cloudflare CDN) |
| **What's deployed** | Vite production build output — static HTML/CSS/JS only |
| **First publish** | Zero config. User clicks Publish → site live in seconds |
| **Re-publish** | Same URL, updated content on each publish |
| **Test URL** | `[project-name].test.doable.app` — also auto-provisioned |
| **Storage** | Dedicated space per project (Free: capped, Pro: larger quota) |

### 1.3 How the Auto-Subdomain Works

```
User creates project "my-fitness-app"
    → Subdomain reserved: my-fitness-app.doable.app
    → Directory created: /sites/my-fitness-app/
    → No DNS config needed (we control *.doable.app wildcard)

User clicks Publish
    → Vite build runs
    → Static output placed in /sites/my-fitness-app/live/
    → Nginx serves my-fitness-app.doable.app from that directory
    → Done. That's it.
```

This mirrors exactly how Lovable works:
- Lovable: `[project].lovable.app` — instant, zero config
- Doable: `[project].doable.app` — instant, zero config

### 1.4 Third-Party Hosting Providers

Users can optionally deploy to third-party providers by connecting their account. Each provider has a dedicated **Doable Deploy Adapter**.

| Provider | Adapter | Auth Method | Notes |
|----------|---------|-------------|-------|
| **Cloudflare Pages** | Wrangler API | API token | Global CDN, 300+ PoPs, free tier 500 builds/mo |
| **Vercel** | Vercel API | OAuth / token | Edge network, serverless functions, preview deploys |
| **Netlify** | Netlify API | OAuth / token | CDN, serverless functions, form handling |
| **AWS S3 + CloudFront** | AWS SDK | Access key | Full control, global CDN, pay-per-use |
| **GitHub Pages** | Git push to `gh-pages` | GitHub auth | Free for public repos, custom domains |
| **Firebase Hosting** | Firebase API | Google OAuth | Global CDN, preview channels |
| **Render** | Render API | API key | Auto-deploy from Git, free static hosting |
| **DigitalOcean App Platform** | DO API | API token | Simple, per-project apps |
| **Azure Static Web Apps** | Azure CLI/API | Azure OAuth | Enterprise, global CDN |
| **Fly.io** | Fly CLI/API | Auth token | Edge deployment, Docker-based |
| **Surge.sh** | Surge CLI | Email/token | Simple CLI deploy, free tier |
| **Custom (SSH/SFTP)** | SCP/SFTP | SSH key | Any VPS, shared hosting, or custom server |

### 1.5 Provider Configuration UI

| Step | Description |
|------|-------------|
| 1 | User goes to **Project Settings → Hosting** |
| 2 | Default shows "Doable Cloud" (active) |
| 3 | User clicks "Add Provider" to connect a third-party |
| 4 | OAuth flow or API token input for the chosen provider |
| 5 | Provider appears as a deploy target in the Publish modal |
| 6 | User can deploy to **multiple providers simultaneously** |

### 1.6 Source Control — GitHub
| Scenario | Git Backend |
|----------|------------|
| **User has GitHub** | Project synced to user's own GitHub repo |
| **User has no GitHub** | Project stored in Doable's common GitHub org (private repo) |
| **Export anytime** | User can transfer to their own GitHub at any time |

### 1.7 Doable Platform Backend — Plain PostgreSQL
Doable's own services (auth, billing, workspaces, analytics, templates) all run on **our own PostgreSQL**. No third-party hosting dependencies for the platform itself.

---

## 2. Publishing Flow

### 2.1 One-Click Publish
1. User clicks **Publish** button in editor toolbar
2. Publish modal appears (explains what publishing does)
3. User selects deploy target: **Doable Cloud** (default) or connected third-party provider
4. User clicks Publish — **that's it, no other config needed on first use**
5. Build process runs (Vite production build)
6. Static output deployed via **Doable Deploy Adapter** to chosen provider
7. Source committed to GitHub (user's repo or Doable common org)
8. Site is live at `[project].doable.app` (or third-party URL) — shareable immediately
9. Re-publish after changes to update

> **First-time experience**: No DNS setup, no hosting config, no account creation elsewhere. User clicks one button, site is published to Doable Cloud. Just like Lovable.

### 2.2 Publish Modal
| Element | Description |
|---------|-------------|
| **Explanation** | Clear description of what publishing does |
| **Source code privacy** | Explicitly states code is NOT exposed |
| **Environment selector** | Deploy to Test or Live |
| **Domain display** | Shows the URL where app will be accessible |
| **Security review** | AI-powered **Security Review** scan available before publish — surfaces vulnerabilities |
| **Publish button** | Confirms deployment |

### 2.3 Publish Targets
| Target | Description |
|--------|-------------|
| **Test** | `[project].test.doable.app` — for development/QA |
| **Live (Doable Cloud)** | `[project].doable.app` or custom domain — production |
| **Live (Third-Party)** | Vercel, Netlify, Cloudflare Pages, etc. — uses connected provider |

### 2.4 Publishing Failure Recovery
- Failed publishes are **visible** in the UI
- Built-in "Try to Fix" action for recovery
- Agent can diagnose and fix deployment issues

---

## 3. Custom Domains (Optional, Pro+)

Custom domains are **entirely optional**. The default `*.doable.app` subdomain works for everyone with zero setup. Custom domains are for Pro+ users who want to serve their app from their own domain.

### 3.1 Setup
| Feature | Description |
|---------|-------------|
| **Custom domain** | Point your own domain to Doable |
| **Guided setup** | Prompts to add both `www` and non-`www` variants |
| **DNS management** | Provider-agnostic via **Lexicon** — supports Cloudflare, Route53, GoDaddy, Namecheap, DigitalOcean, Gandi, and 60+ DNS providers |
| **SSL** | Automatic SSL certificate provisioning (Let's Encrypt or provider-managed) |
| **Branding removal** | No "Built with Doable" badge |

### 3.2 Domain Configuration — Three-Tier Auto-Discovery

When a user enters their domain, Doable **auto-discovers** the best setup method by querying NS records and `_domainconnect` TXT records, then routes to the highest-automation tier available.

```
User enters "myapp.com"
        │
        ▼
DNS Provider Discovery
  Query NS records + _domainconnect TXT
        │
        ▼
Route to best tier
        │
   ┌────┼────────────────┐
   ▼    ▼                ▼
TIER 1          TIER 2          TIER 3
Domain Connect  Lexicon         Manual
OAuth—auto      API key—semi    Instructions
```

#### Tier 1: Domain Connect (OAuth — fully automatic)

**UX**: User clicks one button → OAuth popup → done. Zero DNS knowledge needed.

**How it works**: Domain Connect is an open standard (MIT license) where the DNS provider handles record creation via an OAuth consent flow. The user never sees DNS records.

| Aspect | Details |
|--------|---------|
| **Library** | `domainconnect_python` (MIT license, Python) |
| **Providers** | GoDaddy, IONOS, 1&1, and others supporting the Domain Connect protocol |
| **User effort** | Click "Connect" → authorize in OAuth popup → done |
| **Detection** | Query `_domainconnect` TXT record on the domain; if present, Tier 1 is available |
| **Records created** | CNAME + TXT automatically via the protocol |

#### Tier 2: Lexicon (API key — semi-automatic)

**UX**: User selects DNS provider from dropdown, enters API key once, Doable creates records automatically.

| Aspect | Details |
|--------|---------|
| **Library** | `dns-lexicon` v3.23 (MIT license, Python, actively maintained) |
| **Providers** | 89 DNS providers (Cloudflare, Route53, Namecheap, DigitalOcean, Hetzner, Gandi, etc.) |
| **User effort** | Pick provider → paste API key → done |
| **Detection** | Match NS records against known Lexicon provider nameservers |
| **Records created** | CNAME + TXT via Lexicon CLI |

#### Tier 3: Manual (copy-paste — universal fallback)

**UX**: Doable shows DNS record values, user adds them at their provider manually, clicks Verify.

| Aspect | Details |
|--------|---------|
| **Providers** | 100% — works with any DNS provider |
| **User effort** | Copy CNAME + TXT values → go to DNS provider → add records → come back → Verify |
| **Detection** | Fallback when Tier 1 and Tier 2 don't match |
| **Verification** | Poll DNS via `dnspython` until records propagate |

#### Provider Detection Flow

```typescript
async function detectDnsProvider(domain: string): Promise<{
  tier: 1 | 2 | 3;
  provider?: string;
  domainConnectApi?: string;
}> {
  // 1. Check for Domain Connect support
  const dcTxt = await resolveTxt(`_domainconnect.${domain}`);
  if (dcTxt) {
    return { tier: 1, domainConnectApi: dcTxt };
  }

  // 2. Check NS records against known Lexicon providers
  const nsRecords = await resolveNs(domain);
  const lexiconProvider = matchNsToLexiconProvider(nsRecords);
  if (lexiconProvider) {
    return { tier: 2, provider: lexiconProvider };
  }

  // 3. Fallback to manual
  return { tier: 3 };
}
```

#### All Open Source

| Component | License | Purpose |
|-----------|---------|---------|
| domainconnect_python | MIT | Tier 1: OAuth-based automatic DNS |
| dns-lexicon | MIT | Tier 2: API-based semi-automatic DNS (89 providers) |
| dnspython | ISC | DNS verification polling (all tiers) |
| Caddy | Apache 2.0 | SSL provisioning + reverse proxy |

No commercial dependencies. All called via CLI from Node.js.

### 3.2.1 Sandbox-Ready Domain Schema

Custom domains must be **target-agnostic** to support both current static sites and future server-side apps running in sandboxed jails (see PRD 18 — Sandbox & Isolation Architecture).

```sql
CREATE TABLE custom_domains (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain          text NOT NULL UNIQUE,           -- "myapp.com"

  -- Target routing (sandbox-ready)
  target_type     text NOT NULL DEFAULT 'static', -- 'static' | 'process' | 'remote'
  target_path     text,                           -- for static: "/data/sites/{sub}/live/"
  target_port     int,                            -- for process: jail port (e.g. 3147)
  target_host     text DEFAULT '127.0.0.1',       -- for remote: machine IP

  -- Verification
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  verification_token text NOT NULL,               -- TXT record value

  -- SSL
  ssl_mode        text NOT NULL DEFAULT 'auto',   -- 'auto' (Let's Encrypt) | 'custom'
  ssl_provisioned boolean NOT NULL DEFAULT false,

  -- Metadata
  environment     text NOT NULL DEFAULT 'production', -- 'production' | 'preview'
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**How Caddy routing adapts by target_type:**

```
target_type = 'static':
  myapp.com {
    root * /data/sites/{subdomain}/live
    file_server
    encode gzip
  }

target_type = 'process' (future — server-side app in jail):
  myapp.com {
    reverse_proxy localhost:{jail_port}
  }

target_type = 'remote' (future — app on remote machine):
  myapp.com {
    reverse_proxy {remote_host}:{remote_port}
  }
```

This schema ensures custom domains work today for static sites and seamlessly extend to server-side apps, jailed processes, and remote machines without schema migration when sandboxing is implemented.

### 3.3 DNS Provider Support (by tier)

| Provider | Tier | Method | User Effort |
|----------|------|--------|-------------|
| GoDaddy | **Tier 1** | Domain Connect OAuth | One click |
| IONOS / 1&1 | **Tier 1** | Domain Connect OAuth | One click |
| Cloudflare | **Tier 2** | Lexicon API | Paste API key |
| AWS Route 53 | **Tier 2** | Lexicon API | Paste API key |
| Namecheap | **Tier 2** | Lexicon API | Paste API key |
| DigitalOcean | **Tier 2** | Lexicon API | Paste API key |
| Hetzner | **Tier 2** | Lexicon API | Paste API key |
| Google Cloud DNS | **Tier 2** | Lexicon API | Paste API key |
| Gandi | **Tier 2** | Lexicon API | Paste API key |
| +82 more providers | **Tier 2** | Lexicon API | Paste API key |
| Any unlisted provider | **Tier 3** | Manual DNS records | Copy-paste + verify |

### 3.4 Self-Hosting & Graceful Degradation

Doable is open source. Self-hosters can set up their own instance with their own base domain. Every feature degrades gracefully based on what's installed:

| Dependency | If installed | If not installed |
|---|---|---|
| `domainconnect_python` | Tier 1 available (OAuth) | Tier 1 disabled, skip to Tier 2/3 |
| `dns-lexicon` | Tier 2 available (89 providers) | Tier 2 disabled, skip to Tier 3 |
| `dnspython` | DNS verification polling | Fall back to HTTP-based verification |
| Caddy | Auto SSL via Let's Encrypt | Manual cert provisioning |
| nsjail | Sandboxed execution | Fall back to Docker or passthrough |

**Admin panel for self-hosters** (under System Administration):

```
Platform Settings:
  Base Domain:        doable.example.org
  Wildcard SSL:       Auto (Caddy) / Custom certificate
  Custom Domains:     Enabled / Disabled

DNS Automation Status (auto-detected):
  Domain Connect:     ✓ Available / ✗ Not installed (pip install domainconnect)
  Lexicon (89 DNS):   ✓ Available / ✗ Not installed (pip install dns-lexicon)
  DNS Verification:   ✓ Available / ✗ Not installed (pip install dnspython)

Sandbox Status (auto-detected):
  nsjail:             ✓ Available / ✗ Not installed
  Docker:             ✓ Available / ✗ Not installed
```

**`setup-server.sh`** handles optional dependencies:
```bash
# Core (always installed)
apt install nodejs pnpm postgresql caddy

# Optional: DNS automation
pip install dns-lexicon dnspython domainconnect 2>/dev/null || echo "DNS automation unavailable — manual setup only"

# Optional: Sandbox
apt install nsjail 2>/dev/null || echo "nsjail unavailable — using passthrough"
```

The platform always works. More dependencies = more automation. Zero dependencies beyond Node/Postgres/Caddy = fully functional but manual.

### 3.5 Domain Types
| Domain | Plan | Config Required |
|--------|------|-----------------|
| `[project].doable.app` | All plans | **None** — auto-provisioned |
| `[project].test.doable.app` | All plans | **None** — auto-provisioned |
| Custom domain | Pro+ | Tier 1 (one click) / Tier 2 (API key) / Tier 3 (manual DNS) |
| Unlimited doable.app subdomains | Pro+ | **None** — auto-provisioned |

---

## 3.6 Implementation Specification — Custom Domains

This section fills every implementation gap required to build custom domains. Each numbered item corresponds to a gap identified during review.

### Gap 1: Database Schema

```sql
-- Migration: 022_custom_domains.sql

CREATE TABLE custom_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain              text NOT NULL,

  -- Target routing (sandbox-ready — see PRD 18)
  target_type         text NOT NULL DEFAULT 'static',  -- 'static' | 'process' | 'remote'
  target_path         text,            -- static: "/data/sites/{subdomain}/live/"
  target_port         int,             -- process: jail port
  target_host         text DEFAULT '127.0.0.1',  -- remote: machine IP

  -- DNS verification
  verification_token  text NOT NULL,   -- random token for TXT record
  verification_method text NOT NULL DEFAULT 'txt',  -- 'txt' | 'cname'
  verified            boolean NOT NULL DEFAULT false,
  verified_at         timestamptz,
  last_check_at       timestamptz,
  check_count         int NOT NULL DEFAULT 0,

  -- SSL
  ssl_mode            text NOT NULL DEFAULT 'auto',  -- 'auto' | 'custom'
  ssl_provisioned     boolean NOT NULL DEFAULT false,
  ssl_provisioned_at  timestamptz,

  -- DNS automation (Tier 1/2 only)
  dns_tier            int NOT NULL DEFAULT 3,  -- 1=DomainConnect, 2=Lexicon, 3=Manual
  dns_provider        text,            -- 'cloudflare', 'route53', etc.

  -- Lifecycle
  environment         text NOT NULL DEFAULT 'production',
  is_primary          boolean NOT NULL DEFAULT true,  -- primary domain for this project
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_custom_domain UNIQUE (domain),
  CONSTRAINT uq_primary_per_project_env UNIQUE (project_id, environment, is_primary)
    -- only one primary domain per project per environment
);

CREATE INDEX idx_cd_project ON custom_domains(project_id);
CREATE INDEX idx_cd_verified ON custom_domains(verified) WHERE verified = false;

-- DNS provider credentials (Tier 2 — Lexicon API keys)
CREATE TABLE dns_provider_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider        text NOT NULL,      -- 'cloudflare', 'route53', etc.
  label           text NOT NULL,      -- user-friendly name
  encrypted_token text NOT NULL,      -- pgp_sym_encrypt(token, ENCRYPTION_KEY)
  added_by        uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_dns_cred UNIQUE (workspace_id, provider)
);

CREATE TRIGGER trg_cd_updated
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Gap 2: Python Bridge (Lexicon / Domain Connect)

Python libraries are called via **CLI subprocess** from Node.js. No Python runtime dependency in the app — just installed binaries on the server.

```typescript
// services/api/src/domains/python-bridge.ts

import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

/** Check if a Python CLI tool is available */
export async function isToolAvailable(tool: string): Promise<boolean> {
  try {
    await exec("which", [tool]);
    return true;
  } catch { return false; }
}

/** Create DNS record via Lexicon CLI */
export async function lexiconCreateRecord(
  provider: string,
  domain: string,
  recordType: "CNAME" | "TXT",
  name: string,
  content: string,
  apiToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const env = { ...process.env };
    // Lexicon uses LEXICON_{PROVIDER}_TOKEN or provider-specific env vars
    env[`LEXICON_${provider.toUpperCase()}_AUTH_TOKEN`] = apiToken;

    await exec("lexicon", [
      provider, "create", domain, recordType,
      "--name", name,
      "--content", content,
    ], { env, timeout: 30_000 });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Delete DNS record via Lexicon CLI */
export async function lexiconDeleteRecord(
  provider: string, domain: string, recordType: string,
  name: string, content: string, apiToken: string
): Promise<{ success: boolean; error?: string }> {
  // Same pattern as create but with "delete" subcommand
}
```

**Fallback**: If `lexicon` CLI is not installed, Tier 2 is disabled. The system checks at startup:
```typescript
const LEXICON_AVAILABLE = await isToolAvailable("lexicon");
const DOMAIN_CONNECT_AVAILABLE = await isToolAvailable("domainconnect_cli");
```

### Gap 3: SSL Provisioning Flow

**Caddy handles SSL automatically.** When a domain is added to Caddy's config, Caddy:
1. Detects it needs a certificate
2. Performs HTTP-01 ACME challenge (proves domain ownership via `/.well-known/acme-challenge/`)
3. Obtains cert from Let's Encrypt
4. Auto-renews before expiry

**No code needed for SSL provisioning.** We just add the domain to Caddy's config and Caddy does the rest.

| Challenge type | How it works | When to use |
|---|---|---|
| **HTTP-01** (default) | Let's Encrypt hits `http://myapp.com/.well-known/acme-challenge/{token}` | Custom domains (Caddy handles this automatically) |
| **DNS-01** | Prove ownership via TXT record | Wildcard certs (`*.doable.app`) — already configured |

**Per-domain certs** (not wildcard): Each custom domain gets its own Let's Encrypt cert. Caddy manages this automatically — no cert storage, no renewal cron, no manual intervention.

**SSL provisioning time**: Caddy obtains a cert in **< 30 seconds** after the domain is added to config, as long as DNS has propagated. The "< 5 minutes" target includes DNS propagation wait time.

**Prerequisite**: The domain's DNS must already point to our server (CNAME to `cname.doable.app`) before Caddy can obtain the cert. This is enforced by our DNS verification step.

### Gap 4: Caddy Dynamic Configuration

Caddy has a **built-in admin API** on `localhost:2019` for dynamic config changes. No config file reload needed.

```typescript
// services/api/src/domains/caddy-manager.ts

const CADDY_ADMIN = "http://127.0.0.1:2019";

/** Add a custom domain route to Caddy */
export async function addDomainToCaddy(domain: string, config: {
  targetType: "static" | "process" | "remote";
  targetPath?: string;
  targetPort?: number;
  targetHost?: string;
}): Promise<void> {
  const route = buildCaddyRoute(domain, config);

  // POST to Caddy admin API to add the route
  await fetch(`${CADDY_ADMIN}/config/apps/http/servers/custom_domains/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
}

/** Remove a custom domain route from Caddy */
export async function removeDomainFromCaddy(domain: string): Promise<void> {
  // DELETE the route by domain ID
  await fetch(`${CADDY_ADMIN}/id/${domainToId(domain)}`, {
    method: "DELETE",
  });
}

function buildCaddyRoute(domain: string, config: CaddyTargetConfig) {
  const handler = config.targetType === "static"
    ? { handler: "file_server", root: config.targetPath }
    : { handler: "reverse_proxy", upstreams: [{ dial: `${config.targetHost ?? "127.0.0.1"}:${config.targetPort}` }] };

  return {
    "@id": domainToId(domain),
    match: [{ host: [domain] }],
    handle: [handler],
    terminal: true,
  };
}
```

**Base Caddy config** (version-controlled in repo, deployed to server):

```json
// caddy/config.json
{
  "apps": {
    "http": {
      "servers": {
        "doable_app": {
          "listen": ["127.0.0.1:443", "127.0.0.1:80"],
          "routes": [
            {
              "@id": "wildcard_doable",
              "match": [{ "host": ["*.doable.app"] }],
              "handle": [{
                "handler": "file_server",
                "root": "/data/sites/{http.request.host.labels.2}/live"
              }]
            }
          ]
        },
        "custom_domains": {
          "listen": ["127.0.0.1:443", "127.0.0.1:80"],
          "routes": []
        }
      }
    }
  }
}
```

Custom domain routes are added/removed to the `custom_domains` server dynamically via the admin API. The `doable_app` server handles wildcard subdomains as before.

### Gap 5: Cloudflare Tunnel Routing

Cloudflare Tunnel currently routes `*.doable.me` → `localhost:443`. For custom domains, the tunnel needs to accept traffic for arbitrary domains.

**Two approaches:**

**Option A: Catch-all ingress rule (recommended)**

The Cloudflare Tunnel config already has a catch-all rule. All HTTP(S) traffic arriving at the tunnel is forwarded to Caddy. Caddy decides what to do based on the `Host` header.

```yaml
# /etc/cloudflared/config.yml
tunnel: <tunnel-id>
ingress:
  # Catch-all: forward everything to Caddy
  - service: https://127.0.0.1:443
    originRequest:
      noTLSVerify: true
```

The user adds a CNAME on their domain pointing to the tunnel:
```
myapp.com  CNAME  <tunnel-id>.cfargotunnel.com
```

This means any domain pointing to our tunnel reaches Caddy, and Caddy routes it based on the custom_domains config.

**Option B: Cloudflare DNS proxy (if using Cloudflare for DNS)**

If the user's domain is on Cloudflare DNS, they add:
```
myapp.com  CNAME  cname.doable.app  (proxied)
```

Cloudflare proxies the traffic through to our tunnel. Same result.

**No `--hostname` additions needed.** The catch-all ingress rule handles all domains.

**What the user actually configures:**
```
CNAME  myapp.com  →  cname.doable.app    (or <tunnel-id>.cfargotunnel.com)
TXT    _doable-verify.myapp.com  →  doable-verify=<token>
```

### Gap 6: DNS Verification Flow

```typescript
// services/api/src/domains/dns-verifier.ts

import { promises as dns } from "node:dns";

const MAX_CHECKS = 60;           // max polling attempts
const POLL_INTERVAL_MS = 10_000; // 10 seconds between checks
const MAX_POLL_TIME_MS = 600_000; // 10 minutes max total

/** Verify a TXT record exists */
export async function verifyDomainTxt(
  domain: string,
  expectedToken: string
): Promise<{ verified: boolean; error?: string }> {
  const txtHost = `_doable-verify.${domain}`;

  try {
    const records = await dns.resolveTxt(txtHost);
    const flat = records.flat();
    const found = flat.some(r => r === `doable-verify=${expectedToken}`);
    return { verified: found };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { verified: false, error: "TXT record not found yet" };
    }
    return { verified: false, error: String(err) };
  }
}

/** Verify CNAME points to our server */
export async function verifyCname(
  domain: string,
  expectedTarget: string  // "cname.doable.app"
): Promise<{ verified: boolean; error?: string }> {
  try {
    const records = await dns.resolveCname(domain);
    const found = records.some(r => r.endsWith(expectedTarget));
    return { verified: found };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { verified: false, error: "CNAME not found yet" };
    }
    return { verified: false, error: String(err) };
  }
}
```

**Verification flow:**

```
User adds domain
       │
       ▼
Generate verification_token (crypto.randomUUID().slice(0, 8))
       │
       ▼
Show instructions: "Add TXT _doable-verify.myapp.com = doable-verify={token}"
       │
       ▼
User clicks "Verify" (or auto-poll starts)
       │
       ▼
Check TXT record (Node.js dns.resolveTxt — no Python needed)
       │
       ├── Found? → Check CNAME points to cname.doable.app
       │              ├── Yes → Mark verified, add to Caddy, SSL auto-provisions
       │              └── No  → "TXT verified but CNAME not pointing to us yet"
       │
       └── Not found? → "Record not found. DNS can take up to 48 hours to propagate."
                         Auto-retry every 10 seconds for up to 10 minutes.
                         After 10 min: stop polling, show "Check again" button.
```

**On failure:**
- Show clear error: "We couldn't find the TXT record. Make sure you added it at your DNS provider."
- "Check again" button for manual retry
- Link to provider-specific help docs (if provider was detected)

### Gap 7: Domain Lifecycle

| Event | What happens |
|-------|-------------|
| **Add domain** | Create `custom_domains` row, status=unverified, show DNS instructions |
| **Verify** | Poll DNS, mark verified, add to Caddy, SSL auto-provisions |
| **Remove domain** | Delete from `custom_domains`, remove from Caddy, cert auto-cleaned by Caddy |
| **Transfer to another project** | Remove from old project, add to new project (must re-verify) |
| **Plan downgrade (Pro → Free)** | Grace period: 30 days. After 30 days, domain is deactivated (removed from Caddy) but NOT deleted. Upgrading back re-activates immediately. |
| **Project deleted** | `ON DELETE CASCADE` removes domain row, Caddy route auto-cleaned on next sync |
| **Domain expires (at registrar)** | DNS stops resolving → CNAME verification fails on next periodic check → mark as unverified → remove from Caddy after 7 days unverified |
| **Periodic health check** | Cron every 6 hours: re-verify all active domains. If CNAME no longer points to us, mark unverified and notify user. |

**Periodic health check** (background job):
```typescript
// Runs every 6 hours
async function healthCheckDomains() {
  const domains = await db.customDomains.listVerified();
  for (const d of domains) {
    const cname = await verifyCname(d.domain, "cname.doable.app");
    if (!cname.verified) {
      await db.customDomains.markUnverified(d.id);
      await notifyUser(d.created_by, `Your domain ${d.domain} is no longer pointing to Doable.`);
      // Grace period: remove from Caddy after 7 days unverified
      if (daysSince(d.verified_at) > 7) {
        await removeDomainFromCaddy(d.domain);
      }
    }
  }
}
```

### Gap 8: API Routes

```typescript
// services/api/src/routes/custom-domains.ts

// All routes under /workspaces/:workspaceId/projects/:projectId/domains

GET    /domains                    // List all domains for project
POST   /domains                    // Add domain (returns verification instructions)
POST   /domains/:domainId/verify   // Trigger verification check
DELETE /domains/:domainId          // Remove domain
PATCH  /domains/:domainId          // Update (set primary, change environment)

// DNS provider management (workspace-level, for Tier 2)
GET    /dns-providers              // List saved DNS provider credentials
POST   /dns-providers              // Save DNS provider credential (encrypted)
DELETE /dns-providers/:id          // Remove credential

// DNS auto-discovery (called when user enters a domain)
POST   /domains/discover           // { domain: "myapp.com" } → { tier, provider }

// Admin: health check (platform-level)
POST   /admin/domains/health-check // Trigger manual health check of all domains
```

**Request/response examples:**

```typescript
// POST /domains — Add a domain
// Request:
{ "domain": "myapp.com", "environment": "production" }

// Response:
{
  "data": {
    "id": "uuid",
    "domain": "myapp.com",
    "verified": false,
    "dns_tier": 3,
    "verification_token": "a1b2c3d4",
    "instructions": {
      "cname": { "name": "myapp.com", "value": "cname.doable.app" },
      "txt": { "name": "_doable-verify.myapp.com", "value": "doable-verify=a1b2c3d4" }
    }
  }
}

// POST /domains/discover — Auto-detect DNS provider
// Request:
{ "domain": "myapp.com" }

// Response:
{
  "tier": 2,
  "provider": "cloudflare",
  "providerLabel": "Cloudflare",
  "hasCredential": false  // true if workspace already has a Cloudflare API key saved
}
```

### Gap 9: DNS Provider Credential Storage

Same pattern as copilot account tokens — `pgp_sym_encrypt` with the platform's `ENCRYPTION_KEY`.

```typescript
// Add credential
async addDnsCredential(data: {
  workspaceId: string;
  provider: string;
  label: string;
  token: string;
  addedBy: string;
}) {
  return sql`
    INSERT INTO dns_provider_credentials (workspace_id, provider, label, encrypted_token, added_by)
    VALUES (
      ${data.workspaceId},
      ${data.provider},
      ${data.label},
      pgp_sym_encrypt(${data.token}, ${ENCRYPTION_KEY}),
      ${data.addedBy}
    )
    ON CONFLICT (workspace_id, provider) DO UPDATE SET
      encrypted_token = pgp_sym_encrypt(${data.token}, ${ENCRYPTION_KEY}),
      label = ${data.label}
    RETURNING id, workspace_id, provider, label, created_at
  `;
}

// Decrypt for use (never sent to client)
async getDnsCredentialToken(id: string): Promise<string | null> {
  const [row] = await sql`
    SELECT pgp_sym_decrypt(encrypted_token::bytea, ${ENCRYPTION_KEY}) AS token
    FROM dns_provider_credentials WHERE id = ${id}
  `;
  return row?.token ?? null;
}
```

Tokens are:
- Encrypted at rest with `pgp_sym_encrypt`
- Never returned to the frontend (only decrypted server-side when calling Lexicon)
- Scoped to workspace (not user) so workspace admins can manage them
- Deletable by workspace admin

### Gap 10: SSL Provisioning Performance

**How we achieve < 5 minutes:**

| Step | Time | How |
|------|------|-----|
| User adds domain | 0s | Instant — creates DB row |
| DNS propagation | 0-300s | Depends on TTL; typically < 60s for Cloudflare, up to 300s for others |
| DNS verification | 10-30s | We poll every 10s; typically verified within 1-3 polls |
| Add to Caddy | < 1s | Caddy admin API call |
| ACME challenge | 5-15s | Caddy performs HTTP-01 challenge automatically |
| Cert issued | 5-10s | Let's Encrypt issues cert |
| **Total** | **~30s - 5min** | Bottleneck is DNS propagation, everything else is seconds |

**Optimization**: If user is on Tier 2 (Lexicon), we create the DNS records ourselves, which means propagation is near-instant for providers like Cloudflare (< 5 seconds TTL). Total time: **< 30 seconds**.

For Tier 3 (manual), the user controls propagation time. We show: "DNS can take up to 48 hours, but usually completes within a few minutes."

---

## 4. Environments

### 4.1 Test Environment
| Aspect | Description |
|--------|-------------|
| **Database** | Isolated test database |
| **URL** | Test-specific URL |
| **Data** | Test data only, never promoted to Live |
| **Access** | Full read-write for development |
| **Secrets** | Test-specific secret values |

### 4.2 Live Environment
| Aspect | Description |
|--------|-------------|
| **Database** | Production database |
| **URL** | Production URL (doable.app or custom domain) |
| **Data** | Production data, never overwritten by publishes |
| **Access** | Read-only for Doable agent |
| **Secrets** | Production-specific secret values |

### 4.3 What Gets Deployed
| Publish Action | What Happens |
|----------------|-------------|
| **Code changes** | Frontend build + edge functions pushed to target environment |
| **Database schema** | Migration scripts run against target database |
| **Non-code changes** | Secrets, storage buckets, settings deploy directly to Live **without requiring a code change** |
| **Data** | Never migrated between environments |

### 4.4 Non-Code Deployments
| Feature | Description |
|---------|-------------|
| **Secrets** | Update environment variables and deploy to Live without code commit |
| **Storage config** | Storage bucket changes deploy independently |
| **Settings** | Configuration changes deploy without triggering a build |
| **Immediate** | Non-code changes take effect immediately, no build pipeline needed |

### 4.5 Publishing Access Controls
| Feature | Description | Plan |
|---------|-------------|------|
| **Anyone can publish** | All editors and above can publish | Default |
| **Admin-only publishing** | Restrict external publishing to admins/owners only | Enterprise |
| **Workspace-only publishing** | Published app requires authentication; only workspace members can access | Business+ |
| **Publish approval** | Optional approval workflow before publishing to Live | Enterprise |

### 4.6 Pricing
- Free during beta period
- Will be part of standard plan pricing

---

## 5. Generated Assets

### 5.1 Auto-Generated on Publish
| Asset | Description |
|-------|-------------|
| **Favicon** | Generated from prompt or uploaded |
| **Open Graph image** | Auto-generated OG image for link previews |
| **Logo** | Generated on prompt |
| **Meta tags** | Title, description for SEO |
| **Sitemap** | Basic sitemap.xml |

### 5.2 Publish-Time Optimization
- Vite production build with tree-shaking
- CSS purging via Tailwind
- Asset minification
- Code splitting per route
- Image optimization

---

## 6. Code Export

### 6.1 Export Methods
| Method | Description |
|--------|-------------|
| **GitHub sync** | Code auto-pushed to connected repo; deploy from there |
| **Download ZIP** | One-click download of full project source |
| **CLI export** | Export via command-line tools |

### 6.2 Export Guarantees
- Full source code ownership
- No proprietary lock-in
- Standard React/TypeScript project
- Works with any Node.js hosting
- Database migrations included

---

## 7. Links & Redirects

### 7.1 Published App URLs
- Reliable link handling for deployed apps
- Better awareness of deployed app URLs
- Proper redirect chains
- Deep linking support

### 7.2 URL Structure
```
# Doable-hosted
https://my-app.doable.app/
https://my-app.doable.app/dashboard
https://my-app.doable.app/api/webhook

# Custom domain
https://myapp.com/
https://myapp.com/dashboard
```

---

## 8. Performance Targets

| Metric | Target |
|--------|--------|
| **Build time** | < 10 seconds (typical project) |
| **Deploy time** | < 60 seconds from click to live |
| **First Contentful Paint** | < 1.5 seconds |
| **Time to Interactive** | < 3 seconds |
| **Lighthouse Performance** | > 90 |
| **CDN cache hit ratio** | > 95% |
| **SSL provisioning** | < 5 minutes |
| **Icon loading** | Optimized bundle size reduction |
