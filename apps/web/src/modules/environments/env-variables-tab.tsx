"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  Key, Eye, EyeOff, Globe, Shield, Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

interface EnvVar {
  id: string;
  key: string;
  is_secret: boolean;
  target: string;
  description: string | null;
  scope: "workspace" | "project";
  created_at: string;
  updated_at: string;
}

const TARGET_OPTIONS = [
  { value: "all", label: "All" },
  { value: "development", label: "Development" },
  { value: "preview", label: "Preview" },
  { value: "production", label: "Production" },
] as const;

export function VariablesTab({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const [projectVars, setProjectVars] = useState<EnvVar[]>([]);
  const [workspaceVars, setWorkspaceVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [showInherited, setShowInherited] = useState(true);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTarget, setNewTarget] = useState<string>("all");
  const [newSecret, setNewSecret] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editTarget, setEditTarget] = useState<string>("all");
  const [editDescription, setEditDescription] = useState("");

  const loadVars = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, wsRes] = await Promise.all([
        apiFetch<{ data: EnvVar[] }>(`/projects/${projectId}/env-vars`),
        apiFetch<{ data: EnvVar[] }>(`/workspaces/${workspaceId}/env-vars`),
      ]);
      setProjectVars(projRes.data); setWorkspaceVars(wsRes.data);
    } catch {} finally { setLoading(false); }
  }, [projectId, workspaceId]);

  useEffect(() => { void loadVars(); }, [loadVars]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${projectId}/env-vars`, {
        method: "POST", body: JSON.stringify({ key: newKey.trim(), value: newValue, target: newTarget, is_secret: newSecret, description: newDescription.trim() || undefined }),
      });
      setAdding(false); setNewKey(""); setNewValue(""); setNewTarget("all"); setNewSecret(false); setNewDescription("");
      await loadVars();
    } catch {} finally { setSaving(false); }
  };

  const handleUpdate = async (varId: string) => {
    setSaving(true);
    try {
      await apiFetch(`/projects/${projectId}/env-vars/${varId}`, {
        method: "PUT", body: JSON.stringify({ value: editValue || undefined, target: editTarget, description: editDescription.trim() || undefined }),
      });
      setEditingId(null); await loadVars();
    } finally { setSaving(false); }
  };

  const handleDelete = async (varId: string) => {
    try { await apiFetch(`/projects/${projectId}/env-vars/${varId}`, { method: "DELETE" }); await loadVars(); } catch {}
  };

  const revealValue = async (varId: string) => {
    if (revealedValues[varId]) { setRevealedValues((prev) => { const next = { ...prev }; delete next[varId]; return next; }); return; }
    try { const res = await apiFetch<{ data: { value: string } }>(`/env-vars/${varId}/value`); setRevealedValues((prev) => ({ ...prev, [varId]: res.data.value })); } catch {}
  };

  const startEdit = (v: EnvVar) => { setEditingId(v.id); setEditValue(""); setEditTarget(v.target); setEditDescription(v.description ?? ""); };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const projectKeys = new Set(projectVars.map((v) => v.key));
  const inheritedVars = workspaceVars.filter((v) => !projectKeys.has(v.key));

  return (
    <div className="space-y-3">
      {!adding ? (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Variable
        </button>
      ) : (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="KEY_NAME" value={newKey} onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              className="rounded-md border bg-background px-2 py-1.5 text-xs font-mono" autoFocus />
            <select value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs">
              {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <input placeholder="Value" type={newSecret ? "password" : "text"} value={newValue} onChange={(e) => setNewValue(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono" />
          <input placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <button type="button" onClick={() => setNewSecret(!newSecret)} className="text-muted-foreground hover:text-foreground">
                {newSecret ? <Shield className="h-3.5 w-3.5 text-amber-500" /> : <Globe className="h-3.5 w-3.5" />}
              </button>
              {newSecret ? "Secret (masked after save)" : "Plaintext"}
            </label>
            <div className="flex gap-1.5">
              <button onClick={() => setAdding(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleAdd} disabled={saving || !newKey.trim() || !newValue.trim()}
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {projectVars.length === 0 && inheritedVars.length === 0 && !adding && (
        <div className="flex flex-col items-center py-6 text-center">
          <Key className="h-6 w-6 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No environment variables</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Variables are injected into dev server and builds</p>
        </div>
      )}

      {projectVars.map((v) => (
        <div key={v.id} className="rounded-lg border bg-card">
          {editingId === v.id ? (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{v.key}</span>
                <select value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px]">
                  {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <input placeholder="New value (leave blank to keep)" type={v.is_secret ? "password" : "text"} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono" />
              <input placeholder="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setEditingId(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={() => handleUpdate(v.id)} disabled={saving} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium truncate">{v.key}</span>
                  {v.is_secret && <Shield className="h-3 w-3 text-amber-500 shrink-0" />}
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{v.target}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{revealedValues[v.id] ?? "••••••••"}</div>
                {v.description && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{v.description}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => revealValue(v.id)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted" title="Toggle value">
                  {revealedValues[v.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <button onClick={() => startEdit(v)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted" title="Edit"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => handleDelete(v.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted" title="Delete"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {inheritedVars.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowInherited(!showInherited)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
            {showInherited ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Inherited from workspace ({inheritedVars.length})
          </button>
          {showInherited && inheritedVars.map((v) => (
            <div key={v.id} className="rounded-lg border border-dashed bg-muted/30 mb-1.5">
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground truncate">{v.key}</span>
                    {v.is_secret && <Shield className="h-3 w-3 text-amber-500/60 shrink-0" />}
                    <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-60">{v.target}</Badge>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">inherited</Badge>
                  </div>
                  {v.description && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{v.description}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
