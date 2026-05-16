# Platform Templates PRD

**Scope:** Define the canonical deployment templates Doable ships for each
supported platform. Full-stack only — Doable is an integrated platform
(api + ws + web + postgres) and the four services must co-deploy. Frontend-only
hosts (Vercel, Netlify, Cloudflare Pages) are explicitly NOT supported.

This PRD is the source of truth for what each platform template should contain,
what env vars it must surface, and how it integrates with the published
`ghcr.io/doable-me/doable-*` images. Each `<NN>-<platform>.md` doc below maps
to a single deliverable file under the platform's idiomatic path
(`.do/app.yaml`, `railway.json`, `fly.toml`, etc.) plus any companion docs
operators need.

## Table of contents

| # | Doc | Deliverable | Platform |
|---|-----|-------------|----------|
| 00 | [00-baseline.md](00-baseline.md) | (none — reference doc) | Shared env contract, image refs, NEXT_PUBLIC_* runtime placeholder mechanism |
| 01 | [01-coolify.md](01-coolify.md) | Coolify connect docs (uses existing `docker/docker-compose.prod.yml`) | Coolify self-hosted PaaS |
| 02 | [02-digitalocean.md](02-digitalocean.md) | `.do/app.yaml` (rewrite) | DigitalOcean App Platform |
| 03 | [03-railway.md](03-railway.md) | `railway.json` (rewrite) | Railway |
| 04 | [04-render.md](04-render.md) | `render.yaml` (rewrite) | Render |
| 05 | [05-fly.md](05-fly.md) | `fly/api.toml`, `fly/ws.toml`, `fly/web.toml` (new) | Fly.io |
| 06 | [06-kubernetes.md](06-kubernetes.md) | `k8s/base/*.yaml` + Kustomize overlays (new) | Kubernetes / kustomize |
| 07 | [07-app-json.md](07-app-json.md) | `app.json` (new) | Heroku-pattern 1-click deploy buttons |
| 08 | [08-codespaces.md](08-codespaces.md) | `.devcontainer/devcontainer.json` (new) | GitHub Codespaces / VS Code Dev Containers |
| 09 | [09-release-pipeline.md](09-release-pipeline.md) | `.github/workflows/publish-docker-images.yml` (already shipped) | ghcr.io image publishing |
| 10 | [10-repo-cleanup.md](10-repo-cleanup.md) | `.dockerignore` (tighten) + git remote audit | Public-release readiness |

## Platforms we explicitly DO NOT support

| Platform | Reason |
|---|---|
| **Vercel** | Frontend-only. Doable's web/api/ws are tightly coupled; splitting them across hosts adds latency, JWT routing complexity, and CORS/cookie domain pain for no operator benefit |
| **Netlify** | Same as Vercel — frontend-only |
| **Cloudflare Pages** | Same |
| **AWS Amplify (frontend-only mode)** | Same |
| **GitHub Pages** | Static only — Doable needs a runtime |
| **Surge / Firebase Hosting** | Static only |
| **Docker Swarm** | Niche; `docker-compose.prod.yml` works mostly as-is via `docker stack deploy` but we don't ship a tested template |
| **OpenShift** | Use the Kubernetes templates (06) — OpenShift accepts plain K8s manifests with minor tweaks operators can apply themselves |

If a user needs frontend-only hosting, the supported pattern is: deploy the full
stack to one of platforms 01-08 above; the web container then serves the
Next.js frontend, and CDN/edge caching is the platform's responsibility (or
front it with Cloudflare in front-mode).

## Implementation order

The 11 docs are independent at the documentation level — each describes one
deliverable. They share the env contract from [00-baseline.md](00-baseline.md);
write/update 00 first, then any per-platform doc can be implemented in any
order.

Suggested execution order matching real-world demand:
1. **00-baseline.md** — foundation (already exists in this PRD)
2. **01-coolify.md** — most common self-hosted PaaS for Doable's target
   (creators / small teams running their own infra)
3. **02-digitalocean.md** — most popular managed PaaS at this stage
4. **05-fly.md** — second-most-popular managed PaaS
5. **06-kubernetes.md** — enterprise users
6. **03-railway.md**, **04-render.md**, **07-app-json.md** — 1-click button
   ecosystem in one batch
7. **08-codespaces.md** — contributor onboarding (orthogonal to deployment)
8. **09-release-pipeline.md** — already shipped; doc captures rationale
9. **10-repo-cleanup.md** — must run before the first `v0.1.0` tag fires the
   publish workflow

## Cross-references

- The canonical env contract is in [00-baseline.md](00-baseline.md). Per-platform
  docs reference it instead of re-listing.
- The runtime-placeholder mechanism for `NEXT_PUBLIC_*` URLs (one image works
  for any deployment URL) is documented in [00-baseline.md](00-baseline.md)
  and implemented at `docker/web-runtime-entrypoint.sh`.
- The publish workflow itself lives at
  `.github/workflows/publish-docker-images.yml` and is documented in
  [09-release-pipeline.md](09-release-pipeline.md).
