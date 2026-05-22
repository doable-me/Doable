"use client";

import { memo, useState, useCallback } from "react";
import { HelpCircle, Check, ChevronRight } from "lucide-react";
import type { ClarificationQuestion } from "@doable/shared/types/ai";
import { ClarificationCard } from "./clarification-card";

interface ClarificationFlowProps {
  questions: ClarificationQuestion[];
  onComplete: (answers: Record<string, string>) => void;
  disabled?: boolean;
}

// ─── Option chip row ──────────────────────────────────────────
function OptionChips({
  options,
  onSelect,
  disabled,
}: {
  options: string[];
  onSelect: (opt: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (opt: string) => {
    if (disabled || selected) return;
    setSelected(opt);
    // Small delay so the selection is seen before advancing
    setTimeout(() => onSelect(opt), 260);
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 mt-3">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => handleSelect(opt)}
          disabled={disabled || !!selected}
          className={`rounded-md border px-2.5 py-2 text-xs text-left transition-all duration-200 ${
            selected === opt
              ? "border-brand-500 bg-brand-500/10 text-brand-400 font-medium"
              : "border-border text-muted-foreground hover:border-brand-500/50 hover:bg-brand-500/5 hover:text-foreground"
          } disabled:pointer-events-none`}
        >
          {selected === opt && (
            <Check className="inline h-3 w-3 mr-1 text-brand-500" />
          )}
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Free-text answer input ───────────────────────────────────
function AnswerInput({
  onSubmit,
  disabled,
  placeholder = "Type your answer…",
}: {
  onSubmit: (val: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [val, setVal] = useState("");

  const commit = () => {
    if (!val.trim()) return;
    onSubmit(val.trim());
    setVal("");
  };

  return (
    <div className="flex gap-2 mt-3">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40 disabled:opacity-50"
      />
      <button
        onClick={commit}
        disabled={disabled || !val.trim()}
        className="flex items-center gap-1 rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Main ClarificationFlow ───────────────────────────────────
export const ClarificationFlow = memo(function ClarificationFlow({
  questions,
  onComplete,
  disabled = false,
}: ClarificationFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState(false);

  const advance = useCallback(
    (questionId: string, answer: string) => {
      const nextAnswers = { ...answers, [questionId]: answer };
      setAnswers(nextAnswers);

      const nextIndex = currentIndex + 1;
      if (nextIndex >= questions.length) {
        setCompleted(true);
        onComplete(nextAnswers);
      } else {
        setTimeout(() => setCurrentIndex(nextIndex), 320);
      }
    },
    [answers, currentIndex, questions.length, onComplete]
  );

  const handleSkipAll = useCallback(() => {
    const allAnswers = { ...answers };
    for (let i = currentIndex; i < questions.length; i++) {
      const q = questions[i]!;
      allAnswers[q.id] = (q as any).default ?? "";
    }
    setCompleted(true);
    onComplete(allAnswers);
  }, [answers, currentIndex, questions, onComplete]);

  // ── Completed state ───────────────────────────────────────
  if (completed) {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
            <Check className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <span className="text-sm font-medium text-foreground">Answers submitted</span>
        </div>
        <div className="space-y-1.5">
          {questions.map((q) => (
            <ClarificationCard
              key={q.id}
              question={q}
              onAnswer={() => {}}
              answeredValue={answers[q.id]}
              disabled
            />
          ))}
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  // Check if this question has option chips (extended schema)
  const options: string[] | undefined = (currentQuestion as any).options;

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
          <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
        </div>
        <span className="text-sm font-medium text-foreground">Before we start…</span>
      </div>

      {/* Progress bar strips */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`block h-1 flex-1 min-w-[14px] rounded-full transition-all duration-300 ${
                i < currentIndex
                  ? "bg-blue-500"
                  : i === currentIndex
                  ? "bg-blue-400 animate-pulse"
                  : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
        <span className="ml-3 text-[10px] text-muted-foreground/50 shrink-0">
          {currentIndex + 1} / {questions.length}
        </span>
        {questions.length > 1 && (
          <button
            onClick={handleSkipAll}
            disabled={disabled}
            className="ml-3 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-50 shrink-0"
          >
            Skip all
          </button>
        )}
      </div>

      {/* Previously answered (collapsed summary) */}
      {currentIndex > 0 && (
        <div className="space-y-1.5 mb-3">
          {questions.slice(0, currentIndex).map((q) => (
            <ClarificationCard
              key={q.id}
              question={q}
              onAnswer={() => {}}
              answeredValue={answers[q.id]}
              disabled
            />
          ))}
        </div>
      )}

      {/* Current question — animated in */}
      <div
        key={currentQuestion.id}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        {/* Question text */}
        <p className="text-sm font-medium text-foreground mb-1">
          {currentQuestion.question}
        </p>
        {(currentQuestion as any).hint && (
          <p className="text-xs text-muted-foreground mb-1">
            {(currentQuestion as any).hint}
          </p>
        )}

        {/* Option chips if available, otherwise free-text */}
        {options && options.length > 0 ? (
          <>
            <OptionChips
              options={options}
              onSelect={(opt) => advance(currentQuestion.id, opt)}
              disabled={disabled}
            />
            <button
              onClick={() => advance(currentQuestion.id, "")}
              disabled={disabled}
              className="mt-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Skip this question
            </button>
          </>
        ) : (
          <>
            <AnswerInput
              onSubmit={(val) => advance(currentQuestion.id, val)}
              disabled={disabled}
            />
            <button
              onClick={() => advance(currentQuestion.id, "")}
              disabled={disabled}
              className="mt-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
});
