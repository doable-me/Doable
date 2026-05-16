# 09 — Release pipeline: ghcr.io image publishing + versioning policy

The infrastructure that all per-platform templates depend on. Without
published images on `ghcr.io`, every per-platform deploy falls back to
source-builds and OOMs on the Next.js build on memory-constrained PaaS
plans.

## Deliverable

Already shipped: `.github/workflows/publish-docker-images.yml`. This doc
captures the rationale, triggers, and operational checklist.

## Workflow file: `.github/workflows/publish-docker-images.yml`

**Triggers:**
- `push` of a tag matching `v*.*.*` (e.g. `v0.1.0`, `v1.2.3-rc1`) →
  publishes images tagged with the version AND `:latest`
- `workflow_dispatch` (manual trigger from the GitHub Actions UI) →
  publishes `:latest` only (for off-cycle rebuilds when the source tree
  hasn't tagged but needs a fresh image)

**Permissions** (minimum):
```yaml
permissions:
  contents: read
  packages: write
```

The `packages: write` permission scopes the auto-generated
`GITHUB_TOKEN` to publish to ghcr.io for the owning org. No separate
`GHCR_TOKEN` secret is needed.

**Matrix:**
```yaml
strategy:
  fail-fast: false
  matrix:
    target: [api, ws, web, migrate]
```

Each job builds one of the four Dockerfile targets. fail-fast: false so
one bad target doesn't kill the others (operators get partial progress
even on bugs).

**Cache:**
Per-target buildx cache scopes (`type=gha,scope=${{ matrix.target }}`)
ensure repeated workflows reuse layers across runs. First run: ~10 min
total. Subsequent runs touching just `services/api/`: ~2 min for api,
~30s each for ws/web/migrate (most layers cached).

**Build args:**
Intentionally NOT passed `NEXT_PUBLIC_*` build args. The web image
keeps the `__DOABLE_API_URL__` / `__DOABLE_WS_URL__` / `__DOABLE_APP_URL__`
placeholders so the runtime entrypoint can rewrite them per-deployment.
See [00-baseline.md](00-baseline.md#next_public_-runtime-placeholder-mechanism).

## Versioning policy

**Format:** `vMAJOR.MINOR.PATCH` (semver). Pre-release tags
(`vMAJOR.MINOR.PATCH-rcN`, `-beta.N`, `-alpha.N`) are supported but
treated as the "latest" preview; they do NOT update the `:latest` tag.

**Rules:**
- **MAJOR**: breaking schema changes, breaking API contracts, breaking
  env var renames, breaking docker-compose template structure changes.
- **MINOR**: new features, new optional env vars (e.g. new AI provider
  passthrough), new platform templates.
- **PATCH**: bugfixes, security patches, doc-only changes.
- **`:latest`**: always = most recently published non-prerelease vX.Y.Z.
  Never built off `main` HEAD between releases.

**Cadence:** unscheduled — release when there's a reason to. Aim for
~biweekly during the open-source ramp-up; settle to monthly after.

**Tag command:**
```bash
git tag v0.1.0
git push origin v0.1.0
```

Within ~10 minutes, four images appear at `ghcr.io/doable-me/doable-*:v0.1.0`
and `:latest`.

**Pre-release command:**
```bash
git tag v0.2.0-rc1
git push origin v0.2.0-rc1
```

This publishes `:v0.2.0-rc1` but does NOT update `:latest`. Operators
opting into pre-release deploys explicitly pin
`DOABLE_IMAGE_TAG=v0.2.0-rc1` in their `.env`.

## Post-publish checklist

For the FIRST tag (`v0.1.0`):

1. **Verify all 4 images appear**: GitHub → Packages tab → confirm
   `doable-api`, `doable-ws`, `doable-web`, `doable-migrate` all show
   `0.1.0` and `latest` tags.
2. **Make packages public**: each package is private by default. Per
   package: Settings → Danger Zone → Change visibility → Public →
   confirm. Without this, anonymous `docker pull` fails with 401.
3. **Verify pull works**:
   ```bash
   docker pull ghcr.io/doable-me/doable-api:latest
   docker pull ghcr.io/doable-me/doable-ws:latest
   docker pull ghcr.io/doable-me/doable-web:latest
   docker pull ghcr.io/doable-me/doable-migrate:latest
   ```
   No auth required after step 2.
4. **Smoke-test the published image** end-to-end:
   ```bash
   mkdir doable-test && cd doable-test
   curl -O https://raw.githubusercontent.com/doable-me/doable/main/docker/docker-compose.prod.yml
   curl -O https://raw.githubusercontent.com/doable-me/doable/main/docker/setup.sh
   curl -O https://raw.githubusercontent.com/doable-me/doable/main/docker/init.sql
   curl -O https://raw.githubusercontent.com/doable-me/doable/main/docker/nginx.conf.template
   chmod +x setup.sh
   ./setup.sh --prebuilt
   # Expected: ~30s pull, ~1m container start + migration, then http://localhost reachable
   ```
5. **Update README badges**: README's "Deploy to X" buttons should point
   at the now-public ghcr.io images, not the source build path.

For subsequent tags: skip step 2 (visibility persists). Steps 1, 3, 4
should be automated as a follow-up `release-smoke.yml` workflow that
runs after `publish-docker-images.yml` succeeds.

## Per-platform release impact

Each per-platform template defaults to `:latest`:

```yaml
# docker-compose.prod.yml
image: ghcr.io/doable-me/doable-api:${DOABLE_IMAGE_TAG:-latest}

# .do/app.yaml
image:
  repository: doable-me/doable-api
  tag: latest        # operator overrides per-deployment

# fly/api.toml
[build]
  image = "ghcr.io/doable-me/doable-api:latest"

# k8s
spec.template.spec.containers[].image: ghcr.io/doable-me/doable-api:latest
```

For **production deployments**, pin to a specific version:

```bash
DOABLE_IMAGE_TAG=v0.1.0 docker compose -f docker/docker-compose.prod.yml up -d
```

This insulates production from "latest changes broke something"
incidents and gives a clean rollback path (`docker compose down &&
DOABLE_IMAGE_TAG=v0.1.0 docker compose up -d`).

## Image size baseline (snapshot)

After the first publish, expect:

| Image | Compressed | Uncompressed |
|---|---|---|
| `doable-api` | ~350 MB | ~880 MB |
| `doable-ws` | ~350 MB | ~880 MB |
| `doable-migrate` | ~350 MB | ~880 MB |
| `doable-web` | ~150 MB | ~440 MB |
| **Total to pull** | **~1.2 GB** | **~3 GB** |

Pull time at 100 Mbit/s: ~2-3 min for a fresh server. Subsequent pulls
of patch releases: ~30s-2min depending on layer churn.

Optimization opportunities (not in scope for v0.1.0):
- Use `--target` distroless base for api/ws/migrate (saves ~200 MB each)
- Pre-prune `node_modules` of dev-only deps in the build stage
- Use `multi-arch` builds with `--platform linux/amd64,linux/arm64`
  (defer until arm64 users ask)

## Acceptance criteria (release pipeline)

- [ ] Workflow file `.github/workflows/publish-docker-images.yml` exists
      and validates with `yamllint`
- [ ] Pushing `git tag v0.0.1` (test tag) fires the workflow
      successfully, producing 4 images at `ghcr.io/doable-me/doable-*:v0.0.1`
      and `:latest`
- [ ] Manual `workflow_dispatch` trigger produces images tagged `:latest`
      only (no version tag)
- [ ] After step 1 + making packages public, `docker pull
      ghcr.io/doable-me/doable-api:v0.0.1` succeeds anonymously
- [ ] `./docker/setup.sh --prebuilt` against the test tag completes in
      <2 minutes end-to-end on a 2-vCPU/4GB VPS
- [ ] All four per-platform templates that reference ghcr.io
      (`.do/app.yaml`, `railway.json`, `render.yaml`, fly tomls, k8s)
      successfully reference and pull the test-tag images
