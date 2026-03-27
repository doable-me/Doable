"use client";

import { memo, useState, useCallback } from "react";
import { HelpCircle } from "lucide-react";
import type { ClarificationQuestion } from "@doable/shared/types/ai";
import { ClarificationCard } from "./clarification-card";

interface ClarificationFlowProps {
  questions: ClarificationQuestion[];
  onComplete: (answers: Record<string, string>) => void;
  disabled?: boolean;
}

export const ClarificationFlow = memo(function ClarificationFlow({
  questions,
  onComplete,
  disabled = false,
}: ClarificationFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState(false);

  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      const nextAnswers = { ...answers, [questionId]: answer };
      setAnswers(nextAnswers);

      const nextIndex = currentIndex + 1;
      if (nextIndex >= questions.length) {
        setCompleted(true);
        onComplete(nextAnswers);
      } else {
        // Small delay for the answered card animation before advancing
        setTimeout(() => setCurrentIndex(nextIndex), 400);
      }
    },
    [answers, currentIndex, questions.length, onComplete]
  );

  const handleSkipAll = useCallback(() => {
    const allAnswers = { ...answers };
    for (let i = currentIndex; i < questions.length; i++) {
      const q = questions[i]!;
      allAnswers[q.id] = q.default ?? "";
    }
    setAnswers(allAnswers);
    setCurrentIndex(questions.length);
    setCompleted(true);
    onComplete(allAnswers);
  }, [answers, currentIndex, questions, onComplete]);

  if (completed) {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
            <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <span className="text-sm font-medium text-foreground">Before we plan...</span>
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

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
          <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
        </div>
        <span className="text-sm font-medium text-foreground">Before we plan...</span>
      </div>

      {/* Progress dots + Skip All */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`block h-1.5 w-1.5 rounded-full transition-colors ${
                i < currentIndex
                  ? "bg-blue-500"
                  : i === currentIndex
                    ? "bg-blue-500/60 ring-2 ring-blue-500/20"
                    : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
        {questions.length > 1 && currentIndex < questions.length && (
          <button
            onClick={handleSkipAll}
            disabled={disabled}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50"
          >
            Skip all — let AI decide
          </button>
        )}
      </div>

      {/* Previously answered questions (collapsed) */}
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

      {/* Current question with transition */}
      <div
        key={currentQuestion.id}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <ClarificationCard
          question={currentQuestion}
          onAnswer={handleAnswer}
          disabled={disabled}
        />
      </div>
    </div>
  );
});
