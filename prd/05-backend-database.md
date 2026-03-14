# 05 — Backend, Database & Cloud Infrastructure

## Overview

Doable provides a fully managed backend through **Doable Cloud**, powered by PostgreSQL (our own database) and the Copilot SDK for AI features. This replaces Lovable's Supabase dependency with our own infrastructure while maintaining the same developer experience.

**Key Difference from Lovable**: Instead of Supabase, Doable uses **plain PostgreSQL** for ALL platform data and the **Copilot SDK** for AI features. For user-built apps, the user connects their own backend (Supabase, D1, Firebase, etc.). Doable generates the integration code but does not host or manage user-app backends.

| Lovable (Supabase) | Doable (Our Stack) |
|--------------------|---------------------|
| Supabase Auth | Doable Auth (custom auth service on our PostgreSQL) |
| Supabase PostgreSQL | **Platform**: Plain PostgreSQL; **User apps**: User's choice (Supabase, D1, Neon, etc.) |
| Supabase Storage | **Platform**: Git (GitHub); **User apps**: User's choice (Supabase Storage, R2, S3, etc.) |
| Supabase Edge Functions | **User apps**: User's choice (Supabase Edge Fn, CF Workers, Vercel Fn, etc.) |
| Supabase Realtime | **User apps**: User's choice (Supabase Realtime, Pusher, Ably, etc.) |
| Supabase Client SDK | Doable SDK (generated TypeScript client for chosen backend) |

---

## 1. Doable Cloud

### 1.1 Overview
Doable Cloud is the primary full-stack hosting platform:
- Auto-scales edge functions
- Manages database, auth, storage, AI, and realtime
- Built-in logs and monitoring
- No infrastructure setup required
- Deploys to Test/Live environments

### 1.2 Architecture
```
┌─────────────────────────────────────────────────────┐
│                   Doable Cloud                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Platform Services (Our Infrastructure)       │   │
│  │                                               │   │
│  │  • Auth Service     • Workspace Management    │   │
│  │  • Billing/Credits  • Template Registry       │   │
│  │  • Analytics Engine • Build Service (Vite)    │   │
│  │  • AI Agent (Copilot SDK)                     │   │
│  │                                               │   │
│  │  ↕ Plain PostgreSQL (all platform data)       │   │
│  │  ↕ Redis (caching, sessions)                  │   │
│  │  ↕ GitHub (source control per project)        │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Client Site Publishing                       │   │
│  │  Cloudflare Pages (static SPA hosting only)   │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  User App Backend (user's choice, not ours)   │   │
│  │  Supabase | D1 | Firebase | Neon | etc.       │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Database (PostgreSQL)

### 2.1 Prompt-Driven Schema Generation
- User prompts: "Create a posts table with title, content, author, timestamps"
- Agent generates SQL migrations
- Agent creates the table schema and relationships
- Frontend components auto-wired to CRUD operations

### 2.2 Schema Management
| Feature | Description |
|---------|-------------|
| **Migration files** | SQL migrations in `doable/migrations/` |
| **Auto-generation** | AI creates schemas from natural language |
| **Review before apply** | User can review SQL before execution |
| **Rollback** | Migration rollback support |
| **Relationships** | Foreign keys, indexes, constraints |
| **Full SQL** | Complete PostgreSQL feature support |

### 2.3 Data Access
| Method | Description |
|--------|-------------|
| **REST API** | Auto-generated REST endpoints for CRUD |
| **GraphQL** | Optional GraphQL layer |
| **Doable SDK** | Generated TypeScript client library |
| **Direct SQL** | Edge functions can execute raw SQL |
| **React Hooks** | Auto-generated hooks for data fetching |

### 2.4 Row-Level Security (RLS)
- Automatically configured for generated tables
- Users see only their own data by default
- Role-based access policies
- Payment/subscription data secured
- Customizable via SQL policies

---

## 3. Edge Functions (Serverless)

### 3.1 Overview
Serverless JavaScript/TypeScript functions for user-app backend logic:
- API endpoints, webhooks, email sending, payment processing
- External API calls, data processing, scheduled tasks
- Created and deployed via chat prompts
- Deployed to user's chosen platform (Supabase Edge Functions, Cloudflare Workers, Vercel Functions, etc.)

### 3.2 Capabilities
| Feature | Description |
|---------|-------------|
| **Auto-generation** | "Process payments" → agent generates function |
| **Auto-deploy** | Deployed to Doable Cloud on creation |
| **Auto-cleanup** | Agent cleans up unused edge functions |
| **Auth testing** | Agent tests authenticated functions while user is logged in |
| **Logging** | Built-in logs for debugging executions and errors |
| **Agent reads logs** | AI automatically reads edge function logs for debugging |
| **Error reduction** | 91% error reduction through improved agent logic |
| **Secrets injection** | API keys injected securely (never in code) |
| **Auto-scaling** | Scales based on demand |
| **Cold start** | Depends on user's chosen hosting (Workers ~0ms, Supabase ~100ms, Lambda ~200ms) |

### 3.3 Common Edge Function Patterns
```
doable/
├── functions/
│   ├── stripe-webhook/
│   │   └── index.ts          # Payment webhook handler
│   ├── send-email/
│   │   └── index.ts          # Transactional email
│   ├── process-payment/
│   │   └── index.ts          # Checkout session creation
│   ├── ai-summary/
│   │   └── index.ts          # AI text summarization
│   ├── image-upload/
│   │   └── index.ts          # File processing
│   └── cron-cleanup/
│       └── index.ts          # Scheduled task
```

---

## 4. Object Storage

### 4.1 File Storage
| Feature | Description |
|---------|-------------|
| **S3-compatible** | Standard presigned URL upload/download |
| **Buckets** | Named storage containers (e.g., `avatars`, `uploads`) |
| **Auto-generated UI** | Agent creates upload/download components |
| **Access control** | Public or authenticated buckets |
| **CDN** | Files served via CDN for performance |

### 4.2 Common Storage Patterns
- Profile picture uploads → `public/avatar-images` bucket
- Document uploads → `private/documents` bucket
- Product images → `public/product-images` bucket
- User-generated content → `private/user-content` bucket

---

## 5. Realtime

### 5.1 WebSocket Service
| Feature | Description |
|---------|-------------|
| **Database changes** | Subscribe to table changes in real-time |
| **Presence** | Track online users |
| **Broadcast** | Send messages to connected clients |
| **Channels** | Topic-based subscription groups |
| **Auto-generated** | Agent creates realtime subscriptions from prompts |

### 5.2 Use Cases
- Live chat applications
- Collaborative editing
- Real-time dashboards
- Notification systems
- Live activity feeds

---

## 6. Secrets Management

### 6.1 Overview
| Feature | Description |
|---------|-------------|
| **Encrypted storage** | All secrets stored encrypted |
| **Auto-detection** | AI detects when API keys are needed, prompts user |
| **UI management** | "Add API Key" form in settings |
| **Injection** | Auto-injected into edge functions |
| **Never in code** | Secrets never appear in source code |
| **Non-code deploys** | Secret updates deploy without code changes |
| **Environment-scoped** | Different secrets for Test vs. Live |

### 6.2 Secret Types
- API keys (Stripe, OpenAI, SendGrid, etc.)
- OAuth client secrets
- Webhook signing secrets
- Database connection strings
- Custom environment variables

---

## 7. Environments (Beta)

### 7.1 Test Environment
| Feature | Description |
|---------|-------------|
| **Purpose** | Building and experimenting |
| **Database** | Isolated test database |
| **Data** | Test data stays in test |
| **Access** | Full read-write for builder |

### 7.2 Live Environment
| Feature | Description |
|---------|-------------|
| **Purpose** | Production serving real users |
| **Database** | Production database |
| **Data** | Never overwritten on publish |
| **Access** | Read-only for Doable agent |
| **Deploy** | Code + schema pushed on publish |

### 7.3 Environment Rules
- Test and Live have separate databases
- Code and database structure pushed to Live on publish
- Test data never bleeds to Live
- Live data never gets overwritten
- Non-code changes (secrets, buckets, settings) deploy directly to Live
- Free during beta period

---

## 8. Cloud Reliability

### 8.1 Targets
| Metric | Target |
|--------|--------|
| **Uptime** | 99.9% |
| **Edge function cold start** | < 200ms |
| **Database query latency** | < 50ms (simple queries) |
| **Storage upload** | < 2 seconds for < 5MB files |
| **Realtime latency** | < 100ms |

### 8.2 Monitoring
- Built-in error tracking
- Edge function execution logs
- Database query performance
- Storage usage metrics
- Realtime connection monitoring
