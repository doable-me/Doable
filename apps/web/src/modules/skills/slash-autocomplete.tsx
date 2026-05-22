"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

export interface SkillManifestEntry {
  id: string;
  skill_name: string;
  description: string;
  scope: "workspace" | "project" | "user";
  auto_invoke: boolean;
}

// ─── Hook: fetch skill manifest for autocomplete ────────────

export function useSkillManifest(workspaceId: string | undefined, projectId: string | undefined) {
  const [manifest, setManifest] = useState<SkillManifestEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const query = projectId ? `?projectId=${projectId}` : "";
      const res = await apiFetch<{ data: SkillManifestEntry[] }>(
        `/workspaces/${workspaceId}/skills/manifest${query}`
      );
      setManifest(res.data);
    } catch {
      // Silent fail — autocomplete just won't show
    }
  }, [workspaceId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { manifest, refresh };
}

// ─── Slash Command Autocomplete ─────────────────────────────

interface SlashAutocompleteProps {
  inputValue: string;
  manifest: SkillManifestEntry[];
  onSelect: (skillName: string) => void;
  visible: boolean;
}

export function SlashAutocomplete({ inputValue, manifest, onSelect, visible }: SlashAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter skills by what's typed after /
  const query = inputValue.startsWith("/") ? inputValue.slice(1).toLowerCase() : "";
  const filtered = manifest.filter(
    (s) =>
      s.skill_name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query)
  );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg z-50"
    >
      {filtered.map((skill, i) => (
        <button
          key={skill.id}
          className={cn(
            "flex items-start gap-2.5 w-full px-3 py-2 text-left hover:bg-accent transition-colors",
            i === selectedIndex && "bg-accent"
          )}
          onMouseDown={(e) => {
            e.preventDefault(); // Keep textarea focus
            onSelect(skill.skill_name);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">/{skill.skill_name}</div>
            {skill.description && (
              <div className="text-xs text-muted-foreground truncate">
                {skill.description}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Helper for keyboard navigation in the autocomplete.
 * Returns true if the key was handled (caller should preventDefault).
 */
export function handleSlashAutocompleteKey(
  e: React.KeyboardEvent,
  inputValue: string,
  manifest: SkillManifestEntry[],
  selectedIndex: number,
  setSelectedIndex: (i: number) => void,
  onSelect: (skillName: string) => void,
): boolean {
  if (!inputValue.startsWith("/")) return false;
  const query = inputValue.slice(1).toLowerCase();
  const filtered = manifest.filter(
    (s) =>
      s.skill_name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query)
  );
  if (filtered.length === 0) return false;

  if (e.key === "ArrowDown") {
    setSelectedIndex(Math.min(selectedIndex + 1, filtered.length - 1));
    return true;
  }
  if (e.key === "ArrowUp") {
    setSelectedIndex(Math.max(selectedIndex - 1, 0));
    return true;
  }
  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
    const selected = filtered[selectedIndex];
    if (selected) {
      onSelect(selected.skill_name);
      return true;
    }
  }
  if (e.key === "Escape") {
    return true; // Let parent handle closing
  }
  return false;
}
