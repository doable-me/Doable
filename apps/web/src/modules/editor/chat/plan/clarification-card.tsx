"use client";

import { memo, useState, useCallback } from "react";
import { Check, ArrowRight } from "lucide-react";
import type { ClarificationQuestion } from "@doable/shared/types/ai";

interface ClarificationCardProps {
  question: ClarificationQuestion;
  onAnswer: (questionId: string, answer: string) => void;
  disabled?: boolean;
  /** If provided, renders the card in its answered state with this value */
  answeredValue?: string;
}

export const ClarificationCard = memo(function ClarificationCard({
  question,
  onAnswer,
  disabled = false,
  answeredValue,
}: ClarificationCardProps) {
  const [answered, setAnswered] = useState(answeredValue !== undefined);
  const [selectedAnswer, setSelectedAnswer] = useState(answeredValue ?? "");
  const [freeText, setFreeText] = useState("");

  const handleSubmit = useCallback(() => {
    if (disabled || answered) return;
    const value =
      question.type === "free_text"
        ? freeText.trim()
        : selectedAnswer;
    if (!value && question.type === "free_text") return;
    if (!value && question.type !== "free_text") return;
    setAnswered(true);
    onAnswer(question.id, value);
  }, [disabled, answered, question.id, question.type, freeText, selectedAnswer, onAnswer]);

  const handleSelect = useCallback(
    (value: string) => {
      if (disabled || answered) return;
      setSelectedAnswer(value);
    },
    [disabled, answered]
  );

  const handleFreeTextKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleSkip = useCallback(() => {
    if (disabled || answered) return;
    setSelectedAnswer(question.default ?? "");
    setAnswered(true);
    onAnswer(question.id, question.default ?? "");
  }, [disabled, answered, question.default, question.id, onAnswer]);

  // Answered state — compact summary with checkmark
  if (answered) {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-green-500/10">
            <Check className="h-2.5 w-2.5 text-green-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{question.question}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {selectedAnswer || "(AI will decide)"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasSelection =
    question.type === "free_text"
      ? freeText.trim().length > 0
      : question.type === "multi_choice"
        ? selectedAnswer !== "" || freeText.trim().length > 0
        : selectedAnswer !== "";

  return (
    <div className="space-y-3">
      {/* Question text */}
      <p className="text-sm font-medium text-foreground">{question.question}</p>
      {question.context && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {question.context}
        </p>
      )}

      {/* Yes/No — two full-width radio cards */}
      {question.type === "yes_no" && (
        <div className="space-y-1.5">
          {["Yes", "No"].map((label) => {
            const value = label.toLowerCase();
            const isSelected = selectedAnswer === value;
            return (
              <button
                key={value}
                onClick={() => handleSelect(value)}
                disabled={disabled}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                  isSelected
                    ? "border-blue-500/40 bg-blue-500/[0.06] text-foreground"
                    : "border-border bg-background text-foreground hover:border-blue-500/30 hover:bg-blue-500/[0.03]"
                }`}
              >
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-blue-500 bg-blue-500"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-choice — vertical radio-card list */}
      {question.type === "multi_choice" && (
        <div className="space-y-1.5">
          {question.options?.map((option) => {
            const isSelected = selectedAnswer === option;
            return (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                disabled={disabled}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                  isSelected
                    ? "border-blue-500/40 bg-blue-500/[0.06] text-foreground"
                    : "border-border bg-background text-foreground hover:border-blue-500/30 hover:bg-blue-500/[0.03]"
                }`}
              >
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-blue-500 bg-blue-500"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span>{option}</span>
              </button>
            );
          })}

          {/* Free-text alternative for multi-choice */}
          <div className="mt-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => {
                setFreeText(e.target.value);
                if (e.target.value.trim()) setSelectedAnswer("");
              }}
              onFocus={() => setSelectedAnswer("")}
              onKeyDown={handleFreeTextKeyDown}
              placeholder="Or type your own..."
              disabled={disabled}
              className="w-full rounded-lg border border-dashed border-blue-500/20 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* Free text */}
      {question.type === "free_text" && (
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={handleFreeTextKeyDown}
          placeholder={question.default ?? "Type your answer..."}
          disabled={disabled}
          className="w-full rounded-lg border border-blue-500/20 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
        />
      )}

      {/* Actions row — Continue button + skip link */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handleSkip}
          disabled={disabled}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50"
        >
          Skip — let AI decide
        </button>

        <button
          onClick={() => {
            // For multi-choice with free text override
            if (question.type === "multi_choice" && freeText.trim() && !selectedAnswer) {
              setSelectedAnswer(freeText.trim());
              setAnswered(true);
              onAnswer(question.id, freeText.trim());
              return;
            }
            handleSubmit();
          }}
          disabled={disabled || !hasSelection}
          className="flex items-center gap-1.5 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
});
