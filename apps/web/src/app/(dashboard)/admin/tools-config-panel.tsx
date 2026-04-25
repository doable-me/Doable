"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Wrench, Plus, Loader2, Check, X, Trash2, Save,
  AlertTriangle, HelpCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface KnownTool {
  name: string;
  category: "doable" | "sdk";
  description: string;
}

interface ModeToolConfig {
  mode: string;
  allowed_tools: string[];
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export function ToolsConfigPanel() {
  const [modes, setModes] = useState<ModeToolConfig[]>([]);
  const [knownTools, setKnownTools] = useState<KnownTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<string | null>(null);
  const [editAllowedTools, setEditAllowedTools] = useState<Set<string>>(new Set());
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingMode, setAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ modes: ModeToolConfig[]; knownTools: KnownTool[] }>("/admin/tools/modes");
      setModes(res.modes);
      setKnownTools(res.knownTools);
    } catch (err) {
      console.error("Failed to load tool configs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(mode: ModeToolConfig) {
    setEditingMode(mode.mode);
    setEditAllowedTools(new Set(mode.allowed_tools));
    setEditDescription(mode.description ?? "");
  }

  function toggleTool(toolName: string) {
    setEditAllowedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  }

  async function saveMode() {
    if (!editingMode) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/tools/modes/${editingMode}`, {
        method: "PUT",
        body: JSON.stringify({
          allowedTools: Array.from(editAllowedTools),
          description: editDescription || null,
        }),
      });
      setSuccessMsg(`Saved "${editingMode}" mode tools`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setEditingMode(null);
      await load();
    } catch (err) {
      console.error("Failed to save mode:", err);
    } finally {
      setSaving(false);
    }
  }

  async function addMode() {
    if (!newModeName.trim()) return;
    const name = newModeName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    setSaving(true);
    try {
      await apiFetch(`/admin/tools/modes/${name}`, {
        method: "PUT",
        body: JSON.stringify({
          allowedTools: [],
          description: null,
        }),
      });
      setAddingMode(false);
      setNewModeName("");
      await load();
      // Auto-open for editing
      const loaded = await apiFetch<{ modes: ModeToolConfig[]; knownTools: KnownTool[] }>("/admin/tools/modes");
      const newMode = loaded.modes.find(m => m.mode === name);
      if (newMode) startEdit(newMode);
    } catch (err) {
      console.error("Failed to add mode:", err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMode(mode: string) {
    if (!confirm(`Delete the "${mode}" mode configuration? This will cause the mode to use hardcoded defaults.`)) return;
    try {
      await apiFetch(`/admin/tools/modes/${mode}`, { method: "DELETE" });
      setSuccessMsg(`Deleted "${mode}" mode`);
      setTimeout(() => setSuccessMsg(null), 3000);
      if (editingMode === mode) setEditingMode(null);
      await load();
    } catch (err) {
      console.error("Failed to delete mode:", err);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const doableTools = knownTools.filter(t => t.category === "doable");
  const sdkTools = knownTools.filter(t => t.category === "sdk");

  return (
    <div className="space-y-5">
      {/* Help text */}
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configure which tools are available in each AI mode. <strong className="text-foreground">Strategize</strong> (plan mode) typically
            uses read-only tools for analysis. <strong className="text-foreground">Build</strong> mode has full file creation and editing tools.
            Changes take effect on new sessions within 60 seconds.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-4 py-2.5">
          <Check className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">{successMsg}</span>
        </div>
      )}

      {/* Mode cards */}
      <div className="space-y-3">
        {modes.map(mode => {
          const isEditing = editingMode === mode.mode;
          const modeLabel = mode.mode === "plan" ? "Strategize" : mode.mode === "build" ? "Build" : mode.mode.charAt(0).toUpperCase() + mode.mode.slice(1);

          return (
            <div key={mode.mode} className="rounded-lg border border-border bg-card">
              {/* Mode header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  mode.mode === "plan" ? "bg-purple-600/20" : "bg-brand-600/20"
                }`}>
                  <Wrench className={`h-4 w-4 ${mode.mode === "plan" ? "text-purple-400" : "text-brand-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{modeLabel}</h3>
                    <code className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{mode.mode}</code>
                    <span className="text-[10px] text-muted-foreground">{mode.allowed_tools.length} tools</span>
                  </div>
                  {mode.description && <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {!isEditing && (
                    <button onClick={() => startEdit(mode)}
                      className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors">
                      <Wrench className="h-3 w-3" /> Configure
                    </button>
                  )}
                  {mode.mode !== "plan" && mode.mode !== "build" && (
                    <button onClick={() => deleteMode(mode.mode)}
                      className="rounded p-1.5 text-muted-foreground hover:text-red-400 hover:bg-secondary transition-colors" title="Delete mode">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Current tools (when not editing) */}
              {!isEditing && (
                <div className="border-t border-border px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {mode.allowed_tools.map(tool => (
                      <span key={tool} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {tool}
                      </span>
                    ))}
                    {mode.allowed_tools.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No tools configured — will use hardcoded defaults</span>
                    )}
                  </div>
                </div>
              )}

              {/* Edit panel */}
              {isEditing && (
                <div className="border-t border-border px-4 py-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                    <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)}
                      placeholder="e.g. Read-only planning tools"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
                  </div>

                  {/* Doable tools */}
                  <div>
                    <h4 className="text-xs font-medium text-foreground mb-2">Doable Tools</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {doableTools.map(tool => (
                        <label key={tool.name}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            editAllowedTools.has(tool.name)
                              ? "border-brand-600/50 bg-brand-600/10"
                              : "border-border bg-card hover:bg-muted"
                          }`}>
                          <input type="checkbox" checked={editAllowedTools.has(tool.name)} onChange={() => toggleTool(tool.name)}
                            className="rounded border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0" />
                          <div className="min-w-0">
                            <span className="text-xs text-foreground font-medium">{tool.name}</span>
                            <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* SDK tools */}
                  <div>
                    <h4 className="text-xs font-medium text-foreground mb-2">SDK Built-in Tools</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {sdkTools.map(tool => (
                        <label key={tool.name}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            editAllowedTools.has(tool.name)
                              ? "border-brand-600/50 bg-brand-600/10"
                              : "border-border bg-card hover:bg-muted"
                          }`}>
                          <input type="checkbox" checked={editAllowedTools.has(tool.name)} onChange={() => toggleTool(tool.name)}
                            className="rounded border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0" />
                          <div className="min-w-0">
                            <span className="text-xs text-foreground font-medium">{tool.name}</span>
                            <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Warning for plan mode */}
                  {mode.mode === "plan" && editAllowedTools.has("edit_file") && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-600/5 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-300">Strategize mode with write tools enabled may cause unintended file modifications.</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={saveMode} disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Changes
                    </button>
                    <button onClick={() => setEditingMode(null)}
                      className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      Cancel
                    </button>
                    <div className="flex-1" />
                    <span className="text-[10px] text-muted-foreground">{editAllowedTools.size} tools selected</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new mode */}
      {addingMode ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <input type="text" value={newModeName} onChange={e => setNewModeName(e.target.value)}
            placeholder="Mode name (e.g. review, debug)"
            onKeyDown={e => e.key === "Enter" && addMode()}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
          <button onClick={addMode} disabled={!newModeName.trim() || saving}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
            <Check className="h-3 w-3" /> Add
          </button>
          <button onClick={() => { setAddingMode(false); setNewModeName(""); }}
            className="rounded p-1.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <button onClick={() => setAddingMode(true)}
          className="flex items-center gap-2 w-full rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add New Mode
        </button>
      )}
    </div>
  );
}
