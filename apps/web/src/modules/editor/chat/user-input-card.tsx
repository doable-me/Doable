"use client";

import { memo, useState, useCallback } from "react";
import { Check, HelpCircle, ChevronRight, Loader2 } from "lucide-react";
import { API_BASE } from "../hooks/use-chat-types";

interface UserInputCardProps {
  projectId: string;
  requestId: string;
  prompt: string;
  choices?: { label: string; value: string }[];
  allowFreeform: boolean;
  answered?: boolean;
  answerLabel?: string;
  /** Marks the message answered in the store so the card collapses. */
  onAnswered: (answerLabel: string) => void;
}

/**
 * Blocking "ask the user" card. Unlike the clarification card, answering here
 * does NOT start a new chat turn — it POSTs the choice to
 * /projects/:id/chat/user-input, which resolves the paused tool so the SAME
 * streaming turn continues. See user-input-registry.ts on the server.
 */
export const UserInputCard = memo(function UserInputCard({
  projectId,
  requestId,
  prompt,
  choices = [],
  allowFreeform,
  answered = false,
  answerLabel,
  onAnswered,
}: UserInputCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(answered);
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string | null>(answerLabel ?? null);

  const submit = useCallback(
    async (value: string, label: string, freeform: boolean) => {
      if (submitting || submitted) return;
      setSubmitting(true);
      setError(null);
      setPickedLabel(label);
      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();
        const res = await fetch(`${API_BASE}/projects/${projectId}/chat/user-input`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ requestId, value, freeform }),
        });
        if (!res.ok) {
          // 409 = the prompt already expired / was answered elsewhere.
          const msg = res.status === 409 ? "This prompt is no longer active." : `Failed to submit (${res.status}).`;
          setError(msg);
          setSubmitting(false);
          setPickedLabel(null);
          return;
        }
        setSubmitted(true);
        onAnswered(label);
      } catch {
        setError("Network error — please try again.");
        setSubmitting(false);
        setPickedLabel(null);
      }
    },
    [submitting, submitted, projectId, requestId, onAnswered],
  );

  const handleFreeSubmit = useCallback(() => {
    const val = freeText.trim();
    if (!val) return;
    submit(val, val, true);
  }, [freeText, submit]);

  // ── Answered / read-only state ──────────────────────────
  if (submitted) {
    return (
      <div className="mt-2 rounded-xl border border-brand-500/15 bg-brand-500/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-green-500/25 bg-green-500/15">
            <Check className="h-2.5 w-2.5 text-green-400" />
          </div>
          <p className="flex-1 truncate text-xs text-muted-foreground">{prompt}</p>
          {pickedLabel && (
            <span className="shrink-0 rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300">
              {pickedLabel}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Active prompt card ───────────────────────────────────
  return (
    <div className="mt-3 rounded-xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.06] via-purple-500/[0.03] to-transparent p-4 shadow-lg shadow-brand-500/5">
      {/* Header */}
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/15">
          <HelpCircle className="h-3 w-3 text-brand-400" />
        </div>
        <p className="flex-1 text-xs font-semibold leading-snug text-foreground">{prompt}</p>
      </div>

      {/* Choice buttons */}
      {choices.length > 0 && (
        <div className="mb-3 grid gap-1.5">
          {choices.map((c) => (
            <button
              key={c.value}
              onClick={() => submit(c.value, c.label, false)}
              disabled={submitting}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all duration-200 disabled:pointer-events-none
                ${pickedLabel === c.label
                  ? "border-brand-500/60 bg-brand-500/15 font-medium text-brand-300"
                  : "border-white/8 bg-white/[0.02] text-muted-foreground hover:border-brand-500/35 hover:bg-brand-500/8 hover:text-foreground"
                }`}
            >
              {submitting && pickedLabel === c.label ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-400" />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400/60" />
              )}
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Free text input */}
      {allowFreeform && (
        <div className="mb-1 flex gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFreeSubmit()}
            disabled={submitting}
            placeholder={choices.length > 0 ? "Or type a custom answer…" : "Type your answer…"}
            className="min-w-0 flex-1 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground transition-all placeholder:text-muted-foreground/40 focus:border-brand-500/40 focus:outline-none focus:ring-1 focus:ring-brand-500/20 disabled:opacity-40"
          />
          {freeText.trim() && (
            <button
              onClick={handleFreeSubmit}
              disabled={submitting}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-400 disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
});
