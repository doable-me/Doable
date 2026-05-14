# R11 PDF Integration — Root Cause Investigation (read-only)

Branch: chore/qa-r10-evidence @ HEAD c27a7d1
Evidence: testcases/evidence/dev/ai-pdf-r11/
Probe: scripts/r11-pdf-attach-test.ts → dev-api.doable.me, MiniMax-M2.7-highspeed, 45.8s, 129 SSE events

The pdf-parse fix (8f20970) is in HEAD and IS working — the trace shows
prompt_tokens=128595 (the 50 000-char SRS body was inlined) and the
model's own thinking proves it received the PDF text ("seems to be a
Software Requirements Specification (SRS) example document"). The bug is
NOT in PDF extraction. There are THREE independent defects on top of a
working extractor.

────────────────────────────────────────────────────────────────────────
ROOT CAUSE #1  — AI ignores the build instruction (the actual user bug)
────────────────────────────────────────────────────────────────────────

What the user sees: a generic "Dream it. Build it." Doable splash page
that has nothing to do with the SRS, even though the model thought hard
and ran 10 tool calls.

What actually happened (from 03-sse-events.json + 06-src_App.tsx):

  • The generated App.tsx (2 556 chars) is BYTE-IDENTICAL to the blank
    template at services/api/src/templates/definitions/blank.ts lines
    226-305 (phrase rotator, DoableLogo, pulse dots). The AI did NOT
    write App.tsx at all — that text is the scaffold that
    scaffoldAndStartDev() laid down before the LLM was even contacted.

  • The model's leaked thinking explicitly says:
      "this is the default Doable template app. The user has a tagged
       PDF file [...] They haven't explicitly told me what to do with
       it yet."
      "the user just sent a message with no explicit task. The tagged
       file is just context. Let me respond and ask what they'd like
       to do."

  • The 10 tool calls were all read/exploration (list_files, view,
    glob, read_file, plus a bash `pdftotext` that failed) — zero
    create_file / edit_file calls. Stream ended with the model emitting
    a "what would you like to do?" question.

Why the model thinks there is "no explicit task" even though the
user's prompt was "Read the attached SRS PDF... build a React app
whose title is the system name…" :

  processAttachments() at services/api/src/ai/attachments.ts:355
  builds the augmented prompt as:

      augmentedPrompt = userPrompt + fileSections.join("") + notes;

  ⇒ Format:

      <USER PROMPT 392 chars>
      \n\n--- Attached file: srs_example_2010_group2.pdf ---
      <PDF TEXT — truncated at MAX_TEXT_CHARS=50 000>
      \n--- End of srs_example_2010_group2.pdf ---

  This SHOULD work. But the user prompt (392 chars) is then sandwiched
  between Doable's system prompt (the giant agent prompt at
  services/api/src/routes/chat/system-prompts.ts lines 88-364, ~12 000
  chars) and a 50 000-char PDF body. With MiniMax-M2.7-highspeed running
  prompt_tokens=128 595, the model is heavily attending to the front
  (system prompt) and the LARGE attached doc block, and is treating the
  short user-supplied sentence as a one-line "[Attachment: …]" tag.

  Three specific contributors:

  1. The attachment marker (`--- Attached file: <name> ---`) is too
     thin compared to docs/system-message framing. The model
     literally calls it a "tagged PDF" in its thinking — it has
     mis-classified the body as metadata, not user instruction.

  2. The user prompt comes FIRST, then 50 000 chars of PDF.
     With long-context models, the directive at position 0 gets
     drowned by the body. There is no echo/repeat of the directive
     AFTER the doc body.

  3. The system prompt at system-prompts.ts:88-364 has zero guidance
     on how to handle attached requirement docs. It tells the AI
     never to "explain your reasoning" but says nothing about
     "ALWAYS treat attached requirement/spec PDFs as the build
     brief and proceed". The MCP-presentations + Supabase paths got
     dedicated multi-paragraph instructions; the PDF-spec path got
     none.

  4. Side bug — `attachments.ts:298-299` (PDF fallback branch):
     when pdf-parse yields empty text, the file path is forwarded as
     a `fileAttachments[]` entry. The Copilot SDK does NOT
     server-side-extract PDFs, so this fallback delivers a binary
     the model cannot read. (Not triggered for the SRS sample, but
     poses the same R10/R11 regression for image-only / scanned PDFs.)

────────────────────────────────────────────────────────────────────────
ROOT CAUSE #2  — session_id is "" in chat_traces
────────────────────────────────────────────────────────────────────────

Trace row shows `session_id: ""` (empty string, not NULL).

Smoking gun — services/api/src/routes/chat/post-processing.ts:

    Line 191:   state.traceCollector.setSessionId("");
    Line 203:   state.traceCollector.setSessionId("");

Both call sites are inside handleFinalCleanup(), called every turn.

trace-factory.ts:353 defines setSessionId as:
    function setSessionId(id: string): void { ctx.sessionId = id; }

The persist functions in trace-infra.ts then write `ctx.sessionId ?? null`
to chat_traces.session_id. An empty string is NOT null-coalesced (the
`??` only catches null/undefined), so `""` lands in the DB column.

This looks like the leftover of a half-finished change that meant to
WRITE the session id but instead clears it. There is no obvious reason
to deliberately wipe the SDK session id at turn end — recreate/resume
all use the DB row `ai_sessions.copilot_session_id`, not the trace
column. The trace's `session_id` field is purely observability.

Impact: every chat_traces row has session_id="" instead of the real
SDK session UUID. /traces endpoints that filter by session_id silently
return no rows; admin UI can't link a trace to its SDK session for
debugging.

────────────────────────────────────────────────────────────────────────
ROOT CAUSE #3  — chat/history returns [] even though messages exist
────────────────────────────────────────────────────────────────────────

04-chat-history.json captures the API response right after [DONE]:
    {"data":[],"hasMore":false}

But:
  • The trace shows version_created with
    messageId="33e64d35-c6f2-4b3f-9895-24a7cbfb54de" — proof an
    ai_messages row was pre-inserted (services/api/src/routes/chat/
    message-persistence.ts:55-72 / send-handler.ts:515).
  • saveUserMessage() also ran for the user message before streaming
    (send-handler.ts:510).
  • finalSaveAssistantMessage() runs BEFORE the [DONE] sentinel is
    sent (post-processing.ts:155-214). So when the test fires the
    history GET after [DONE], rows MUST exist.

The query at misc-routes.ts:186 is:
    SELECT id FROM ai_sessions
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC LIMIT 1

If `dbSession` is missing it returns `{data: [], hasMore: false}` —
exactly what we observe. So persistSessionToDb() returned undefined
for this turn. Two failure modes converge here:

  A. `persistSessionToDb` (services/api/src/routes/chat/session-manager.ts:164-193)
     swallows any SQL error with a `try / catch / return undefined`.
     When the catch fires, `dbSessionId` is undefined for the rest of
     the turn (send-handler.ts:506-515), so:
       • saveUserMessage is GATED on `if (dbSessionId)` → SKIPPED
       • preInsertAssistantMessage is GATED on `if (dbSessionId)` → SKIPPED
       • state.assistantMessageId stays undefined
       • finalSaveAssistantMessage early-returns on `!assistantMessageId`
     The turn still runs (because `sessionId` resolves from
     projectSessions cache or via createSession), the SSE stream still
     works, the trace still records, but ai_sessions and ai_messages
     end up EMPTY for the entire project. The history endpoint then
     correctly returns [].

  B. Even when `persistSessionToDb` succeeds in INSERTing the
     ai_sessions row, the workspace_id is NEVER set. Look at the
     INSERT at session-manager.ts:184:
         INSERT INTO ai_sessions (project_id, user_id, mode, copilot_session_id)
     No `workspace_id` column. If migration 072 or later enforces RLS
     on ai_sessions / ai_messages keyed on workspace, the GET
     /chat/history query (running under the *authenticated* user's
     RLS context via authMiddleware in routes/chat/index.ts:26-28)
     will see zero rows. (Need to confirm migration set on dev.)

The evidence (`session_id: ""` in trace + empty history + a successful
SSE stream that nonetheless produced a `version_created` event) is most
consistent with mode A: the dev-api DB threw on the ai_sessions INSERT
(probably a missing column or a unique constraint), session-manager.ts
swallowed the error, the turn proceeded without a persisted session,
and the entire user/assistant message pair was silently dropped.

────────────────────────────────────────────────────────────────────────
ROOT CAUSE #4  — the 20-vs-1 tool-call discrepancy (side observation)
────────────────────────────────────────────────────────────────────────

Original task complaint: "trace says 20 tool calls but SSE shows 1".

Actually wrong — the *task description* read the trace as 20 tools, but
the FINAL `usage` SSE event (03-sse-events.json:1540) shows
toolCallCount=10, not 20. The 10 calls were:
  • list_files (1)
  • bash pdftotext (1)
  • view (4 attempts at various paths, all failed)
  • bash pwd (1)
  • read_file src/App.tsx (1)
  • glob (2)

SSE actually emitted tool_call events for every one — the test runner's
`seenKinds` dedup at scripts/r11-pdf-attach-test.ts:120-124 only logs
the FIRST occurrence per kind to console, but every tool_call IS in the
saved 03-sse-events.json (search for `"kind":"tool_call"` — there are
many). So this is a misread of the summary, not a missing-event bug.

────────────────────────────────────────────────────────────────────────
FIX PLAN — file / line / change (no edits made)
────────────────────────────────────────────────────────────────────────

FIX 1 (root cause #1) — make attached requirement docs the unambiguous
build brief.

  File A: services/api/src/ai/attachments.ts
    Line 353-357 (the function tail that builds augmentedPrompt).
    OLD:
        const augmentedPrompt = userPrompt + fileSections.join("") + notes.join("");
    NEW:
        const hasInlinedDocs = fileSections.length > 0;
        const docFrame = hasInlinedDocs
          ? "\n\n========== ATTACHED DOCUMENTS (use these to fulfill the user's request) =========="
            + fileSections.join("")
            + "\n========== END OF ATTACHED DOCUMENTS =========="
            + "\n\n========== USER REQUEST (REPEATED — execute this against the documents above) =========="
            + `\n${userPrompt}`
            + "\n========== END OF USER REQUEST =========="
          : "";
        const augmentedPrompt = userPrompt + docFrame + notes.join("");
    Rationale:
      • Strong delimiters that the model can't mistake for metadata.
      • The user's directive is echoed AFTER the document body so the
        model's last-token attention sees the build instruction, not
        the tail of the PDF.
      • Pure formatting — no behavior change when no documents are
        attached.

  File B: services/api/src/routes/chat/system-prompts.ts
    Insert a new policy block inside buildAgentPrompt(), immediately
    after the OUTPUT DISCIPLINE section (after line 107), before the
    presentation policy at line 111:

    NEW BLOCK:
        ═══════════════════════════════════════════════════════════════
          📎  ATTACHED DOCUMENTS = BUILD BRIEF  📎
        ═══════════════════════════════════════════════════════════════
        When the user's message contains a block between
        `========== ATTACHED DOCUMENTS ==========` and
        `========== END OF ATTACHED DOCUMENTS ==========`, treat the
        content INSIDE that block as the authoritative specification
        for what to build. The block is supplied by the user — it is
        NOT internal context, NOT example data, NOT a tag/chip. You
        MUST read it, extract the requirements, and proceed to build
        without asking "what would you like me to do?".

        Mandatory behavior:
          • Use the document's system/product name as the app title.
          • Use the document's section headings to drive page/route
            structure.
          • Use the document's data entities to drive your data model.
          • If the user-request block AFTER the documents adds
            constraints (palette, framework, page count), honor them.
          • Only ask a clarification question if the documents are
            self-contradictory on a top-level decision. Do not ask
            because the request feels open-ended — the documents are
            the request.

    Rationale: closes the system-prompt gap that left the model
    interpreting an attached SRS as "just context".

  File C (optional cleanup, root cause #1.4): services/api/src/ai/
  attachments.ts lines 296-310. The PDF fallback path saves a binary
  to tmp and pushes a `fileAttachments[]` entry. Replace with a
  note-only fallback so the SDK isn't handed an unreadable file:

    OLD:
        } else {
          const tempPath = saveToTempFile(base64, name, mime);
          fileAttachments.push({ type: "file", path: tempPath, displayName: name });
          console.log(`[Attachments] Saved PDF "${name}" to ${tempPath} (no text extracted; fallback)`);
        }
    NEW:
        } else {
          notes.push(`\n\n[Attached PDF: ${name} — pdf-parse returned 0 chars (probably image-only/scanned). Ask the user to provide a text version or describe the contents.]`);
          console.warn(`[Attachments] PDF "${name}" yielded 0 chars from pdf-parse; not forwarding to SDK`);
        }

FIX 2 (root cause #2) — stop wiping session_id at turn end.

  File: services/api/src/routes/chat/post-processing.ts
    Line 191 and Line 203 (both inside handleFinalCleanup()).
    OLD (both lines):
        state.traceCollector.setSessionId("");
    NEW (both lines):
        // Intentionally NOT clearing session id — trace needs it for
        // post-mortem correlation. The SDK session lifecycle is
        // managed by projectSessions / ai_sessions, not by the trace
        // context.
        // (delete the setSessionId("") line entirely)

  Defense in depth — file services/api/src/ai/trace-factory.ts:353.
    OLD:
        function setSessionId(id: string): void { ctx.sessionId = id; }
    NEW:
        function setSessionId(id: string): void {
          // Ignore empty / falsy ids so accidental setSessionId("")
          // calls never blank out a real id.
          if (!id) return;
          ctx.sessionId = id;
        }

FIX 3 (root cause #3) — never proceed if ai_sessions insert fails,
and write workspace_id so RLS sees the row.

  File A: services/api/src/routes/chat/session-manager.ts
    Function persistSessionToDb (lines 164-193).
    OLD (lines 183-188):
        const [newSession] = await sql`
          INSERT INTO ai_sessions (project_id, user_id, mode, copilot_session_id)
          VALUES (${projectId}, ${userId}, ${mode}, ${sessionId ?? null})
          RETURNING id
        `;
        return newSession?.id;
    NEW:
        const [wsRow] = await sql<{ workspace_id: string | null }[]>`
          SELECT workspace_id FROM projects WHERE id = ${projectId}
        `;
        const workspaceId = wsRow?.workspace_id ?? null;
        const [newSession] = await sql`
          INSERT INTO ai_sessions (project_id, user_id, workspace_id, mode, copilot_session_id)
          VALUES (${projectId}, ${userId}, ${workspaceId}, ${mode}, ${sessionId ?? null})
          RETURNING id
        `;
        return newSession?.id;

    AND the outer catch (lines 189-192):
    OLD:
        } catch (e) {
          console.warn("[Chat] DB session lookup failed:", e);
          return undefined;
        }
    NEW:
        } catch (e) {
          console.error("[Chat] ai_sessions persist failed — turn will NOT be recorded:", e);
          // Re-throw so send-handler aborts cleanly instead of streaming
          // a "ghost" turn that never lands in chat_history.
          throw e instanceof Error ? e : new Error(String(e));
        }

    (Prerequisite: confirm the ai_sessions table schema actually has
    a workspace_id column. If not, add a migration in packages/db/
    migrations that adds `workspace_id uuid REFERENCES workspaces(id)`
    with a backfill from `projects.workspace_id`. Inspect
    packages/db/migrations against `\d ai_sessions` on dev before
    cutting the change — if the column is already there, only the
    INSERT needs to be widened.)

  File B: services/api/src/routes/chat/send-handler.ts
    Lines 506-515 — make the user/assistant persistence path
    unconditional so a missing dbSessionId surfaces instead of being
    silently skipped:

    OLD:
        const dbSessionId = await persistSessionToDb(projectId, userId, mode, sessionId);
        if (state.usageCollector && dbSessionId) state.usageCollector.setSessionId(dbSessionId);

        const { displayName, color } = await resolveUserDisplay(userId);
        if (dbSessionId) await saveUserMessage(dbSessionId, displayContent ?? content, userId, displayName, color);
        broadcastToRoom(...);

        if (dbSessionId) state.assistantMessageId = await preInsertAssistantMessage(dbSessionId);
    NEW:
        const dbSessionId = await persistSessionToDb(projectId, userId, mode, sessionId);
        if (!dbSessionId) {
          // persistSessionToDb now throws on real failures, so a missing
          // value here means a logic bug, not a swallowed DB error.
          throw new Error("ai_sessions row could not be resolved for project " + projectId);
        }
        state.usageCollector?.setSessionId(dbSessionId);

        const { displayName, color } = await resolveUserDisplay(userId);
        await saveUserMessage(dbSessionId, displayContent ?? content, userId, displayName, color);
        broadcastToRoom(...);

        state.assistantMessageId = await preInsertAssistantMessage(dbSessionId);

────────────────────────────────────────────────────────────────────────
SUMMARY
────────────────────────────────────────────────────────────────────────

  • Root cause #1 (user-visible bug): augmented-prompt framing + system
    prompt silence on attached docs → AI treats SRS as metadata, never
    builds. Fix in 2 files (attachments.ts, system-prompts.ts) plus a
    small fallback-branch cleanup.

  • Root cause #2 (observability bug): two `setSessionId("")` lines
    deliberately wipe the trace's session id. Delete + harden the
    setter in trace-factory.

  • Root cause #3 (silent data-loss bug): persistSessionToDb swallows
    errors and the INSERT is missing workspace_id, so RLS hides
    everything. Re-throw on failure, add workspace_id, fail-fast in
    send-handler.

None of the three fixes is a patch over the others — each addresses a
distinct layer (prompt assembly, trace context propagation, DB
persistence integrity).
