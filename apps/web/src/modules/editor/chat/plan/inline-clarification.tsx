"use client";

import { memo, useState, useCallback } from "react";
import { Check, Sparkles, ChevronRight, SkipForward } from "lucide-react";

interface InlineClarificationCardProps {
  questionId: string;
  question: string;
  options?: string[];
  context?: string;
  answered?: boolean;
  answer?: string;
  onAnswer: (questionId: string, answer: string) => void;
  onSkip: (questionId: string) => void;
}

export const InlineClarificationCard = memo(function InlineClarificationCard({
  questionId,
  question,
  options = [],
  context,
  answered = false,
  answer,
  onAnswer,
  onSkip,
}: InlineClarificationCardProps) {
  const [selected, setSelected] = useState<string | null>(answer ?? null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(answered);

  const handleSelect = useCallback(
    (opt: string) => {
      if (submitted) return;
      setSelected(opt);
      setFreeText("");
      // Auto-submit on click with a brief visual delay
      setTimeout(() => {
        setSubmitted(true);
        onAnswer(questionId, opt);
      }, 280);
    },
    [submitted, questionId, onAnswer]
  );

  const handleFreeSubmit = useCallback(() => {
    if (!freeText.trim() || submitted) return;
    const val = freeText.trim();
    setSelected(val);
    setSubmitted(true);
    onAnswer(questionId, val);
  }, [freeText, submitted, questionId, onAnswer]);

  const handleSkip = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    onSkip(questionId);
  }, [submitted, questionId, onSkip]);

  // ── Answered / read-only state ──────────────────────────
  if (submitted) {
    return (
      <div className="clarification-card mt-2 rounded-xl border border-brand-500/15 bg-brand-500/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500/15 border border-green-500/25">
            <Check className="h-2.5 w-2.5 text-green-400" />
          </div>
          <p className="flex-1 truncate text-xs text-muted-foreground">{question}</p>
          {selected && (
            <span className="shrink-0 rounded-full bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 text-[10px] font-medium text-brand-300">
              {selected === "__skipped__" ? "AI decides" : selected}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Active question card ────────────────────────────────
  return (
    <div className="clarification-card mt-3 rounded-xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.06] via-purple-500/[0.03] to-transparent p-4 shadow-lg shadow-brand-500/5">
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-3">
        <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/25">
          <Sparkles className="h-3 w-3 text-brand-400" />
          <span className="clarify-glow-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-400 border border-background" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug">{question}</p>
          {context && (
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{context}</p>
          )}
        </div>
      </div>

      {/* Option chips */}
      {options.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={submitted}
              className={`option-btn text-left rounded-lg border px-2.5 py-2 text-xs transition-all duration-200 disabled:pointer-events-none
                ${selected === opt
                  ? "selected border-brand-500/60 bg-brand-500/15 text-brand-300 font-medium"
                  : "border-white/8 bg-white/[0.02] text-muted-foreground hover:border-brand-500/35 hover:bg-brand-500/8 hover:text-foreground"
                }
              `}
            >
              {selected === opt && (
                <Check className="inline h-2.5 w-2.5 mr-1 text-brand-400" />
              )}
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Free text input */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFreeSubmit()}
          disabled={submitted}
          placeholder={options.length > 0 ? "Or type a custom answer…" : "Type your answer…"}
          className="flex-1 min-w-0 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/40 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition-all disabled:opacity-40"
        />
        {freeText.trim() && (
          <button
            onClick={handleFreeSubmit}
            disabled={submitted}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-400 transition-colors disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Skip */}
      <button
        onClick={handleSkip}
        disabled={submitted}
        className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:pointer-events-none"
      >
        <SkipForward className="h-2.5 w-2.5" />
        Skip — let AI decide
      </button>
    </div>
  );
});
