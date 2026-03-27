"use client";

import { memo, useState, useCallback } from "react";
import { HelpCircle, Check } from "lucide-react";
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

  const handleAnswer = useCallback(
    (value: string) => {
      if (disabled || answered) return;
      setSelectedAnswer(value);
      setAnswered(true);
      onAnswer(question.id, value);
    },
    [disabled, answered, onAnswer, question.id]
  );

  const handleFreeTextSubmit = useCallback(() => {
    const value = freeText.trim();
    if (!value) return;
    handleAnswer(value);
  }, [freeText, handleAnswer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleFreeTextSubmit();
      }
    },
    [handleFreeTextSubmit]
  );

  const handleSkip = useCallback(() => {
    handleAnswer(question.default ?? "");
  }, [handleAnswer, question.default]);

  // Answered state — show selected answer with checkmark
  if (answered) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-green-500" />
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

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      {/* Question */}
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {question.question}
          </p>
          {question.context && (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {question.context}
            </p>
          )}
        </div>
      </div>

      {/* Answer controls */}
      <div className="mt-2.5 pl-6">
        {question.type === "yes_no" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAnswer("yes")}
              disabled={disabled}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Yes
            </button>
            <button
              onClick={() => handleAnswer("no")}
              disabled={disabled}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              No
            </button>
          </div>
        )}

        {question.type === "multi_choice" && (
          <div>
            <div className="flex flex-wrap gap-1.5">
              {question.options?.map((option) => (
                <button
                  key={option}
                  onClick={() => handleAnswer(option)}
                  disabled={disabled}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <input
                type="text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Or type your own..."
                disabled={disabled}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {question.type === "free_text" && (
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={question.default ?? "Type your answer..."}
            disabled={disabled}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
        )}

        {/* Skip button */}
        <button
          onClick={handleSkip}
          disabled={disabled}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Skip — let AI decide
        </button>
      </div>
    </div>
  );
});
