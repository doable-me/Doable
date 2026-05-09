# BUG-PUB-004 — Publish build fails with vite UNRESOLVED_IMPORT for project 88279d57

**Severity:** Critical
**Env:** <env>, project `88279d57-29fa-42f0-bef9-3c5dcd8fde1d` (qa-owner workspace)
**Date:** 2026-05-10

## Repro
```
PID=88279d57-29fa-42f0-bef9-3c5dcd8fde1d
curl -X POST -H "Authorization: Bearer $OWNER" https://<env>-api.doable.me/deploy/$PID/publish
# → HTTP 500
# {"error":"Deployment failed","data":{"deploymentId":"9f7953d7-…","buildLog":"npm warn exec The following package was not found and will be installed: vite@8.0.11\nvite.config.ts (1:417) [UNRESOLVED_IMPORT] Warning: Could not resolve 'vite' in vite.config.ts …"}}
```

## Observations
- Publish runs `npx vite build` (or similar) without first running `npm install`/`pnpm install`, so `vite.config.ts` cannot resolve its own `import { defineConfig } from 'vite'`.
- Per TC-PUBLISH-DEPLOY-002 the pipeline is supposed to run `pnpm install` (cached) + `pnpm build`; on this server the install step is missing or the cache lookup is failing.
- The endpoint returns the build log synchronously in the error body — but TC-DEPLOY-LIFECYCLE-002/003 expect SSE events (`queued`, `building:step:install`, `failed`) on `/api/deploy/:id/stream`. Not enforced here.

## Impact
- Blocks the entire publish/marketplace/thumbnails/deploy chain on <env> against the only available real project.
- Cascading BLOCKED on TC-PUBLISH-SUBDOMAIN-*, TC-PUBLISH-LIFECYCLE-*, TC-DEPLOY-ARTIFACTS-*, TC-DEPLOY-ROLLBACK-*, TC-THUMB-GEN-*, TC-THUMB-QUEUE-*.

## Suggested fix
- Ensure `pnpm install --prefer-offline` (or `npm ci`) runs before `vite build` in the publish builder.
- Stream build progress via SSE per TC; return non-2xx only on terminal failure.
