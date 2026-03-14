"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Brain, Save, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface KnowledgeTabProps {
  projectId: string;
  apiBaseUrl?: string;
}

// ─── Constants ──────────────────────────────────────────────

const AUTO_SAVE_DELAY = 2500;
const FILENAME = "knowledge.md";

// ─── Component ──────────────────────────────────────────────

export const KnowledgeTab = ({
  projectId,
  apiBaseUrl = "/api",
}: KnowledgeTabProps) => {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch knowledge.md ─────────────────────────────────

  const fetchKnowledge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/projects/${projectId}/context/${FILENAME}`,
        { credentials: "include" }
      );
      if (res.status === 404) {
        // Initialize context first, then retry
        await fetch(`${apiBaseUrl}/projects/${projectId}/context`, {
          credentials: "include",
        });
        const retry = await fetch(
          `${apiBaseUrl}/projects/${projectId}/context/${FILENAME}`,
          { credentials: "include" }
        );
        if (!retry.ok) throw new Error("Failed to load knowledge file");
        const json = (await retry.json()) as {
          data: { content: string };
        };
        setContent(json.data.content);
        setOriginalContent(json.data.content);
        return;
      }
      if (!res.ok) throw new Error("Failed to load knowledge file");
      const json = (await res.json()) as { data: { content: string } };
      setContent(json.data.content);
      setOriginalContent(json.data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBaseUrl]);

  useEffect(() => {
    void fetchKnowledge();
  }, [fetchKnowledge]);

  // ─── Save ───────────────────────────────────────────────

  const save = useCallback(
    async (contentToSave: string) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `${apiBaseUrl}/projects/${projectId}/context/${FILENAME}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ content: contentToSave }),
          }
        );
        if (!res.ok) throw new Error("Failed to save");
        setOriginalContent(contentToSave);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [projectId, apiBaseUrl]
  );

  // ─── Auto-save ─────────────────────────────────────────

  const handleChange = (newContent: string) => {
    setContent(newContent);
    setDirty(newContent !== originalContent);

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (newContent !== originalContent) {
        void save(newContent);
      }
    }, AUTO_SAVE_DELAY);
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // ─── Actions ────────────────────────────────────────────

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void save(content);
  };

  const handleReset = () => {
    if (!confirm("Reset knowledge.md to the saved version?")) return;
    setContent(originalContent);
    setDirty(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleManualSave();
    }
  };

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Loading knowledge base...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Knowledge Base</h3>
          {dirty && (
            <span className="text-xs text-amber-600">(unsaved)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            disabled={!dirty}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="Revert changes"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleManualSave}
            disabled={!dirty || saving}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="Save (Ctrl+S)"
          >
            <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
          </button>
        </div>
      </div>

      {/* Hint */}
      <div className="px-4 py-2 border-b text-xs text-muted-foreground">
        Define your tech stack, conventions, and domain terms.
        The AI reads this before every interaction.
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-600 bg-red-50 border-b">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full h-full p-4 bg-background text-sm font-mono leading-relaxed resize-none focus:outline-none"
          placeholder="# Knowledge Base&#10;&#10;## Tech Stack&#10;- ..."
          spellCheck={false}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t text-xs text-muted-foreground">
        <span>{content.length} chars</span>
        {saving && <span>Saving...</span>}
      </div>
    </div>
  );
};
