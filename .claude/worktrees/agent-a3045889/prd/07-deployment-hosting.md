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

### 3.2 Domain Configuration
- Add both `www.example.com` and `example.com`
- User selects their DNS provider (or Doable auto-detects from nameservers)
- Doable uses **Lexicon** to programmatically create/update CNAME or A records on the user's DNS provider
- SSL auto-provisioned after DNS verification
- No vendor lock-in to any single DNS provider

### 3.3 DNS Provider Support (via Lexicon)
| Provider | Status |
|----------|--------|
| Cloudflare | ✅ Supported |
| AWS Route 53 | ✅ Supported |
| GoDaddy | ✅ Supported |
| Namecheap | ✅ Supported |
| DigitalOcean | ✅ Supported |
| Google Cloud DNS | ✅ Supported |
| Gandi | ✅ Supported |
| Others (60+) | ✅ Via Lexicon plugins |

### 3.4 Domain Types
| Domain | Plan | Config Required |
|--------|------|-----------------|
| `[project].doable.app` | All plans | **None** — auto-provisioned |
| `[project].test.doable.app` | All plans | **None** — auto-provisioned |
| Custom domain | Pro+ | DNS setup via Lexicon |
| Unlimited doable.app subdomains | Pro+ | **None** — auto-provisioned |

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
| **Non-code changes** | Secrets, storage buckets, settings deploy directly to Live |
| **Data** | Never migrated between environments |

### 4.4 Pricing
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
