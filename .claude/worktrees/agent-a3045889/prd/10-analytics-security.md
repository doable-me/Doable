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

## 6. Data Protection

### 6.1 Per-Plan Data Policies
| Feature | Plan |
|---------|------|
| **Data training opt-out** | Business+ |
| **Data protection agreements** | Enterprise |
| **GDPR compliance** | All plans (basic), Enterprise (advanced) |
| **SOC 2 compliance** | Enterprise |

### 6.2 Privacy Controls
- Project data isolated per workspace
- No cross-workspace data access
- User data deletion on account removal
- Export all data on request

---

## 7. Monitoring & Observability

### 7.1 Edge Function Monitoring
| Feature | Description |
|---------|-------------|
| **Execution logs** | Full request/response logging |
| **Error tracking** | Automatic error capture and reporting |
| **Performance** | Execution time, memory usage |
| **Agent access** | AI reads logs for debugging |

### 7.2 Application Monitoring
| Feature | Description |
|---------|-------------|
| **Build logs** | Vite build output |
| **Deploy logs** | Deployment status and errors |
| **Runtime errors** | Client-side error capture |
| **Health checks** | Uptime monitoring for published apps |
