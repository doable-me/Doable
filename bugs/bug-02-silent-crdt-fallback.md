# Bug 2 — Silent CRDT fallback + no `/internal/yjs/write` success logging

**Severity:** 🟠 High (reliability / observability — hides future outages)
**Area:** `services/api/src/ai/yjs-bridge.ts`, `services/ws/src/index.ts`, `services/api/src/ai/project-files.ts`
**Discovered:** 2026-04-08 code reading during test
**Status:** Open

## Symptom

Three layers of silent failure make it impossible to know whether AI file writes are actually reaching the browser via the Yjs CRDT path, or silently falling back to disk-only writes that leave Monaco out of sync.

The 2026-04-08 test run was *fine* — the CRDT path worked (proven by the ws-mirror file materialization timing). The bug is that **if a future run weren't fine, nothing would log it**.

## The three layers

### Layer 1 — `yjs-bridge.ts` swallows all exceptions

`services/api/src/ai/yjs-bridge.ts` — all four bridge functions catch exceptions in an outer try/catch and return `{handled: false}` or nothing without logging. If the internal HTTP POST to `/internal/yjs/write` times out, throws, or returns an error status, the API never emits a log line.

### Layer 2 — `/internal/yjs/write` success path logs nothing

`services/ws/src/index.ts:96-158` — the handler for `/internal/yjs/write` only logs on error (line 154). Successful write/edit operations emit no log line.

This means:
- API side: no log (swallowed by layer 1)
- WS side: no log (only error path logs)
- Disk side: unchanged regardless (see layer 3)

The mechanism by which AI-written files become visible to the editor client has zero observability in its healthy path.

### Layer 3 — `writeProjectFile` writes disk first, Yjs as best-effort

`services/api/src/ai/project-files.ts:74-96` `writeProjectFile`:

```ts
// simplified
await writeFile(absPath, content);           // unconditional disk write
try {
  await writeFileThroughYjs(projectId, relPath, content);
} catch { /* swallowed */ }
```

If Yjs fails, the file still lands on disk, Vite HMR still fires, the preview iframe can still update — but Monaco's in-memory Yjs doc is now out of sync with disk. The next REST refetch will paper over it, but between now and then any user-typing in Monaco can conflict with the stale-doc state.

## The one externally visible signal

`services/api/src/ai/tools/edit-file.ts:69-94` `edit_file` tool:

- Tries `editFileThroughYjs` first.
- On success: returns `Edited <path>: replaced N occurrence(s) [via CRDT]`.
- On fallthrough: returns `Edited <path>: replaced N occurrence(s)` (no `[via CRDT]` suffix).

This `[via CRDT]` marker is the **only** externally visible difference between the CRDT path and the disk-fallback path. It lives in the tool's `output` string, which flows back to the SDK → SSE `tool_result` event → browser network tab.

Problems:
1. It's only present in `edit_file`. The `create_file` and `write_file` paths don't distinguish.
2. It's a natural-language marker inside a free-form output string — not structured, easy to parse inconsistently.
3. It's never logged on the server side (api-watcher confirmed via grep: `"via CRDT"` matches exactly one hit in the whole API codebase, the return string at `edit-file.ts:81`).

## Evidence this wasn't hit during the test

During the 2026-04-08 test:

- `src/App.tsx` was written at 23:25:28.147 IST (17:55:28 UTC) in `services/api/projects/db9a5d1c-7164-47df-8402-17910ffabe75/src/App.tsx`
- The **same file** materialized at 23:25:28.662 IST (17:55:28.662 UTC) in `services/ws/projects/db9a5d1c-7164-47df-8402-17910ffabe75/src/App.tsx`
- The `services/ws/projects/` directory contains **only** files that have been Yjs-synced through the `/internal/yjs/write` endpoint (no scaffold files present)
- Therefore the CRDT path worked during this test

But we got that answer by *comparing filesystem states*, not by reading any log line.

## Fix

### Minimum — one-line success log in WS

`services/ws/src/index.ts` `/internal/yjs/write` success path:

```ts
// in the success branch after a successful write/edit
console.log(
  `[ws] yjs:write ok projectId=${projectId} path=${filePath} op=${operation} bytes=${byteLen}`
);
```

This single line makes every AI file write visible in WS stdout and lets future debugging correlate API tool calls against actual Yjs propagation.

### Better — don't swallow in `yjs-bridge.ts`

All four bridge functions in `services/api/src/ai/yjs-bridge.ts` should at minimum emit a `console.warn` on catch before returning `{handled:false}`. Silent fallthrough is the enemy of SRE.

```ts
} catch (err) {
  console.warn(
    `[yjs-bridge] writeFileThroughYjs failed, falling back to disk-only`,
    { projectId, path: relPath, error: err instanceof Error ? err.message : String(err) }
  );
  return { handled: false };
}
```

### Better still — log the CRDT marker server-side in edit-file

In `services/api/src/ai/tools/edit-file.ts`, log the decision at the tool-execution level:

```ts
const viaCRDT = yjsResult.handled && yjsResult.success;
console.log(`[tools:edit_file] ${relPath} ${viaCRDT ? "via CRDT" : "disk-only"}`);
```

That way the choice of path is visible in the API log alongside every tool call.

## Prerequisite for future testing

Any test that claims to verify the CRDT path needs to either:
- Read the `[via CRDT]` marker from the SSE `tool_result.output` on the client side (fragile), or
- Read the `services/ws/projects/<id>/...` mirror directory and confirm file presence (what we did here), or
- Grep the WS stdout for the new success log line (after this fix lands)

## Related

- See [bug-03-ws-stdout-detached.md](bug-03-ws-stdout-detached.md) — on this dev box WS stdout isn't even captured, so even *with* the success log the operator couldn't see it until ws is relaunched inside tmux.
