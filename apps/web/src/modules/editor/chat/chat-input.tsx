"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Paperclip, Square } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const PLACEHOLDER_SUGGESTIONS = [
  "Build a SaaS landing page with pricing...",
  "Create a task management dashboard...",
  "Design an e-commerce product page...",
  "Make a portfolio website with animations...",
  "Build a blog platform with markdown...",
  "Create a recipe sharing app...",
  "Design a fitness tracking dashboard...",
  "Build a social media feed layout...",
  "Create a weather app with API integration...",
  "Make a chat application with real-time messaging...",
];

function useRotatingPlaceholder(): string {
  const [index, setIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const target = PLACEHOLDER_SUGGESTIONS[index]!;
    let charIndex = 0;
    let timeout: ReturnType<typeof setTimeout>;

    if (isTyping) {
      // Typing animation
      const typeChar = () => {
        if (charIndex <= target.length) {
          setDisplayText(target.slice(0, charIndex));
          charIndex++;
          timeout = setTimeout(typeChar, 30 + Math.random() * 20);
        } else {
          // Hold for a moment then start erasing
          timeout = setTimeout(() => setIsTyping(false), 2500);
        }
      };
      typeChar();
    } else {
      // Erasing animation
      let eraseIndex = displayText.length;
      const eraseChar = () => {
        if (eraseIndex > 0) {
          eraseIndex--;
          setDisplayText(target.slice(0, eraseIndex));
          timeout = setTimeout(eraseChar, 15);
        } else {
          // Move to next suggestion
          setIndex((prev) => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
          setIsTyping(true);
        }
      };
      eraseChar();
    }

    return () => clearTimeout(timeout);
  }, [index, isTyping]);

  return displayText || "Describe what you want to build...";
}

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useRotatingPlaceholder();

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) return;
        handleSend();
      }
    },
    [isStreaming, handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="border-t border-border bg-background p-3">
      {/* Mode toggle */}
      <div className="mb-2 flex items-center justify-between">
        <ModeToggle />
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2 rounded-lg border border-border bg-muted/20 p-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-shadow">
        {/* Attachment */}
        <button
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={value ? "" : placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />

        {/* Send / Stop */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Hint */}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">Enter</kbd> to send,{" "}
        <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
