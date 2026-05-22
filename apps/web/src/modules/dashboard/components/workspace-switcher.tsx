"use client";

import { useState, useEffect } from "react";
import type { Workspace } from "@doable/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Plus, Check, Loader2, Boxes } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { WorkspaceSetupWizard } from "./workspace-setup-wizard";

interface EnvironmentOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelect: (id: string) => void;
  onCreate: (data: {
    name: string;
    slug: string;
    description?: string;
    environmentId?: string;
  }) => Promise<Workspace>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  teal: "bg-teal-500",
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSelect,
  onCreate,
}: WorkspaceSwitcherProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);

  // Setup wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<{ id: string; name: string } | null>(null);

  // Load environments when create dialog opens
  useEffect(() => {
    if (!createOpen || !activeWorkspace) return;
    setLoadingEnvs(true);
    apiFetch<{ data: EnvironmentOption[] }>(`/workspaces/${activeWorkspace.id}/environments`)
      .then((res) => setEnvironments(res.data))
      .catch(() => setEnvironments([]))
      .finally(() => setLoadingEnvs(false));
  }, [createOpen, activeWorkspace]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await onCreate({
        name: name.trim(),
        slug: slugify(name),
        environmentId: selectedEnvId ?? undefined,
      });
      setNewWorkspace({ id: workspace.id, name: workspace.name });
      setName("");
      setSelectedEnvId(null);
      setCreateOpen(false);
      setWizardOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            {activeWorkspace?.name.charAt(0).toUpperCase() ?? "?"}
          </div>
          <span className="max-w-[120px] truncate">
            {activeWorkspace?.name ?? "Select workspace"}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => onSelect(ws.id)}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                {ws.name.charAt(0).toUpperCase()}
              </div>
              <span className="ml-2 flex-1 truncate">{ws.name}</span>
              {ws.id === activeWorkspace?.id && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Workspace Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
              <Input
                placeholder="My Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            {/* Environment Selector */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                Start from environment
                <span className="text-xs text-muted-foreground">(optional)</span>
              </label>
              {loadingEnvs ? (
                <div className="flex items-center gap-2 rounded-md border border-border p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading environments...</span>
                </div>
              ) : environments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No environments available. Create one from the editor.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-border bg-muted p-2">
                  <button
                    onClick={() => setSelectedEnvId(null)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      selectedEnvId === null ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="text-muted-foreground">None — start fresh</span>
                  </button>
                  {environments.map((env) => (
                    <button
                      key={env.id}
                      onClick={() => setSelectedEnvId(env.id)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                        selectedEnvId === env.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent"
                      }`}
                    >
                      <div className={`flex h-7 w-7 items-center justify-center rounded text-sm text-white ${COLOR_MAP[env.color] ?? "bg-blue-500"}`}>
                        {env.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{env.name}</p>
                        {env.description && (
                          <p className="text-[11px] text-muted-foreground truncate">{env.description}</p>
                        )}
                      </div>
                      {selectedEnvId === env.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim()} className="bg-brand-600 text-white hover:bg-brand-500">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-creation Setup Wizard */}
      {newWorkspace && (
        <WorkspaceSetupWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          workspaceId={newWorkspace.id}
          workspaceName={newWorkspace.name}
          onComplete={() => {
            onSelect(newWorkspace.id);
            setNewWorkspace(null);
          }}
        />
      )}
    </>
  );
}
