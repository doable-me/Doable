# 10 — Analytics, Security & Monitoring

## Overview

Doable provides built-in analytics for published apps, security scanning for dependencies, and comprehensive secrets management — all accessible from the project settings.

---

## 1. Built-in Analytics

### 1.1 Analytics Dashboard
Accessible under **Project Settings → Analytics** for published projects:

| Metric | Description |
|--------|-------------|
| **Real-time visitors** | Live count of current users |
| **Total pageviews** | Total page loads |
| **Bounce rate** | Percentage of single-page visits |
| **Visit duration** | Average time spent on app |
| **Views per visit** | Depth of user engagement |
| **Traffic sources** | Where visitors come from (direct, referral, search) |
| **Device breakdowns** | Desktop vs. mobile vs. tablet |
| **Per-page performance** | Pageview stats per route |

### 1.2 Analytics Characteristics
| Feature | Description |
|---------|-------------|
| **Real-time** | Data updates in near real-time |
| **Built-in** | No external setup required |
| **Privacy-friendly** | Lightweight, no cookie consent needed |
| **Early-stage** | Suitable for MVPs; not a full Google Analytics replacement |
| **Trend spotting** | Identify usage patterns and popular pages |
| **Debug signal** | Use traffic patterns to spot issues |

### 1.3 External Analytics
- Integrate Google Analytics, Mixpanel, etc. via code or edge functions
- 14+ core connectors + 400 via n8n automation
- Custom event tracking via generated code

---

## 2. Security Scanning

### 2.1 Dependency Vulnerability Scanning
| Feature | Description |
|---------|-------------|
| **Automated** | Scans run automatically |
| **npm packages** | Checks all project dependencies |
| **Severity levels** | Critical, High, Medium, Low |
| **Findings report** | Detailed vulnerability descriptions |
| **Fix recommendations** | Suggested version updates |
| **Agent remediation** | AI can fix known vulnerabilities |

### 2.2 Security Center
| Feature | Description |
|---------|-------------|
| **Location** | Workspace-level admin dashboard |
| **Access** | Workspace admins only |
| **Scope** | Aggregated findings across all projects |
| **Actions** | Review, dismiss, fix vulnerabilities |
| **Notifications** | Alert on new critical findings |

### 2.3 Security Scanners (4 Types)
1. **Dependency scanner** — npm package vulnerability detection
2. **Secret scanner** — Detects hardcoded API keys in source code
3. **Configuration scanner** — Checks for insecure defaults
4. **Code pattern scanner** — Identifies common security anti-patterns

### 2.4 API Key Detection in Chat
- **Real-time warning** when user is about to paste API keys or secrets in chat
- Warns before accidentally sharing sensitive information
- Redirects user to the secure "Add API Key" form
- Prevents accidental key exposure in conversation history

### 2.5 AI-Powered Security Review
- Triggered before publishing via **publish modal**
- Scans for potential vulnerabilities across all code
- Identifies insecure patterns, exposed credentials, misconfigured RLS
- Actionable findings with one-click fixes

---

## 3. Secrets Management

### 3.1 Secret Storage
| Feature | Description |
|---------|-------------|
| **Encrypted** | All secrets encrypted at rest and in transit |
| **Scoped** | Different values for Test vs. Live environments |
| **UI management** | Add/edit/delete via Project Settings |
| **Auto-detection** | Agent detects when secrets are needed |
| **Secure input** | Dedicated "Add API Key" form (never paste in chat) |
| **Non-code deploys** | Secret updates deploy without code commits |

### 3.2 Secret Injection
| Feature | Description |
|---------|-------------|
| **Runtime injection** | Secrets injected into edge functions at execution |
| **Never in code** | Secrets never appear in source files |
| **Never in git** | `.env.local` excluded from version control |
| **Agent awareness** | AI prevents accidental exposure in chat |
| **Auto-secure** | Prevents users from hardcoding keys |

### 3.3 Common Secrets
| Secret | Purpose |
|--------|---------|
| `STRIPE_SECRET_KEY` | Payment processing |
| `OPENAI_API_KEY` | AI features |
| `SENDGRID_API_KEY` | Email sending |
| `SHOPIFY_ACCESS_TOKEN` | E-commerce |
| Custom API keys | Third-party integrations |

---

## 4. API Key Protection

### 4.1 Auto-Detection
- Agent monitors chat for accidentally pasted API keys
- Prevents hardcoding secrets in source code
- Redirects to secure secret storage
- Warning notifications for exposed credentials

### 4.2 Best Practices Enforcement
- Client-side code never contains secrets
- All sensitive API calls go through edge functions
- Environment variable patterns enforced
- `.gitignore` auto-includes `.env.local`

---

## 5. Account Security

### 5.1 Two-Factor Authentication
| Feature | Description |
|---------|-------------|
| **Banner** | Encourages email+password users to enable 2FA |
| **TOTP** | Time-based one-time password (authenticator app) |
| **Recovery** | Backup recovery codes |
| **Required** | Optional per workspace (Enterprise can enforce) |

### 5.2 Payment Issue Surfacing
- Failed or overdue payments visible inside the app
- Easier to spot and resolve billing issues
- Prevents unexpected service interruptions

### 5.3 Credit Expiry Reminders
- Reminders when rollover credits are about to expire
- Helps avoid losing unused credits
- Notification in-app and via email

---

## 6. Workspace Audit Logs (Enterprise)

### 6.1 Overview
Searchable history of all workspace activity, providing full visibility into who did what and when.

### 6.2 Audited Events
| Category | Events Tracked |
|----------|---------------|
| **Membership** | Member added, removed, role changed, invitation sent/revoked |
| **Project activity** | Project created, deleted, transferred, visibility changed, published |
| **Authentication** | Login, logout, SSO sign-in, failed attempts, 2FA events |
| **Settings** | Workspace settings changed, connectors configured, billing changes |
| **Security** | Security scan results, vulnerability dismissed, secrets added/removed |

### 6.3 Features
| Feature | Description |
|---------|-------------|
| **Search** | Full-text search across audit entries |
| **Filter** | Filter by user, event type, date range |
| **Export** | Export logs as CSV/JSON for compliance |
| **Retention** | Configurable retention period (default: 1 year) |
| **Real-time** | New events appear immediately |
| **API access** | Programmatic access to audit logs via API |

---

## 7. Per-Project Cloud Usage

### 7.1 Usage Breakdown
| Feature | Description |
|---------|-------------|
| **Per-project metrics** | Shows percentage distribution of resource consumption by project |
| **Resource types** | Database, storage, edge function executions, bandwidth |
| **Visualization** | Charts showing usage trends per project |
| **Cost attribution** | Understand which projects drive cloud costs |
| **Admin access** | Available to workspace admins in Settings → Billing → Usage |

---

## 8. Data Protection

### 8.1 Per-Plan Data Policies
| Feature | Plan |
|---------|------|
| **Data training opt-out** | Business+ |
| **Data protection agreements** | Enterprise |
| **GDPR compliance** | All plans (basic), Enterprise (advanced) |
| **SOC 2 compliance** | Enterprise |

### 8.2 Privacy Controls
- Project data isolated per workspace
- No cross-workspace data access
- User data deletion on account removal
- Export all data on request

---

## 9. Platform Tenant Isolation (PRD 17)

> **Full specification**: See [PRD 17 — Multi-User Infrastructure](17-multi-user-infrastructure.md) for complete details.

### 9.1 Workspace Authorization

Every API route that accesses a workspace-scoped resource MUST verify the authenticated user is a member of the owning workspace. This is enforced via a dedicated **workspace authorization middleware** that runs after JWT auth and before the route handler.

| Layer | Responsibility |
|-------|----------------|
| **Auth Middleware** | Verifies JWT, extracts `userId` |
| **Workspace Auth Middleware** | Verifies `userId` membership in the workspace that owns the resource. Returns 403 if not. |
| **Role Check** | Verifies user's role meets minimum required for the operation |
| **DB Query Filtering** | All queries include `workspace_id` as defense-in-depth |

### 9.2 Database-Level Security

| Strategy | Phase | Description |
|----------|-------|-------------|
| **Query-level filtering** | Phase 0 | All `findById()` queries accept and filter by `workspaceId` |
| **PostgreSQL Row-Level Security** | Phase 2 | RLS policies on all tenant-scoped tables |
| **Connection-level context** | Phase 3 | `SET LOCAL app.current_workspace_id` per request |

### 9.3 Security Invariants

These MUST be true at all times, regardless of development phase:

1. **No cross-workspace data access** — user cannot read, write, or infer resources in a workspace they don't belong to
2. **No AI session bleed** — user's AI history and tool state never visible to another user
3. **No credit theft** — user cannot consume credits from another workspace
4. **No preview hijacking** — user cannot view another workspace's dev server preview
5. **No deploy interference** — user cannot trigger or modify another workspace's deployment
6. **Graceful degradation** — resource limits result in queuing or rejection, never crashes or corruption
7. **Audit trail** — every cross-boundary access attempt (success or failure) is logged

### 9.4 Per-User Rate Limiting

Rate limits keyed by `userId` (not IP address) to prevent per-user abuse and avoid penalizing shared networks. See [PRD 17 Section 7](17-multi-user-infrastructure.md#7-rate-limiting) for complete specification.

---

## 9. Monitoring & Observability

### 9.1 Edge Function Monitoring
| Feature | Description |
|---------|-------------|
| **Execution logs** | Full request/response logging |
| **Error tracking** | Automatic error capture and reporting |
| **Performance** | Execution time, memory usage |
| **Agent access** | AI reads logs for debugging |

### 9.2 Application Monitoring
| Feature | Description |
|---------|-------------|
| **Build logs** | Vite build output |
| **Deploy logs** | Deployment status and errors |
| **Runtime errors** | Client-side error capture |
| **Health checks** | Uptime monitoring for published apps |
