# 08-publish — Test Case Index

Tests for project publishing: subdomain allocation, build pipeline, custom domains, rollback, deployment history, Caddy/tunnel integration, and the dev-server preview proxy.

## Files

| File | Cases | Coverage |
|---|---|---|
| TC-PUBLISH-SUBDOMAIN.md | 40 | Subdomain auto-gen, prefix handling, status transitions, republish/unpublish, reserved-list, slug validation, collision, plan limits, ACL |
| TC-PUBLISH-DEPLOY.md | 45 | Deploy artifacts, build pipeline, build_stream SSE, sandboxing, framework support, atomicity, retention |
| TC-PUBLISH-CUSTOM-DOMAIN.md | 35 | CNAME provisioning, DNS verification, Cloudflare Custom Hostname API, SSL, validation, ACL |
| TC-PUBLISH-ROLLBACK.md | 30 | Rollback, deployment history, audit, atomicity during swap, retention edge cases |
| TC-PUBLISH-PREVIEW-PROXY.md | 35 | Preview proxy to Vite dev server, WS upgrade for HMR, auth, isolation, SSRF prevention |
| TC-PUBLISH-CADDY-TUNNEL.md | 25 | Caddy config writes, tunnel route updates, atomic config swap, security |
| TC-PUBLISH-LIFECYCLE.md | 25 | End-to-end publish journeys, plan changes, workspace transfer, CI publishing |

**Total: 235 cases**

## Endpoints Touched
- `POST /deploy`
- `DELETE /deploy/<id>`
- `POST /deploy/<id>/rollback`
- `GET /deployments?project_id=...`
- `GET /build-stream?deployment_id=...`
- `POST /domains`
- `GET /domains?project_id=...`
- `DELETE /domains/<id>`
- `/preview-proxy/<projectId>/*` (HTTP + WS)

## Key Tables
- `deployments` (id, project_id, subdomain, status, version, artifact_path, published_by, published_at, error_message)
- `custom_domains` (id, project_id, hostname, status, verification_token, cf_hostname_id)
- `preview_share_grants` (token, project_id, expires_at)

## Known Constraints
- All services bind 127.0.0.1 only (CLAUDE.md)
- Cloudflare-compatible naming: `<env>-<slug>.doable.me` (single-level under zone, dash separator) NOT `<slug>.<env>.doable.me`
- Subdomain prefix from `PUBLISH_SUBDOMAIN_PREFIX` env (empty = production apex)
- Artifact path: `/root/doable/sites/<sub>/live` (symlink) → `versions/<id>/`
