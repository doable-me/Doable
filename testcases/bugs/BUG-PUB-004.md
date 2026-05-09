# BUG-PUB-004 — Publish build fails: scaffold install skips devDependencies

## 2026-05-10 update — first fix attempt revealed deeper root cause

The first patch added `adapter.install(installCtx)` before build, gated by `node_modules/` missing. After deploy, retest shows the deeper root cause:

- `node_modules/` IS present after scaffolding (react, react-dom, scheduler, tailwind, etc.)
- But `node_modules/vite/`, `node_modules/@vitejs/plugin-react/`, `node_modules/typescript/` are **NOT** present.
- Reason: the scaffolding-time install runs with `--production` / `--omit=dev` (or `pnpm --prod`), so only `dependencies` get installed; `devDependencies` (vite, plugins, typescript) are skipped.
- The publish builder's check `if (!node_modules) install()` is too coarse: a partial `node_modules/` looks populated, install is skipped, build then fails.

Result: publish errors with `errorCode: build_failed_compile`, buildLog: `[UNRESOLVED_IMPORT] Could not resolve 'vite' in vite.config.ts`. Same end-user symptom as the original report; different root cause one layer up.

## Two-part fix needed
A. **Scaffolder install must include devDeps.** Drop any `--omit=dev`/`--production`/`NODE_ENV=production` from the scaffold path's install command. devDependencies must land in `node_modules/`.
B. **Publish builder install gate must verify the build tool is present**, not just `node_modules/` shape. Probe a per-framework "required build tool" path (e.g., `node_modules/vite/package.json`). If missing, install.

# (original report)

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
