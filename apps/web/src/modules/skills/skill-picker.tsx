"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { Lightbulb, Slash, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

export interface SkillManifestEntry {
  id: string;
  skill_name: string;
  description: string;
  scope: "workspace" | "project" | "user";
  auto_invoke: boolean;
}

// ─── Hook: fetch skill manifest ─────────────────────────────

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
      // Silent fail — picker just won't show skills
    }
  }, [workspaceId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { manifest, refresh };
}

// ─── Skill Picker Button + Popover ──────────────────────────

interface SkillPickerButtonProps {
  manifest: SkillManifestEntry[];
  onSelect: (skillName: string) => void;
  disabled?: boolean;
}

export function SkillPickerButton({ manifest, onSelect, disabled }: SkillPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Position the popover above the button
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.top - 8, // 8px gap above button
      left: rect.left,
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      )
        return;
      setOpen(false);
      setFilter("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus filter input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => filterInputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = manifest.filter(
    (s) =>
      s.skill_name.toLowerCase().includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase())
  );

  const handleSelect = (name: string) => {
    onSelect(name);
    setOpen(false);
    setFilter("");
  };

  return (
    <>
      {/* / button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200 shrink-0",
          open
            ? "border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300"
            : "border-border bg-accent text-muted-foreground hover:bg-accent hover:text-foreground",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        title="Skills"
      >
        <Slash className="h-3.5 w-3.5" />
      </button>

      {/* Portal popover */}
      {open &&
        popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed w-72 rounded-lg border bg-popover shadow-xl z-[9999] overflow-hidden"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              transform: "translateY(-100%)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
              <span className="text-xs font-semibold text-muted-foreground">Skills</span>
              <button
                onClick={() => {
                  setOpen(false);
                  setFilter("");
                }}
                className="p-0.5 rounded hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>

            {/* Search */}
            {manifest.length > 3 && (
              <div className="px-3 py-2 border-b">
                <input
                  ref={filterInputRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>
            )}

            {/* Skill list */}
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {filter ? "No matching skills" : "No skills configured"}
                </div>
              ) : (
                filtered.map((skill) => (
                  <button
                    key={skill.id}
                    className="flex items-start gap-2.5 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => handleSelect(skill.skill_name)}
                  >
                    <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">/{skill.skill_name}</div>
                      {skill.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {skill.description}
                        </div>
                      )}
                    </div>
                    {!skill.auto_invoke && (
                      <span className="text-[10px] text-muted-foreground/60 mt-0.5 shrink-0">
                        manual
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
