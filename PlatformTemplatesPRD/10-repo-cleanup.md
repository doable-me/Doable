# 10 — Public-release cleanup checklist

Must run before the first `v0.1.0` tag fires the publish workflow.
Anything that's still in the repo when the workflow runs will be baked
into the published images (api/ws/migrate do `COPY . .` in their build
stages), so this checklist is the gate between "internal dev cruft is OK"
and "anyone can pull our images".

## NEVER DELETE — ARCHIVE policy

**Rule:** every cleanup step that removes a file or directory from the
public repo MUST move it into `../doablechore/archive/` first, preserving
the original repo-relative path. NEVER `rm`, NEVER `git rm -r` against
content that hasn't been archived. Data is cheap; recovery of an
accidentally-deleted internal note can cost hours.

**Archive layout** (mirrors the repo's original paths so restoration is
a single `mv` from archive back into place):

```
doablechore/archive/
  setup-v2/                                 ← was doable/setup-v2/
  setup-v3/                                 ← was doable/setup-v3/
  sync-codehub.ps1                          ← was doable/sync-codehub.ps1
  do-commit.cmd                             ← was doable/do-commit.cmd
  dev.ps1                                   ← was doable/dev.ps1
  cleanup-temp.ps1                          ← was doable/cleanup-temp.ps1
  watchdog.sh                               ← was doable/watchdog.sh
  scripts/
    r10-*.ts r11-*.ts r12-*.ts r13-*.ts r17-*.ts  ← ralph round-specific tests
    phase1-golden/                          ← internal golden test corpus
    screenshots/                            ← internal QA screenshots
  testcases/
    99-runlog/                              ← internal dev journal (RUNLOG, FINDINGS, R*-STATUS)
    evidence/                               ← real API response captures (may contain test-user PII)
```

**Standard archive command:**

```bash
# from doable/ repo root:
mkdir -p ../doablechore/archive/<parent-dir-if-any>
mv <path-in-doable> ../doablechore/archive/<same-relative-path>
git add -A   # stages the deletes on the doable side
```

If `doablechore/` itself becomes worth versioning later, run
`git init` inside it; nothing about the archive layout assumes one way
or the other.

## A — `.dockerignore` tightening

The current `.dockerignore` is too permissive. Lines to ADD (audit-driven):

```
# Build artifacts that shouldn't ship
*.tsbuildinfo
*.log
*.bak
*.old
*.orig

# Internal planning + dev journals
prd.json
progress.txt
PlatformTemplatesPRD/                 # this PRD is operator-facing but only
                                      # at the repo level — no need inside the
                                      # api container
RUNLOG.md
FINDINGS.md
*-PRD/                                # any future internal PRD dirs

# Dev/QA scaffolding
testcases/
bugs/
deploy/                               # apparmor profiles — server-side, not image
.github/
.devcontainer/

# Dev scripts not needed at runtime
scripts/r*-*.ts                       # ralph round artifacts (r10-r17)
scripts/test-*.ts
scripts/smoke-*.sh
scripts/screenshots/
scripts/phase1-*/
scripts/mint-admin-token.ts           # dev-only auth bypass
scripts/seed-*.sh
scripts/cleanup-*.mjs
scripts/run-*.mjs
scripts/verify-*.ts

# Top-level dev utilities
CLAUDE.md                             # contains internal SSH instructions
do-commit.cmd
dev.ps1
cleanup-temp.ps1
test-publish.sh
watchdog.sh
sync-codehub.ps1                      # private Gitea push
clear-migrations.mjs
reset-db.mjs
check-migrations.mjs

# Platform manifests — useful in repo, not needed in image
.do/
railway.json
render.yaml
fly/
k8s/
app.json

# Setup variants (older versions retained in repo for reference)
setup-v2/
setup-v3/

# IDE / OS
.vscode/
.idea/
.DS_Store
Thumbs.db
```

After applying, validate the image is leaner:

```bash
# Build the api image locally with the new .dockerignore
docker compose -f docker/docker-compose.yml build api
docker run --rm --entrypoint sh ghcr.io/doable-me/doable-api:latest -c "du -sh /app /app/scripts /app/testcases 2>/dev/null"
# Expected: /app ~880MB; /app/scripts < 100KB; /app/testcases doesn't exist
```

## B — Repo file deletions (already done in R19 / this ralph round)

Already moved to `../doablechore/` (committed in this session):
- `SandboxAgnosticSandboxingPRD/`
- `devframeworkPRD/`
- `secureIntegrationsPRD/`
- `skillsPRD/`
- `servertodo/`

Still in repo for follow-up cleanup:
- [ ] `setup-v2/`, `setup-v3/` — keep `setup-server.sh` (the canonical
      one), move v2/v3 to doablechore as historical reference
- [ ] `scripts/r10-*`, `scripts/r11-*`, `scripts/r12-*`, `scripts/r13-*`,
      `scripts/r17-*` — ralph session debris; move to doablechore
- [ ] `scripts/phase1-golden/` — older test corpus
- [ ] `scripts/screenshots/` — internal screenshots
- [ ] `testcases/99-runlog/` — internal RUNLOG (dockerignored already,
      but should also leave the repo for hygiene)
- [ ] `testcases/evidence/` — real API response captures from dev
      environment; may contain test-user JWT fragments or PII

## C — Git remote audit

```bash
git remote -v
# Expected:
#   origin    https://github.com/doable-me/doable.git (fetch)
#   origin    https://github.com/doable-me/doable.git (push)
# Currently ALSO shows:
#   codehub   https://codehub.altrosyn.com:8443/doable-me/doable.git (fetch+push)

# Action: remove the private mirror remote so default `git push` doesn't
# accidentally publish to the private host.
git remote remove codehub

# If you want to keep the mirror, leave it but ensure no documentation
# references it as the canonical URL.
```

## D — Secret/PII scan

```bash
# JWT fragments (3-segment base64 starting with eyJ)
grep -rE 'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' \
  --include='*.md' --include='*.json' --include='*.yaml' --include='*.yml' \
  --include='*.ts' --include='*.tsx' --include='*.js' .

# Anthropic / OpenAI / common key prefixes
grep -rE 'sk-[a-zA-Z0-9_-]{20,}|sk-ant-[a-zA-Z0-9_-]{20,}|sk-cp-[a-zA-Z0-9_-]{20,}|sk-or-v1-[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{20,}' \
  --exclude-dir=node_modules --exclude-dir=.git .

# GitHub tokens
grep -rE 'gh[pousr]_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_-]{20,}' \
  --exclude-dir=node_modules --exclude-dir=.git .

# AWS keys
grep -rE 'AKIA[A-Z0-9]{16}' --exclude-dir=node_modules --exclude-dir=.git .

# Private SSH key headers
grep -rE 'BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY' \
  --exclude-dir=node_modules --exclude-dir=.git .

# Internal dev hostnames
grep -rE 'dodev\.fid\.pw|do\.fid\.pw|dev\.doable\.me|95\.216\.8\.180|codehub\.altrosyn\.com' \
  --exclude-dir=node_modules --exclude-dir=.git .
```

For each hit:
- **If real**: rotate the credential immediately (the commit is already
  in history; `git filter-repo` to scrub is destructive — usually easier
  to rotate the secret and add the matched pattern to `.gitleaks.toml`
  for future scans).
- **If example/placeholder**: change to obvious placeholder
  (`<your-api-key>`, `sk-...`, `example.com`).

## E — Source-code comment references

Source files in `packages/dovault/`, `packages/db/migrations/` reference
the moved PRD directories in docstring comments (e.g.
`See SandboxAgnosticSandboxingPRD/06-architecture-sandbox-agnostic.md`).

Two acceptable resolutions:

1. **Leave as-is** (recommended for v0.1.0): the references are
   historical breadcrumbs noting where a design came from. They don't
   break builds. Future contributors hitting Ctrl+Click on a broken
   ref can find the file in `doablechore/` if they have access; if not,
   the comment still documents the design intent.

2. **Update or strip**: time-consuming, no functional benefit. Defer.

Document this decision in the v0.1.0 release notes so future
contributors know the references are intentional, not stale TODOs.

## F — `.gitignore` audit

Ensure these are gitignored (NOT just dockerignored — they shouldn't
land in the public repo at all):

```
# Generated secrets / env
docker/.env
docker/.env.local
.env
.env.local
.env.*.local
.env.production.local

# Ralph state
prd.json
progress.txt
.omc/

# Test tokens
testcases/evidence/_tokens*.json

# Worker outputs
/tmp/doable-*.json
```

Then run `git check-ignore -v` on each path to confirm:

```bash
for p in docker/.env prd.json progress.txt .omc/state/team-state.json; do
  git check-ignore -v "$p" || echo "MISSING IGNORE: $p"
done
```

## G — Pre-tag ritual

Before pushing the first `v0.1.0` tag:

```bash
# 1. Cleanup done
git status -s   # should be clean (or only the .dockerignore/.gitignore updates)

# 2. Secrets scan passes (see Section D — must return zero hits or only
#    obvious placeholders)

# 3. Public README reviewed (no internal references)

# 4. Pre-build the image set locally as a smoke check
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
curl http://localhost/api/health    # expect 200

# 5. Tear down the local smoke
docker compose -f docker/docker-compose.yml down -v

# 6. Tag and push
git tag v0.1.0
git push origin v0.1.0

# 7. Watch the workflow
gh run watch

# 8. After workflow succeeds: make all 4 packages public on
#    ghcr.io/doable-me/doable-* (UI step, one-time)

# 9. Smoke-test the published image from a fresh VPS (the recipe in
#    docker/README.md "Fast Path")
```

## Acceptance criteria

- [ ] `.dockerignore` extended to cover all items in Section A
- [ ] Build the api image and confirm `du -sh /app/scripts` and
      `/app/testcases` are absent or <100KB
- [ ] Section C: `git remote -v` shows only `origin` (codehub removed)
- [ ] Section D: all 6 grep commands return zero hits OR only
      placeholder patterns
- [ ] Section F: `git check-ignore -v` passes for every listed path
- [ ] CLAUDE.md still useful for internal use but NOT shipped in image
      (.dockerignore covers it)
- [ ] No source file breaks from the dir moves (build still green:
      `pnpm -r exec tsc --noEmit`)
- [ ] PlatformTemplatesPRD/_INDEX.md links resolve (no 404s when
      browsed from the repo root)
