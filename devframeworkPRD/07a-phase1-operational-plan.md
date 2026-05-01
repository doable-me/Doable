# 07a — Phase 1 Operational Plan: First Four Surfaces

> Companion to `07-implementation-plan.md` (5-phase critical path) and Phase 0
> (now landed: snapshot, migration 060, frameworks/ package, vite-react
> adapter).
>
> **Date:** 2026-05-02. **Phase 0 baseline:** all of `services/api/src/frameworks/`
> + migration 060 applied to local dev DB.
>
> **Scope:** the operational instructions for landing the first 4 surfaces of
> Phase 1 (out of 13 total). Designed so each PR is small enough that "no
> regression" is verifiable by a golden-file diff harness, not by code review
> alone.

---

## 1. Order of operations (first four)

Picked by **independence** (parallelizable in worktrees) and **lowest blast
radius first**.

| PR | Surfaces (per `_discovery/01-vite-flow.md`) | File(s) edited | Parallelizable? |
|---|---|---|---|
| **PR-A** | Bootstrap registry + register vite-react adapter | `services/api/src/frameworks/adapters/index.ts` (1 line export edit), `services/api/src/index.ts` or new `frameworks/init.ts` (call from entry) | First; everyone else depends on this |
| **PR-B** | #5 + #6 + #7 (dev-server spawn + readiness signal) | `services/api/src/projects/dev-server-start.ts:102-184` | Yes — own file |
| **PR-C** | #14 + #15 (build command + outputDir) | `services/api/src/deploy/builder.ts:61,84` | Yes — own file |
| **PR-D** | #1 + #2 (required/critical files) | `services/api/src/projects/file-manager.ts:91,126` | Sequential after PR-A; same file as later PR-E (#3 install) |

PR-A is the load-bearing prerequisite — it makes `defaultRegistry.getAdapter("vite-react")`
return the extracted adapter. PR-B, PR-C, and PR-D depend on it but are
independent of each other.

**Why not include #3 (install) in PR-D?** Different test surface: requiredFiles
is a pure string compare; install is a child-process spawn. Splitting keeps
each PR's golden file small and independently verifiable. PR-E (#3 install)
ships next, sequentially after PR-D, in the same file.

---

## 2. Worktree strategy

Phase 1 edits live, load-bearing files. Naive parallelism = merge conflicts +
"who edited what" confusion. Worktrees give each agent an isolated copy of
the repo from the same snapshot.

### Setup (the team-lead runs these once)

```bash
cd /c/Users/gj/Documents/workspace/doable

# Branch off the snapshot for each parallel PR
git worktree add ../doable-pr-a   snapshot-pre-framework-agnostic-2026-05-02 -b phase1/pr-a-registry-bootstrap
git worktree add ../doable-pr-b   snapshot-pre-framework-agnostic-2026-05-02 -b phase1/pr-b-dev-server
git worktree add ../doable-pr-c   snapshot-pre-framework-agnostic-2026-05-02 -b phase1/pr-c-builder
git worktree add ../doable-pr-d   snapshot-pre-framework-agnostic-2026-05-02 -b phase1/pr-d-file-manager
```

Each worktree is a complete repo; the agent works in `../doable-pr-X`,
runs tsc + golden-file harness there, and reports back. Team-lead merges
PR-A first; the others rebase on top before merging.

### Cleanup after merge

```bash
git worktree remove ../doable-pr-X
git branch -d phase1/pr-X-...
```

The Agent tool's `isolation: "worktree"` flag does this automatically per
agent — use that instead of manual `git worktree add` when spawning. Manual
worktrees only needed if a human pair-programs alongside.

### Forbidden: parallel edits to the same file

PR-D (file-manager.ts #1+#2) and PR-E (file-manager.ts #3) MUST be
sequential. Same for any future split where two surfaces live in one file.
Worktrees don't fix this — they hide it. Track it in `TaskUpdate` `addBlockedBy`.

---

## 3. Golden-file diff harness

The single most important guard. Without it, "no regression" is wishful
thinking. With it, byte-identical behavior is testable.

### 3.1 What we capture (run ONCE on the snapshot, before any PR lands)

```bash
# scripts/phase1-golden/capture.mjs
# Captures golden behavior for vite-react projects pre-Phase-1.
```

Three artifacts per a known fixture project:

| Artifact | How captured | What it asserts |
|---|---|---|
| `dev-spawn.argv.json` | Patch `child_process.spawn` to dump `[command, args, opts.env]` for the dev-server spawn. Start the dev-server. Capture. Stop. | PR-B output must produce byte-identical argv + same env keys (PATH, FORCE_COLOR, BROWSER, NODE_ENV, vault keys). |
| `build-spawn.argv.json` | Same patch around builder.ts's spawn. Run a one-shot build. | PR-C output must produce byte-identical argv. |
| `scaffold.fileset.json` | Create a new project from the blank template; record the sorted list of relative paths + sha256 of contents. | PR-D and beyond must produce identical fileset. |

The capture script lives in `scripts/phase1-golden/` (new dir). It's a
small Node script — ~150 LOC total. Reuses the existing
`createProject` and `startDevServer` entry points to avoid drift.

### 3.2 What we compare (run on every PR before merge)

```bash
node scripts/phase1-golden/compare.mjs \
  --golden snapshot-pre-framework-agnostic-2026-05-02 \
  --candidate phase1/pr-b-dev-server
```

Output is a unified diff on the JSON artifacts. **Empty diff = pass.**

CI gate: a GitHub Action runs `compare.mjs` after `tsc --noEmit`. PR cannot
merge if the diff is non-empty unless the PR description includes
`golden-diff-acknowledged: <reason>` (escape hatch for legitimate behavior
changes, deliberately friction'd).

### 3.3 What's out of scope for the harness

- Visual fidelity of the rendered preview (tested manually).
- Timing (dev-server cold-start jitter is normal; harness ignores wall-time).
- Log line wording (handled by PRD 04 redaction; not covered here).
- HMR cycle behavior (different golden file, deferred to PR-F+).

### 3.4 The harness ships with PR-A

Bundled with the registry bootstrap so subsequent PRs have it from day one.

---

## 4. PR-A in detail (registry bootstrap)

The minimum change to make `defaultRegistry.getAdapter("vite-react")` return
something non-undefined. Three edits:

### 4.1 `services/api/src/frameworks/adapters/index.ts`

Replace the placeholder with:

```ts
export { viteReactAdapter, viteReactPack } from "./vite-react.js";
```

(types-builder left it as `export {};`; vite-extractor exported the constant
under `viteReactAdapter`. Confirm via `Read`.)

### 4.2 `services/api/src/frameworks/init.ts` (NEW file)

```ts
import { defaultRegistry } from "./registry.js";
import { viteReactAdapter, viteReactPack } from "./adapters/index.js";

let initialized = false;

export function initFrameworks(): void {
  if (initialized) return;
  defaultRegistry.register(viteReactPack, viteReactAdapter);
  initialized = true;
}
```

Idempotent. Safe to call from multiple boot paths (tsx watch, dist/index, tests).

### 4.3 Wire init from the API entry

`services/api/src/index.ts` (or wherever the Hono app boots) — add ONE line near
the top:

```ts
import { initFrameworks } from "./frameworks/init.js";
initFrameworks();
```

Place it before any code that might `defaultRegistry.getAdapter(...)`.

### 4.4 PR-A also delivers the golden harness

`scripts/phase1-golden/{capture.mjs, compare.mjs, fixtures/}` — no behavior
change to the application; harness only.

### 4.5 Validation gate for PR-A

- `tsc --noEmit` clean.
- Boot the API in dev mode (`pnpm dev:api`); no startup error.
- `scripts/phase1-golden/capture.mjs` runs end-to-end against the local DB
  (uses the migration we just applied). Produces three golden files.
- Re-run capture: results are byte-identical to the first run (idempotency
  smoke test for the harness itself).

---

## 5. PR-B in detail (dev-server-start.ts)

### 5.1 What changes

Three of the 24 surfaces in one file:
- #5: Vite entry resolution (`node_modules/vite/bin/vite.js`)
- #6: Vite CLI args (`--host --port --strictPort --base`)
- #7: Readiness signal (`Local:` / `ready in`)

### 5.2 Before

```ts
// dev-server-start.ts:102
const viteEntry = path.join(projectPath, "node_modules", "vite", "bin", "vite.js");
// ...
const child = await spawnJailedVite({
  execPath: process.execPath,
  args: [viteEntry, "--host", DEV_SERVER_HOST, "--port", String(port),
         "--strictPort", "--base", base],
  cwd: projectPath,
  env: { ...userEnvVars, FORCE_COLOR: "0", BROWSER: "none" },
  projectId,
});
// ...
// dev-server-start.ts:172,181 — manual stdout scanning for "Local:" / "ready in"
```

### 5.3 After

```ts
import { defaultRegistry } from "../frameworks/registry.js";
import { createDevContext } from "../frameworks/context.js";

const project = await projects.findById(projectId);
const adapter = defaultRegistry.getAdapter(project.framework_id);
const devCtx = createDevContext({
  projectId, projectPath, basePath: base, host: DEV_SERVER_HOST, port,
  env: userEnvVars, userId,
});
const spec = adapter.dev(devCtx);

const child = await spawnJailedVite({
  execPath: spec.command,
  args: spec.args,
  cwd: spec.cwd,
  env: spec.env,
  projectId,
});

// Readiness: spec.readinessSignal — handle the three kinds (log-substring,
// http-probe, custom). For vite-react it's log-substring(["Local:", "ready in"]).
await waitForReadiness(child, spec.readinessSignal, adapter.defaults.devReadinessTimeoutMs);

// Health URL: spec.healthUrl
await probeHealth(spec.healthUrl);
```

### 5.4 Helpers (NEW file)

`services/api/src/frameworks/spawn-helpers.ts` — `waitForReadiness(child, signal, timeoutMs)` and `probeHealth(url)`. These are framework-blind utilities. ~60 LOC total.

### 5.5 Hard rules for PR-B

- DO NOT delete the existing `STARTUP_TIMEOUT_MS` constant — keep as a backstop
  for adapters that don't supply `devReadinessTimeoutMs` (none today, but the
  fallback removes a footgun).
- DO NOT change `spawnJailedVite` itself — it still owns the dovault wiring.
  Adapter only supplies the spec; the spawner owns the jail.
- The `spawnJailedVite` function name stays for now (renaming to
  `spawnFrameworkProcess` is a follow-up PR — orthogonal to this refactor).
- Golden file: `dev-spawn.argv.json` MUST be byte-identical pre/post.

---

## 6. PR-C in detail (deploy/builder.ts)

### 6.1 What changes

- #14: outputDir hardcoded `path.join(projectDir, "dist")`
- #15: build args hardcoded `["vite","build","--outDir","dist","--base=..."]`

### 6.2 Before

```ts
// builder.ts:61
const outputDir = path.join(projectDir, "dist");
// builder.ts:84
const buildArgs = ["vite", "build", "--outDir", "dist",
                   ...(basePath !== "/" ? [`--base=${basePath}`] : [])];
```

### 6.3 After

```ts
import { defaultRegistry } from "../frameworks/registry.js";
import { createBuildContext } from "../frameworks/context.js";

const project = await projects.findById(projectId);
const adapter = defaultRegistry.getAdapter(project.framework_id);
const buildCtx = createBuildContext({
  projectId, projectPath: projectDir, basePath, target,
  env: userEnvVars, userId,
});
const spec = adapter.build(buildCtx);

const outputDir = path.join(projectDir, spec.outputDir);
// spawn `npx ${spec.args}` (or generalize to spec.command)
```

### 6.4 Hard rules

- The `npx` shell prefix stays for compatibility with the existing spawn shape
  — adapter.build returns `{ command: "npx", args: ["vite",...] }` for vite-react,
  so the migration is a pass-through. Future adapters whose `command !== "npx"`
  flow through the same shape; the spawn layer just passes through.
- Golden file: `build-spawn.argv.json` MUST be byte-identical pre/post.

---

## 7. PR-D in detail (file-manager.ts requiredFiles)

### 7.1 What changes

Two of the surfaces, both in one file:
- #1: `services/api/src/projects/file-manager.ts:91` — required-file check `["index.html","package.json"]`
- #2: `services/api/src/projects/file-manager.ts:126` — critical-file check, same list

### 7.2 Before

```ts
// file-manager.ts:91
if (!templateFiles["index.html"] || !templateFiles["package.json"]) {
  throw new Error("template missing required files");
}
```

### 7.3 After

```ts
import { defaultRegistry } from "../frameworks/registry.js";

const project = await projects.findById(projectId);
const adapter = defaultRegistry.getAdapter(project.framework_id);
for (const required of adapter.defaults.requiredFiles) {
  if (!templateFiles[required]) {
    throw new FrameworkAdapterError(
      "missing-required-files",
      `template missing required file: ${required}`
    );
  }
}
```

### 7.4 Hard rules

- DO NOT remove the post-disk validation at line 126 — keep it; just drive
  it off `adapter.defaults.criticalFiles`.
- Error message shape must stay parseable by the editor (frontend has copy
  that matches it). Confirm via grep before merging.
- Golden file: `scaffold.fileset.json` MUST be byte-identical pre/post.

---

## 8. CI gate per PR

Each PR runs in its worktree:

```bash
# 1. Type check
cd ../doable-pr-X/services/api && npx tsc --noEmit

# 2. Golden-file diff
cd ../doable-pr-X && node scripts/phase1-golden/compare.mjs --candidate $(git branch --show-current)

# 3. Smoke test: boot the API, hit the preview proxy for a fixture project, verify 200
cd ../doable-pr-X && pnpm dev:api &
PID=$!
sleep 10
curl -fsS http://127.0.0.1:4000/preview/$FIXTURE_PROJECT_ID/ > /dev/null
kill $PID

# All three pass = mergeable.
```

A GitHub Action codifies this. Add to `.github/workflows/phase1-gate.yml`
in PR-A.

---

## 9. Rollout sequencing for the four PRs

```
                    ┌────────────────┐
                    │  Phase 0 done  │  (snapshot + migration + frameworks/)
                    └───────┬────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │     PR-A       │   registry bootstrap + golden harness
                    │  (load-bearing)│
                    └───────┬────────┘
                            │ merge
                            ▼
        ┌──────────┬────────┴────────┬──────────┐
        ▼          ▼                 ▼          ▼
   ┌────────┐ ┌────────┐        ┌────────┐ ┌────────┐
   │  PR-B  │ │  PR-C  │        │  PR-D  │ │ (PR-E) │
   │  dev   │ │ build  │        │file-mgr│ │file-mgr│
   │ server │ │        │        │  req   │ │install │
   └───┬────┘ └───┬────┘        └───┬────┘ └────────┘
       │          │                 │
       │ each PR validates against golden harness from PR-A
       │          │                 │
       └──────────┼─────────────────┘
                  │ merge in any order
                  ▼
          ┌────────────────┐
          │ Phase 1 4/13   │   four surfaces abstracted; nine remain
          │   complete     │
          └────────────────┘
```

Estimated wall time, with one Opus agent per PR running in parallel:

- PR-A: ~10 min (1 agent: bootstrap + harness — harness is the bulk)
- PR-B + PR-C + PR-D in parallel after PR-A: ~10 min wall (3 agents)
- Total Phase 1 first wave: ~20 min

Then PRs E–M (the remaining 9 surfaces) ship in subsequent waves of 2–4 each.

---

## 10. What can go wrong (and the mitigation)

| Risk | Mitigation |
|---|---|
| `defaultRegistry.getAdapter()` throws because PR-A hasn't shipped to a code path | PR-A is strictly first; PR-B/C/D imports of `defaultRegistry` will TypeScript-fail if init isn't wired (init function's import side-effect is the seam) |
| Different argv across runs because of timestamp env vars | Golden-file capture redacts `DOABLE_*` env keys to fixed sentinels before serializing |
| Golden file too brittle (catches harmless reordering) | JSON object keys sorted; arrays preserved in declaration order (which IS load-bearing for argv) |
| Vite version bump changes "Local:" wording | Readiness signal is a multi-pattern set; add patterns when needed without breaking the seam |
| Merge conflicts between PR-D and PR-E | Sequential: PR-E rebases on PR-D before merging |
| One adapter call fails in a tight loop, blocking dev-server | `adapter` is fetched once per spawn, not per-line; failure mode is identical to today's "framework_id missing" → throws on boot, not at runtime |

---

## 11. Definition of done for Phase 1 (all 13 surfaces, not just first 4)

- `grep -rn "vite" services/api/src/ --include="*.ts" | grep -v frameworks/adapters/` returns ZERO matches outside the adapter file. (Existing 07's gate.)
- All golden-file diffs empty for vite-react fixtures.
- One full test cycle: scaffold a new vite-react project, run dev-server, edit a file (HMR), build, deploy. Identical user-visible behavior to snapshot.
- `tsc --noEmit` clean across the workspace.
- The 13 surfaces are the SAME set as `_discovery/01-vite-flow.md`; if a 14th emerges, treat it as a sign the adapter interface is incomplete and revise PRD 02 §4 before patching.

Phase 1 done = adapter is the only abstraction layer. Phase 2 (AI awareness)
can then build on it without fighting hardcoded assumptions.
