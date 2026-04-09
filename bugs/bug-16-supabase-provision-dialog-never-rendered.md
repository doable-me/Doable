# Bug 16 — Supabase provisioning dialog never renders; chat hangs forever

**Severity:** 🔴 P0 — Critical (blocks all Supabase-backed app building via AI chat)
**Area:** `apps/web/src/modules/editor/chat/chat-panel.tsx` — consumer of `useChat()`; `apps/web/src/modules/integrations/supabase-provision-dialog.tsx` (the orphaned dialog component)
**Discovered:** 2026-04-09 round-2 E2E test, turn 1 of Supabase-backed feedback app
**Status:** Open — fix below

## Symptom

When the AI chat receives a prompt that requires a new Supabase table, the Copilot SDK calls the `provision_supabase` tool, which causes `services/api/src/routes/chat.ts` (and the MCP Supabase preset) to emit an SSE frame with `type: "provision_supabase_required"`. The AI also emits a text narrative along the lines of:

> "The Supabase provisioning dialog should appear in your chat. Once you complete it, I'll create the table. In the meantime, let me build the form code."

But **no dialog actually appears in the DOM**. The user sees the narrative, the input box goes disabled (because the stream is still in flight waiting for provision completion), and the stream hangs until the SDK silent-bail path fires 120s later.

Verified in Chrome: `document.querySelector('[role=dialog]')` returns nothing; `document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="provision"]')` all empty; textarea `disabled=true`; Stop button visible.

## Root cause

1. **`apps/web/src/modules/integrations/supabase-provision-dialog.tsx`** exists and exports `SupabaseProvisionDialog`.
2. **`apps/web/src/modules/editor/hooks/use-chat.ts:359–367`** handles the SSE event, calls `setSupabaseProvisionRequest({ name, reason })`, and exposes the state at `use-chat.ts:718–719` via the hook return value as `supabaseProvisionRequest` and `dismissSupabaseProvision`.
3. **`apps/web/src/modules/editor/chat/chat-panel.tsx`** is the ONLY consumer of `useChat()` in the editor. It destructures at line 13–24:
   ```ts
   const {
     messages, isStreaming, sendMessage, stopStreaming, loadHistory,
     answerClarification, approvePlan, abandonPlan,
     pendingIntegrationRequest, dismissIntegrationRequest,
   } = useChat(projectId);
   ```
   **`supabaseProvisionRequest` and `dismissSupabaseProvision` are NOT destructured**, and `<SupabaseProvisionDialog>` is **never imported or rendered** in this file.

4. A `grep -r SupabaseProvisionDialog apps/web/src` shows it is defined and one TS-doc reference in use-chat.ts — but no JSX usage anywhere.

**Net effect:** The dialog component is dead code; the hook state that feeds it is dead state; the SSE event is handled but the UI never surfaces it.

## Impact

- Any AI prompt that triggers the provisioning flow (most Supabase-backed app builds) hangs until the 120s silent-bail.
- Even with bug-11's clean-completion bypass, the bug-16 hang still burns 120s per turn and leaves Monaco + preview stuck in a half-built state.
- User sees "the dialog should appear" narrative but literally cannot do anything.

## Fix

Wire the dialog into `chat-panel.tsx`:

```ts
// apps/web/src/modules/editor/chat/chat-panel.tsx

import { SupabaseProvisionDialog } from "@/modules/integrations/supabase-provision-dialog";
// ... other imports

export function ChatPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const workspaceId = useEditorStore((s) => s.workspaceId); // or wherever the active workspace id lives
  const {
    messages, isStreaming, sendMessage, stopStreaming, loadHistory,
    answerClarification, approvePlan, abandonPlan,
    pendingIntegrationRequest, dismissIntegrationRequest,
    supabaseProvisionRequest,       // ← ADD
    dismissSupabaseProvision,       // ← ADD
  } = useChat(projectId);

  // ... existing code

  return (
    <div className="flex h-full flex-col">
      {/* ... header, messages, etc. */}

      {/* Supabase provisioning dialog — fired when AI calls provision_supabase */}
      {supabaseProvisionRequest && projectId && workspaceId && (
        <SupabaseProvisionDialog
          open={!!supabaseProvisionRequest}
          workspaceId={workspaceId}
          projectId={projectId}
          defaultName={supabaseProvisionRequest.name}
          reason={supabaseProvisionRequest.reason}
          onClose={(done) => dismissSupabaseProvision(done)}
        />
      )}

      {/* ... existing integration connect card, chat input */}
    </div>
  );
}
```

Verify that `useEditorStore` exposes `workspaceId`; if not, derive it from `projectId` via a prior fetch or thread it through `useChat`.

## Reproduction

1. Fresh project, editor loaded, Supabase integration already connected workspace-wide.
2. Send: "Build a feedback form that writes to a new Supabase table called `doable_feedback`."
3. Observe in Chrome:
   - Textarea becomes disabled
   - Chat narrative includes "The Supabase provisioning dialog should appear"
   - No dialog is ever visible in the DOM
   - Stream eventually clean-completes after 120s via bug-11's bypass, but no table was created
4. `document.querySelector('[role=dialog]')` → null throughout

## Acceptance

1. After the prompt above, a Supabase provisioning dialog visibly opens within 2s.
2. User can pick org + region, click Create, watch the progress streams, see the dialog auto-dismiss on phase `done`.
3. AI automatically continues with table creation and code generation.
4. The chat textarea re-enables after the dialog closes.
5. No 120s hang.
