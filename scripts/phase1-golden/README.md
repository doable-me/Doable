# Phase 1 Golden-File Harness

This directory contains the byte-identical-behavior diff harness that gates
Phase 1 PRs. Phase 1 introduces the framework-agnostic adapter contract and a
connector bridge — every PR in that series must demonstrate **zero externally
observable behavior change** for the existing `vite-react` path. This harness
is how we prove that mechanically.

## What this is

Three deterministic JSON artifacts captured against a fixture project:

| Artifact | What it asserts |
| --- | --- |
| `dev-spawn.argv.json` | The exact argv, env-key list, and cwd that `services/api/src/projects/dev-server-start.ts` passes to `child_process.spawn` when starting Vite. |
| `build-spawn.argv.json` | Same shape, but for the `npx vite build` spawn from `services/api/src/deploy/builder.ts`. |
| `scaffold.fileset.json` | The sorted list of `{relPath, sha256}` produced by `createProject(blankTemplate)` — i.e. every byte that lands on disk for a fresh blank project. |

The harness:

- **Captures KEY LIST ONLY** for spawn `env` (never values — they may contain secrets).
- **Redacts non-determinism** before serializing: env keys matching `^DOABLE_.*_ID$`, `^PORT$`, or `*_TOKEN` are dropped; 4-digit numbers in argv become `<PORT>`; UUID-shaped strings become `<PROJECT_ID>`.
- Sorts everything (env keys, fileset entries, JSON object keys) so re-runs against the same code produce byte-identical files.

If any of the three diffs against the Phase-0 baseline, the PR has changed observable behavior and must be either fixed or explicitly waived.

## How to capture a baseline

The capture script dynamically imports `.ts` modules from `services/api/src/`, so
**you must run it via `tsx`**, not bare `node`:

```bash
# From repo root.
DOABLE_FIXTURE_PROJECT_ID=<existing-project-uuid> \
  npx tsx scripts/phase1-golden/capture.mjs
```

Required inputs:

- `DOABLE_FIXTURE_PROJECT_ID` — UUID of a **pre-existing** project in the
  database. The dev-server and build captures both need a project that
  `createProject` has already scaffolded; the script will not invent test data.
- `DATABASE_URL` — auto-loaded from `.env` at repo root, or set explicitly.
  Required because `resolveProjectEnvVars` queries Postgres.

The scaffold capture uses its own throwaway UUID and cleans up after itself —
that artifact does **not** need a fixture project to exist.

Output goes to `scripts/phase1-golden/golden/<git-rev-parse-HEAD>/`. Each commit
gets its own subdirectory, so capturing on multiple branches/commits doesn't
overwrite the baseline.

> **Note.** If `DOABLE_FIXTURE_PROJECT_ID` is unset, the script still runs and
> writes the scaffold artifact, but `dev-spawn.argv.json` and
> `build-spawn.argv.json` will be empty arrays. That's intentionally tolerant —
> CI can capture scaffold without a live DB if needed.

## How to compare

```bash
node scripts/phase1-golden/compare.mjs \
  --golden    <commit-hash-of-baseline> \
  --candidate <commit-hash-of-PR>
```

Exit codes:

- `0` — all three artifacts deep-equal between the two captures.
- `1` — at least one artifact differs. The first 5 differences per artifact are
  printed in a unified-style format showing path, old value, new value.
- `2` — usage error or missing capture directory.

## Suggested PR workflow

1. **Before** the Phase 1 PR series begins, capture a baseline against the last
   Phase-0 commit (e.g. `cc83b81`):

   ```bash
   git checkout cc83b81
   DOABLE_FIXTURE_PROJECT_ID=… npx tsx scripts/phase1-golden/capture.mjs
   ```

2. **For each Phase 1 PR**, capture against the PR HEAD and compare:

   ```bash
   git checkout <pr-branch>
   DOABLE_FIXTURE_PROJECT_ID=… npx tsx scripts/phase1-golden/capture.mjs
   node scripts/phase1-golden/compare.mjs \
     --golden cc83b81 --candidate $(git rev-parse HEAD)
   ```

3. The PR must produce exit-code 0 OR document an explicit, reviewer-approved
   waiver listing every diff and why it's safe.

## Layout

```
scripts/phase1-golden/
├── README.md              ← you are here
├── capture.mjs            ← writes ./golden/<commit>/*.json
├── compare.mjs            ← diffs two ./golden/<commit>/ trees
├── fixtures/
│   └── blank-project.json ← templateId + frameworkId for the fixture
└── golden/
    └── <commit-hash>/
        ├── dev-spawn.argv.json
        ├── build-spawn.argv.json
        └── scaffold.fileset.json
```

## Implementation notes

- `capture.mjs` is plain Node ESM (`.mjs`). It uses `tsx` indirectly via
  `npx tsx` as the runner so dynamic imports of `services/api/src/**/*.ts`
  resolve without a build step.
- The spawn monkey-patch is installed by mutating `child_process.spawn`
  obtained via `createRequire`. For Node's built-in modules, the CJS exports
  object backs the ESM bindings, so subsequent ESM imports of `spawn` see the
  wrapped function.
- `scaffold.fileset.json` walks the project directory **excluding**
  `node_modules/`, `.git/`, and `dist/`. Hashes are SHA-256 of file contents.
- `compare.mjs` uses a hand-rolled deep walk rather than the `diff` npm
  package so the harness has zero runtime dependencies.

## Limitations / blockers

- **Fixture project required.** The dev-server and build captures fail to
  produce non-empty artifacts unless a project with id
  `DOABLE_FIXTURE_PROJECT_ID` already exists and has been scaffolded on
  disk. Create one through the normal app flow before running capture.
- **Build will actually run.** `runBuild` spawns a real `npx vite build`. On a
  fresh checkout this can take 30–90s and writes a `dist/` directory.
- **Dev server will actually start.** The capture starts Vite, waits up to 30s
  for ready, then sends `SIGTERM`. Make sure no other dev server is running for
  the same project, or you'll get a stale-server short-circuit instead of a
  fresh spawn.
