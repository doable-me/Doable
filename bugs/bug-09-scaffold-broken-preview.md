# Bug 9 — Fresh scaffolded projects ship with a broken preview

**Severity:** 🔴 Critical (first-impression killer for new projects)
**Area:** project template / scaffold
**Discovered:** 2026-04-08 test run
**Status:** Open, unconfirmed root cause

## Symptom

A brand-new project, created via `POST /projects`, opens into an editor where the preview iframe is broken — the thumbnail worker reports errors and skips capture.

Specifically observed in the audit log:

```
[Thumbnail] Preview has errors for db9a5d1c-8e67-...-eb72abcee2b8, skipping capture after 2 attempts
```

This was the state of the fresh scaffold *before* the first AI prompt was sent. After the AI wrote `src/App.tsx`:

```
[Thumbnail] Captured screenshot for db9a5d1c-...
```

The preview was only healthy *after* the AI touched something.

## Impact

A new user's first experience of opening a project is:

1. Create project → editor loads
2. Preview iframe shows a broken/error state
3. They haven't asked for anything yet, but the app looks broken to them
4. First impression: "this is broken, does it work?"

For a platform aimed at creators/designers/producers/CEOs (per `CLAUDE.md`), a broken-by-default first view is disproportionately damaging.

## Unknown: what specifically is broken

I didn't investigate the scaffold template source during the audit. Candidates to check:

- `services/api/src/project-scaffold/` or wherever the Vite + React template lives
- Does `package.json` have all deps installed in the initial scaffold? Is `node_modules` missing on first open?
- Does the template reference `@/lib/utils` or similar paths that need a `tsconfig.json` `paths` entry that might not be set up on first boot?
- Does `vite.config.ts` reference `.doable/vite-plugin-source-annotations.js` which may not exist until the project is fully initialized?
- Is there a race condition between scaffold setup and the thumbnail worker's first capture attempt?

The thumbnail worker reporting "errors" after 2 attempts suggests either a compile/runtime error in the initial template, or the dev server isn't ready yet and the worker timed out.

## Fix

Before more audit effort, the template itself needs investigation:

1. Create a fresh project and — before opening the editor — `cd` into `services/api/projects/<id>/` and run `pnpm install && pnpm dev`. Open the Vite dev URL directly and see what error shows.
2. Read the browser console on the preview iframe for the fresh scaffold and capture the actual error.
3. If it's a missing dep → scaffold creation needs to run the install.
4. If it's a runtime error in `App.tsx` / `main.tsx` → fix the template.
5. If it's a thumbnail worker timing issue → give the worker a longer grace period on fresh projects, or wait until the first successful HMR before the first capture attempt.

## Reproduction

Deterministic — reproduces on every new project:

```bash
TOKEN="<valid JWT>"
WORKSPACE_ID="<valid workspace id>"
curl -X POST http://127.0.0.1:4000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"scaffold-test\",\"workspaceId\":\"$WORKSPACE_ID\"}"

# then open the editor URL for the returned id and inspect the preview iframe
```

## Related

- [bug-10-react-fast-refresh-disabled.md](bug-10-react-fast-refresh-disabled.md) — the scaffold includes `.doable/vite-plugin-source-annotations.js`, which is the suspected cause of Fast Refresh being disabled. If the scaffold is shipping with a misconfigured visual-edit bridge, that could contribute to both bugs.
