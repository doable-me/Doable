"use client";

import { useState } from "react";
import {
  Upload,
  Link as LinkIcon,
  FileCode,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

/**
 * Third-party import dialog. Lets a user materialise an external bundle
 * directly into their workspace without going through the Marketplace
 * publish flow. Three sources, all going through the same backend
 * `/marketplace/:workspaceId/environments/import` endpoint:
 *
 *   1. Paste a `doable.json.v1` blob (raw or stringified)
 *   2. Upload a `.zip` matching the Standards Zip v1 layout
 *      (SKILL.md, .mdc rules, mcp.json, plugin.json, knowledge files)
 *   3. Paste a GitHub URL — the API resolves it server-side to a zip
 *
 * Imports skip moderation (private to the importer's workspace) but go
 * through the same permission preview as Marketplace installs.
 */

type Tab = "json" | "zip" | "url";

const TABS: { id: Tab; label: string; Icon: typeof Upload }[] = [
  { id: "json", label: "JSON", Icon: FileCode },
  { id: "zip", label: "Zip", Icon: Upload },
  { id: "url", label: "GitHub URL", Icon: LinkIcon },
];

export interface ImportBundleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported?: () => void;
}

export function ImportBundleDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: ImportBundleDialogProps) {
  const [tab, setTab] = useState<Tab>("json");
  const [jsonText, setJsonText] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setJsonText("");
    setZipFile(null);
    setUrl("");
    setError(null);
    setDone(false);
  }

  async function handleImport() {
    setBusy(true);
    setError(null);

    try {
      if (tab === "json") {
        const parsed = JSON.parse(jsonText);
        await apiFetch(`/marketplace/${workspaceId}/environments/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
      } else if (tab === "zip") {
        if (!zipFile) throw new Error("Pick a .zip file first");
        const fd = new FormData();
        fd.append("file", zipFile);
        fd.append("format", "standards.zip.v1");
        await apiFetch(`/marketplace/${workspaceId}/environments/import-bundle`, {
          method: "POST",
          body: fd,
        });
      } else {
        if (!url.trim()) throw new Error("Paste a GitHub URL first");
        await apiFetch(`/marketplace/${workspaceId}/environments/import-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
      }

      setDone(true);
      onImported?.();
      setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    !done &&
    ((tab === "json" && jsonText.trim().length > 0) ||
      (tab === "zip" && !!zipFile) ||
      (tab === "url" && url.trim().length > 0));

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-400" />
            Import from outside Doable
          </DialogTitle>
          <DialogDescription>
            Bring in an environment from a JSON manifest, Standards Zip, or public GitHub repo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Tabs */}
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Panels */}
          {tab === "json" && (
            <div className="space-y-1.5">
              <Textarea
                rows={10}
                placeholder='{"schemaVersion":"1.0.0","format":"doable.json.v1",...}'
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Paste a <code className="rounded bg-muted px-1 py-0.5">doable.json.v1</code> manifest. Anything that fails schema validation is rejected.
              </p>
            </div>
          )}

          {tab === "zip" && (
            <div className="space-y-1.5">
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/40 px-4 py-6 text-center transition-colors hover:bg-card cursor-pointer">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-foreground">
                  {zipFile ? zipFile.name : "Drop a Standards Zip here, or click to browse"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Compatible with Anthropic Skills, Cursor Rules, MCP, and Claude Code plugin layouts.
                </span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {tab === "url" && (
            <div className="space-y-1.5">
              <Input
                placeholder="https://github.com/owner/repo or https://github.com/owner/repo/tree/main/skills/foo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Public repos only. The import will tarball the path and decode it as a Standards Zip.
              </p>
            </div>
          )}

          {/* Trust caveat */}
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>
              Imports land as a draft environment in your workspace. They never run code or call external services until you authorise each connector individually.
            </span>
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Imported.</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canSubmit}>
            {busy ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing...</>
            ) : done ? (
              <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Imported</>
            ) : (
              <><Upload className="mr-1.5 h-3.5 w-3.5" /> Import to workspace</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
