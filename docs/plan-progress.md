# Plan progress and execution lifecycle

A plan tracks checked task results across chat turns. An active AI turn is a separate lifecycle. An approved plan must not display an endless build spinner just because some steps are still unconfirmed. A finished/interrupted turn also must not mark those steps complete.

## State contract

- Database plans/steps are authoritative; `.doable/plan.md` mirrors the latest snapshot for context. Every step has a stable ID, and each committed change advances the plan revision.
- `get_plan` supplies current IDs and results. Execution can report pending, in_progress, completed, skipped or failed through `mark_step_complete`; its omitted status retains the previous completed behavior. Planning does not expose progress mutation tools.
- Completion means the agent checked a result. Progress is the ratio of completed/skipped steps, not elapsed build time or a tool-call count. Skips remain distinguishable from completed results.
- `update_plan` changes order/scope without resetting surviving IDs/statuses. Repeated reports are idempotent; completed/skipped steps must be explicitly reopened to in_progress before changing a terminal result.
- Writers lock the parent plan and commit steps/status/revision atomically. Reports cannot update another project's plan or an unrelated step. HTTP reads/writes require project membership; viewers cannot approve/edit/abandon plans. Approval retries never reset progress.
- SSE updates carry whole persisted snapshots. Clients reject older revisions and snapshots for another project, and recover from the API on mount, focus, visibility/online changes and execution transitions; active runs also reconcile every eight seconds. Snapshot requests time out after ten seconds and retry transient failures with bounded backoff. Recovery never resubmits AI work.
- Without an active run, an unfinished plan displays paused/unconfirmed; failed steps need attention. Old plans with no recorded reports stay unconfirmed. No historical completion is guessed.

## Scenarios to verify

Initial approval and execution; work across multiple turns; finishing a later step first; reordering/renaming/adding/removing steps; failure and retry; repeated reports; competing writes; approval failure/retry; missed SSE/reload; stale revision; unrelated project; execution ending before all steps are checked.

Run the pure tests in `services/api/src/ai/plan-state.test.ts` and `apps/web/src/modules/editor/chat/plan/plan-state.test.ts`. `plan-store.integration.test.ts` requires a disposable PostgreSQL database and isolated project directory; never run it on the production database.

## Design references

- [Codex App Server](https://developers.openai.com/codex/app-server): turn lifecycle events are distinct from `turn/plan/updated`; pending/inProgress/completed plans can change during a turn.
- [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode) and [tools reference](https://code.claude.com/docs/en/tools-reference): persistent task lists and explicit TaskCreate/TaskUpdate, separate from background task processes.
- [OpenClaw agent loop](https://docs.openclaw.ai/concepts/agent-loop): stable run IDs and explicit lifecycle/settled state; a wait timeout does not imply cancellation.

These references support separating result state from execution state, with recovery from durable data. They do not guarantee that every provider or transport failure can never delay progress.

## Recovery contract (2026-10-01)

The current request lifecycle is separate from persisted plan steps. `report_task_status` reports structured `intent` (read_only/change) and `status` (in_progress/completed/waiting_for_input) in execution modes. These fields are protocol enums, never translated. They do not grant permissions or complete plan steps. Task reports are model assertions; plan acceptance still requires per-step evidence.

The API owns per-turn tool observations (call ID, cycle, arguments, result digest, status). SDK IDs deduplicate mirrored events; completed invocations must survive repeated calls with identical arguments. Recovery compares complete observations from each cycle, including changed read results. Tool names and successful file writes are not proof the whole request is complete. Legacy history with no result is unknown, not successful.

Recovery removes sentence/word-count intent heuristics. Unknown clients get one bounded status reconciliation; missing reports become a visible stalled outcome. Two unchanged cycles stop recovery, with an absolute six-cycle ceiling. A stalled/error/aborted/waiting outcome is preserved through final cleanup. Cancellation prevents another recovery round; disconnecting the browser still permits the existing background run.

No framework, dependency, database schema, or deployment topology change is needed. Existing JSON tool-call history accepts additional result fields. Rollback uses the previous API/Web images; old history remains readable. The tool is read-only metadata and remains available in execution tool manifests, including legacy allow lists. Model conformance and real-tool E2E must be checked before promotion; a passing deterministic replay alone does not qualify a release.

Validation: `pnpm tsx --test services/api/src/routes/chat/execution-state.test.ts services/api/src/routes/chat/stream-recovery.supabase-gate.test.ts`; UI regressions: `pnpm tsx --tsconfig apps/web/tsconfig.tests.json --test apps/web/src/modules/editor/localization-regressions.test.tsx`. Tests cover distinct/repeated/changed reads, failed writes, database tasks, both languages, negations, filenames, missing reports, provider errors and waiting states.


### SDK and stream ownership

SDK start/end events are the sole source of tool invocation records and cards, including external tool requests. Hook callbacks only handle supplementary plan, clarification, integration and artifact events. Hooks may omit arguments/IDs, so they must never create synthetic invocation rows. Cached sessions rebind their callbacks to the current HTTP stream before each turn, and post-tool callbacks are awaited before the SDK result consumes their artifact metadata.

`report_task_status` is hidden from operation cards while retaining its structured trace. History cards are projected from saved tool observations; old display-only success labels cannot turn missing evidence into success. The regression suite includes a real hook-plus-SDK replay with empty hook parameters and a cached-callback rebinding check.

### Refreshing reused session instructions

A cached session now fingerprints the effective system prompt (including current project context). An unchanged prompt only rebinds the current turn callbacks. A changed or previously unknown prompt resumes the same SDK session ID with the current system message, preserving history. Persisted sessions also receive the current system message through both engine and SDK resume configuration. If refreshing a cached session fails, the request fails rather than silently using stale instructions. Mode/provider/context eviction clears the fingerprint alongside the session mapping.

The targeted session, execution, ledger, final-response and parser regression run passes 39 tests. Session tests cover unchanged prompts, changed project files, language and protocol preservation, legacy cached sessions, resume failure, lost engine bindings, and project-scoped eviction. These unit tests do not assert that every provider honors resumed system messages; a real provider check remains a separate integration requirement.

### Provider timeout after progress

A provider timeout after successful tools used to fall between both recovery paths: empty-response retry excludes tool activity, while structured continuation excludes deferred errors. The terminal error was then omitted from the saved trace, so history could show only successful tool cards and no explanation of the unfinished task.

Timeout recovery now acknowledges SDK cancellation before a single resume, reuses the existing conversation and tool ledger, and excludes pending/unknown/failed tool results (except validated file requests rejected before side effects), user stops, input/integration gates, completed task reports and non-timeout provider errors. A repeated timeout is stopped, not replayed. The recovery prompt preserves original authorization and read-only intent. Failed cancellation never permits another send.

Final failure reasons are persisted with the trace. History projects the latest trace outcome for each assistant message in one project-scoped batch query; it does not rewrite assistant content or infer that successful tools mean task completion. Trace persistence precedes the stream's done signal. The editor renders an explicit failure notice alongside any partial response, including old failed traces with no recorded error text.

Regression coverage includes timeout-after-reads, bounded repeat failures, cancellation acknowledgement/rejection, stop-during-cancel, uncertain outcomes and input gates. A production-event-pipeline test feeds read results, a timeout, a resumed write, structured completion and a final answer through the same processor, verifying that the read is not replayed and the answer survives.

Long tasks also retain their streaming marker across refreshes: the five-minute orphan cleanup now checks the active request registry before expiring a record. Route-level tests cover active ten-minute tasks, stale orphan markers, recent markers, and a batched history response preserving both partial and empty failed messages.

### File arguments, dependency transactions and command execution

File creation/edit handlers validate a nonempty string path and string content before touching the database or filesystem. A rejected request returns stable `INVALID_FILE_ARGUMENTS` and `effects: "none"` metadata. Recovery recognizes only this structured result for the known file tools, including SDK result envelopes. Other failures remain uncertain and are never made retryable by matching translated error prose.

Dependency mutations are serialized per project inside the API process: SDK installation, generic installation, scaffolding and dependency repair share the same queue. Preview restart happens after releasing the lock so dependency checks cannot deadlock. A timed-out installation waits for process exit before releasing ownership. This is not a distributed lock across multiple API replicas. Tests include concurrent manifest updates and a real SDK tool-handler integration using a local fake package-manager process, without network downloads.

The AI command tool honors the explicit official Docker container-isolation configuration only when both the request hardening level and `DOABLE_HARDENING` equal `off`. It runs in the project directory with an allowlisted environment, bounded output and process-group timeout handling, and reports the selected backend. Missing/mixed/hardened configurations continue to require the sandbox; sandbox failure never triggers a fallback. Container mode does not isolate one project's filesystem from another and is suitable only for trusted internal use. No additional Linux capabilities or relaxed seccomp policy are introduced.

Injected classic preview scripts are parsed as JavaScript in a regression test; successful TypeScript compilation alone does not check the syntax inside template-string scripts.

Current runtime-compatible Linux validation passes 138 regression cases, one separate real SDK installation integration case, and 13 sandbox cases. An actual model turn generated a small 3D app, and the command tool subsequently completed its TypeScript/Vite production build through the explicit container backend. Historical failure UI and refreshed preview were checked in a browser. Existing full-tree type diagnostics remain outside this change. Long provider output truncation is not claimed to be fixed: the pinned SDK's OpenAI-compatible transport did not forward tested output-token overrides, and a large real generation still timed out. Smaller complete file operations succeeded. Automatic timeout recovery has failure-injection coverage; no claim is made that all upstream timeouts recover successfully.
