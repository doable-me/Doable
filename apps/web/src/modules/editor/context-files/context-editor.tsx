"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Save, Trash2, Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

interface ContextEditorProps {
  file: ContextFile;
  onSave: (content: string) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
}

type ViewMode = "edit" | "preview";

// ─── Auto-save debounce ─────────────────────────────────────

const AUTO_SAVE_DELAY = 2000;

// ─── Component ──────────────────────────────────────────────

export const ContextEditor = ({
  file,
  onSave,
  onBack,
  onDelete,
}: ContextEditorProps) => {
  const [content, setContent] = useState(file.content);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset content when file changes
  useEffect(() => {
    setContent(file.content);
    setDirty(false);
  }, [file.filename, file.content]);

  // Focus textarea on mount in edit mode
  useEffect(() => {
    if (viewMode === "edit" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [viewMode]);

  // Auto-save logic
  const scheduleSave = useCallback(
    (newContent: string) => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(() => {
        void doSave(newContent);
      }, AUTO_SAVE_DELAY);
    },
     
    [onSave]
  );

  const doSave = async (contentToSave: string) => {
    setSaving(true);
    try {
      await onSave(contentToSave);
      setDirty(false);
      setLastSaved(new Date());
    } catch {
      // Save failed — user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (newContent: string) => {
    setContent(newContent);
    setDirty(true);
    scheduleSave(newContent);
  };

  const handleManualSave = () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    void doSave(content);
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleManualSave();
    }
  };

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Back to file list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-medium">{file.filename}</span>
          {dirty && (
            <span className="text-xs text-muted-foreground">(unsaved)</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-muted p-0.5">
            <button
              onClick={() => setViewMode("edit")}
              className={cn(
                "p-1 rounded-sm transition-colors",
                viewMode === "edit"
                  ? "bg-background shadow-sm"
                  : "hover:bg-background/50"
              )}
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={cn(
                "p-1 rounded-sm transition-colors",
                viewMode === "preview"
                  ? "bg-background shadow-sm"
                  : "hover:bg-background/50"
              )}
              title="Preview"
            >
              <Eye className="h-3 w-3" />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={handleManualSave}
            disabled={!dirty || saving}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground"
            )}
            title="Save (Ctrl+S)"
          >
            <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
            title="Delete / Reset"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b text-xs text-muted-foreground">
        <span>{content.length} chars</span>
        {lastSaved && (
          <span>Saved {formatTimeAgo(lastSaved)}</span>
        )}
        {saving && <span>Saving...</span>}
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-auto">
        {viewMode === "edit" ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full h-full p-4 bg-background text-sm font-mono leading-relaxed resize-none focus:outline-none"
            placeholder="Start writing..."
            spellCheck={false}
          />
        ) : (
          <div className="p-4 prose prose-sm max-w-none">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Simple Markdown Preview ────────────────────────────────

const MarkdownPreview = ({ content }: { content: string }) => {
  // Lightweight markdown rendering — headings, bold, italic, code, lists
  const html = content
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-6 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    // Comments (HTML-style)
    .replace(/<!--[\s\S]*?-->/g, '<span class="text-muted-foreground/50 italic text-xs">[placeholder]</span>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="text-sm mb-3">')
    // Single newlines
    .replace(/\n/g, "<br />");

  return (
    <div
      className="text-sm"
      dangerouslySetInnerHTML={{ __html: `<p class="text-sm mb-3">${html}</p>` }}
    />
  );
};

// ─── Helpers ────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
