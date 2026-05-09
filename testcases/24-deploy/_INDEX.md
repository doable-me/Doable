# 24-deploy — Test Case Index

Deployment lifecycle, build SSE, rollback, artifact retention.

| File | Focus | Cases |
|---|---|---|
| TC-DEPLOY-LIFECYCLE.md | publish flow, SSE stream, errors, queueing | 42 |
| TC-DEPLOY-ROLLBACK.md | rollback to N-1/N-2, atomicity | 25 |
| TC-DEPLOY-ARTIFACTS.md | deployment_artifacts table + on-disk storage | 25 |

Cross-cutting:
- All deploy events SSE; client must auth via session.
- deployments/deployment_artifacts maintain integrity (sha256, atomic swap).
- Caddy + cloudflared reload coordinated; published subdomains follow `<env>-<slug>.doable.me`.
- Build sandbox uses DOVAULT_BACKEND with restricted FS access.
