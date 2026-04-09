# Bug 26 — AI gets stuck in a tool-retry infinite loop, never emits a terminal signal

**Severity:** 🟠 High — user sees "Building your app..." / "Still going…" forever with no actual progress; eats Copilot turns + CPU; the stream never closes so the user can't type another message without manually clicking Stop
**Area:** AI tool-orchestration loop inside the Copilot session; compounded by `chat.ts` not detecting per-file edit-retry thrash; the `edit_file` / `powershell` tools have no per-turn iteration cap
**Discovered:** 2026-04-09 during bug-24 end-to-end verification on project `cb78158a`
**Status:** Open — documented, not fixed
**Related:** bug-25 (env var leak) — the AI wrote the file being looped on (`find-supabase.cjs`) as part of that same exploit path; the loop is a separate orchestration-level bug that would exist even if the env leak were fixed

## Symptom

User prompts: `"a todo app with supabase persistence"` in a fresh build-mode project. After ~60 seconds the chat panel shows `"Let me set everything up — create the database table, then build the full app."` followed by a **forever-loading** indicator (`"Building your app..."` → `"This one's taking a while — still going…"`). Stop button is visible. Textarea is disabled. The dialog for Supabase provisioning never appears (it already ran and completed in an earlier sub-turn).

Inspecting the chat panel's full body text reveals the loop:

```
... Thinking... | Let me set everything up — create the database table, then build the full app.
... Creating test-env.ts | src/test-env.ts
... Updating App.tsx | src/App.tsx
... Reading vite-plugin-source-annotations.js | .doable/vite-plugin-source-annotations.js
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Updating find-supabase.cjs | find-supabase.cjs
... Thinking...
... Building your app...
... This one's taking a while — still going…
```

**Seven consecutive `edit_file` tool calls on the same file**, then the turn goes idle without ever writing user-facing code (`src/App.tsx` never got the todo-app implementation despite the AI's narrative promise).

## Likely cause

1. AI decides it needs to run a Node script to set up the database table. Writes `find-supabase.cjs` via `create_file` tool.
2. AI runs it via `powershell` tool (`node find-supabase.cjs`).
3. Script fails at runtime — probably because `require('pg')` isn't installed in the per-project sandbox, or because `process.env.DATABASE_URL` parsing didn't return what the AI expected, or because the Supabase REST endpoint returned an unexpected status.
4. The `powershell` tool surfaces the error output to the AI as a normal tool result (stdout/stderr text). There is **no** explicit "tool failed" structured signal — just text.
5. AI reads the error text, decides "the script has a bug, let me fix it", calls `edit_file` on the same file with a tweaked version.
6. `edit_file`'s `old_str → new_str` match succeeds (the AI picks something that matches), so the tool returns `{success: true}` even though the underlying problem is unsolvable (the sandbox doesn't have `pg`, no amount of script editing will help).
7. AI re-runs `node find-supabase.cjs` → same failure → GOTO 5.

The loop terminates only when one of:
- The Copilot SDK hits its own internal iteration cap
- `chat.ts`'s SDK-idle clean-completion bypass fires (120s of silence)
- User clicks Stop
- Engine gets recycled

None of these are "the AI recognizes the loop and tries a different approach". The AI has no memory-of-recent-attempts mechanism between tool calls — each `edit_file` call looks fresh.

## Impact

- User sees "Still going…" for minutes with no output. Eventually the clean-completion bypass fires and the stream closes silently with no new files written. User has to retry the prompt, which may hit the same loop.
- Burns real Copilot API turns (each `edit_file` + `powershell` is a turn). On metered plans this is actual money.
- Burns local CPU running node subprocess repeatedly.
- In this specific case the looped file (`find-supabase.cjs`) was the exfiltration script from bug-25. An attacker who pushed the AI into this kind of loop deliberately could fill disk, rack up bills, etc.

## Reproduction

1. Fresh project with Supabase connected at `scope=project` via the provision dialog (bug-23 flow).
2. Send: `"a todo app with supabase persistence"` in **build mode**.
3. Wait 2-3 minutes.
4. Observe the chat panel shows `Updating find-supabase.cjs` or similar `edit_file` spam; no user-facing file changes.

Confirmed reproducible in this session on project `cb78158a-9fd6-482c-ba46-bb03c42fae2d`. The AI wrote two separate exfil scripts (`find-supabase.cjs` and `setup-db.mjs`) and looped on edits to them instead of writing App.tsx.

## Proposed fixes

### Fix A — per-turn edit-retry cap (narrow, mechanical)

In `chat.ts`'s tool-progress tracker, count how many times `edit_file` fires for the **same file** within a single turn (reset on `assistant.turn_end`). If the count exceeds N (e.g. 4), abort the tool with a hard error:

```ts
// Rough pseudocode
const editCountsByFile = new Map<string, number>();
// in onToolEnd for edit_file / create_file:
const path = extractPath(args);
const n = (editCountsByFile.get(path) ?? 0) + 1;
editCountsByFile.set(path, n);
if (n > 4) {
  return {
    success: false,
    error: `Refusing repeated edits to ${path} — 4 attempts already failed in this turn. Try a different approach or ask the user for help.`,
  };
}
// reset on turn_end
```

The AI sees the `success: false` error and can either try a different file or give up with a user-facing message. Breaks the loop.

### Fix B — structured tool-failure signal (medium, correct)

Currently the `powershell` tool returns `{ stdout, stderr, exitCode }` and the AI has to infer "this failed" from the exit code + text. If `exitCode !== 0`, wrap the result so it includes a clear `"failed": true` structured field AND a hint like `"hint": "Do not try to fix this script by editing it. Either debug with smaller steps or ask the user."` AI models respond much more reliably to explicit failure signals than to inferred ones.

### Fix C — ban writing `.cjs` / `.mjs` scripts from the AI's file-creation tool (narrow, rule-based)

The AI wrote `find-supabase.cjs` at the project root — outside `src/` — specifically to run it as a Node script. A real user app almost never needs an AI-written standalone Node script at the project root. Whitelist file creation paths to `src/`, `public/`, `supabase/migrations/`, and a few known dirs. Script files outside `src/` require explicit user confirmation. This would have prevented the loop entirely because the script would never exist in the first place.

### Fix D — exit-criteria sniffer (wide, heuristic)

Extend `chat.ts`'s iterator loop to detect "rapid repeat tool calls on the same target" patterns and emit a status frame `{type: "status", data: {phase: "stuck", message: "AI seems stuck — try refining your prompt or hitting Stop"}}` so at least the user gets visibility into what's happening. Combine with Fix A for the hard stop.

## Recommended path

- **Ship Fix A** (per-turn edit-retry cap) as the quick safety net — small code change, clear invariant.
- **Ship Fix D** (status sniffer) for user visibility — no hard abort, just a hint.
- **Consider Fix B** as a follow-up when touching the `powershell` tool for bug-25's sandboxing work; wrapping the result with explicit failure signaling goes naturally there.
- **Defer Fix C** — it's the most behaviorally restrictive and needs careful design of the allowlist so it doesn't break legitimate `vite.config.ts` / `tsconfig.json` edits at the project root.

## Acceptance

1. Repeat the reproduction prompt on a fresh project with Supabase connected.
2. Observe the tool-call stream in the chat panel. `edit_file` on any single file does NOT exceed 4 calls within a turn.
3. If the AI would have looped under the old behavior, it now either writes a real `src/App.tsx` OR surfaces a user-facing error instead of silently spinning.
4. Stream closes within 2-3 minutes regardless of the AI's decision.

## Notes

This bug was discovered WHILE verifying the bug-24 root-cause fix. The plan-leak fix is separately verified working (zero `create_plan` calls, zero draft-plan rows written across two turns on project cb78158a). The loop observed here is a DIFFERENT bug in the AI's tool-orchestration loop, not a regression from bug-24. See `bugs/bug-24-plan-tool-leaks-across-mode-changes.md` for that fix.
