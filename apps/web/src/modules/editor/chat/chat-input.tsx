"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Paperclip, Square, Plus, ArrowUp, ChevronDown, Sparkles } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import { useAttachments, ACCEPTED_EXTENSIONS, type Attachment } from "@/hooks/use-attachments";
import { AttachmentPreviewStrip } from "./attachment-preview";

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
  onSend: (content: string, attachments?: Attachment[]) => void;
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
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useRotatingPlaceholder();

  const {
    attachments,
    fileInputRef,
    openFilePicker,
    handleFileChange,
    handleDrop: onDrop,
    handlePaste: onPaste,
    removeAttachment,
    clearAll,
  } = useAttachments();

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed || "(attachments)", attachments.length > 0 ? attachments : undefined);
    setValue("");
    clearAll();

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, disabled, onSend, clearAll]);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(false);
      onDrop(e);
    },
    [onDrop]
  );

  return (
    <div className="pt-2 pb-4 px-4 bg-gradient-to-t from-background via-background to-transparent shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className={`relative flex flex-col rounded-2xl border shadow-[0_0_20px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-all duration-300 ease-out bg-muted/20 ${
          isDragging
            ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-400 scale-[1.01]"
            : "border-border/80 hover:border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AttachmentPreviewStrip
          attachments={attachments}
          onRemove={removeAttachment}
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={onPaste}
          placeholder={value ? "" : placeholder}
          disabled={disabled}
          rows={1}
          className="w-full max-h-[40vh] min-h-[48px] resize-none bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between px-2 pb-2 mt-1">
          {/* Left side: Attach + ModeToggle */}
          <div className="flex items-center gap-2">
             <button
               onClick={openFilePicker}
               className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 border border-white/5"
               title="Attach files"
             >
               <Plus className="h-4 w-4" />
               {attachments.length > 0 && (
                 <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-medium text-white shadow-sm">
                   {attachments.length}
                 </span>
               )}
             </button>
             
             <ModeToggle />
          </div>

          {/* Right side: Send / Stop */}
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex h-8 items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 text-red-500 hover:bg-red-500/20 transition-colors"
                title="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
                <span className="text-[11px] font-medium">Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasContent || disabled}
                className="group flex h-8 items-center gap-1.5 rounded-full bg-brand-500 border border-brand-500/20 px-3 text-white shadow-sm hover:bg-brand-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Send message"
              >
                <span className="text-[11px] font-medium tracking-wide">Send</span>
                <ArrowUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-center text-[10px] text-muted-foreground/40 font-medium tracking-wide">
        Shift + Enter for new line
      </div>
    </div>
  );
}
