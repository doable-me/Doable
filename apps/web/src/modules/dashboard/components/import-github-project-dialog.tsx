"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  apiGitHubUserStatus,
  apiGitHubListRepos,
  apiCreateProject,
  apiImportGitHubRepo,
  getGitHubConnectUrl,
  type ApiGitHubRepo,
} from "@/lib/api";
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
import { Loader2, Search, Lock, Globe, GitBranch, ArrowRight } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface ImportGitHubProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "checking" | "connect" | "select" | "importing";

// ─── Importing progress with elapsed timer ──────────────────

function ImportingProgress({ status }: { status: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) =>
    s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      <p className="text-sm text-zinc-300">{status}</p>
      <p className="text-xs text-zinc-500 tabular-nums">{formatTime(elapsed)} elapsed</p>
      <p className="text-xs text-zinc-600">This may take a moment for large repositories</p>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function ImportGitHubProjectDialog({
  open,
  onOpenChange,
}: ImportGitHubProjectDialogProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("checking");
  const [repos, setRepos] = useState<ApiGitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importingStatus, setImportingStatus] = useState("");

  // Check GitHub connection status when dialog opens
  useEffect(() => {
    if (!open) {
      // Reset state when closing
      setStep("checking");
      setSelectedRepo("");
      setSearchQuery("");
      setError(null);
      setImportingStatus("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGitHubUserStatus();
        if (cancelled) return;

        if (res.data.connected) {
          setGithubUsername(res.data.githubUsername);
          setStep("select");
          // Auto-load repos
          setReposLoading(true);
          try {
            const reposRes = await apiGitHubListRepos();
            if (!cancelled) setRepos(reposRes.data);
          } catch {
            if (!cancelled) setError("Failed to load repositories");
          } finally {
            if (!cancelled) setReposLoading(false);
          }
        } else {
          setStep("connect");
        }
      } catch {
        if (!cancelled) setStep("connect");
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Also check on mount if we just returned from OAuth
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("github_connected")) {
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("github_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, [open]);

  const handleConnect = useCallback(() => {
    if (!user?.id) return;
    const returnUrl = `${window.location.origin}/dashboard?github_connected=1&import=1`;
    window.location.href = getGitHubConnectUrl(user.id, returnUrl);
  }, [user]);

  const handleImport = useCallback(async () => {
    const repo = repos.find((r) => r.fullName === selectedRepo);
    if (!repo) {
      setError("Please select a repository");
      return;
    }

    setStep("importing");
    setError(null);
    const [owner, name] = repo.fullName.split("/");

    try {
      // Step 1: Create the project
      setImportingStatus("Creating project...");
      const activeWsId = typeof window !== "undefined" ? localStorage.getItem("doable_active_workspace_id") ?? undefined : undefined;
      const projectRes = await apiCreateProject({
        name: repo.name,
        description: repo.description ?? `Imported from GitHub: ${repo.fullName}`,
        workspaceId: activeWsId,
      });
      const projectId = projectRes.data.id;

      // Step 2: Clone the repo — must complete before editor opens
      // (editor scaffold would create blank files and conflict with clone)
      setImportingStatus(`Cloning ${repo.fullName}...`);
      await apiImportGitHubRepo(projectId, owner!, name!, repo.defaultBranch);

      // Step 3: Store auto-setup prompt so the AI configures the project
      const setupPrompt = [
        `This project was just imported from GitHub (${repo.fullName}).`,
        `Analyze the project structure and files to understand what kind of project this is.`,
        `Then set it up so it runs correctly in the preview:`,
        `1. Read package.json and key config files to understand the framework and dependencies`,
        `2. Install any missing packages needed`,
        `3. If it's not already a Vite project, adapt it so the preview works (add vite.config if needed, update entry points)`,
        `4. Make sure the app renders correctly in the preview`,
        `Keep all existing code and functionality intact — just make it runnable here.`,
      ].join("\n");
      sessionStorage.setItem(
        `doable_initial_prompt_${projectId}`,
        JSON.stringify({ prompt: setupPrompt })
      );

      // Step 4: Navigate to editor
      onOpenChange(false);
      router.push(`/editor/${projectId}`);
    } catch (err) {
      setStep("select");
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg.includes("already exists")
        ? "This repository was already imported. Check your projects list."
        : msg
      );
    }
  }, [repos, selectedRepo, onOpenChange, router]);

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <GitBranch className="h-5 w-5" />
            Import from GitHub
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Import an existing repository to continue working on it in Doable.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Checking connection */}
        {step === "checking" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {/* Step: Connect GitHub */}
        {step === "connect" && (
          <div className="py-6">
            <div className="rounded-lg border border-zinc-800 border-dashed p-8 text-center">
              <svg
                className="mx-auto h-10 w-10 text-zinc-500"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <h4 className="mt-4 text-sm font-medium text-zinc-200">
                Connect your GitHub account
              </h4>
              <p className="mt-1 text-xs text-zinc-500">
                Authorize Doable to access your repositories.
              </p>
              <Button
                className="mt-4 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                onClick={handleConnect}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Connect with GitHub
              </Button>
            </div>
          </div>
        )}

        {/* Step: Select repository */}
        {step === "select" && (
          <div className="space-y-4">
            {/* Connected user */}
            {githubUsername && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-zinc-400">
                  Connected as{" "}
                  <span className="font-medium text-zinc-200">{githubUsername}</span>
                </span>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
              />
            </div>

            {/* Repo list */}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800">
              {reposLoading ? (
                <div className="flex items-center justify-center gap-2 p-6">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                  <span className="text-sm text-zinc-500">Loading repositories...</span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  {searchQuery
                    ? "No repositories match your search"
                    : "No repositories found"}
                </p>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    className={`flex w-full items-center justify-between border-b border-zinc-800/50 px-4 py-3 text-left last:border-0 transition-colors ${
                      selectedRepo === repo.fullName
                        ? "bg-brand-500/10 border-brand-500/20"
                        : "hover:bg-zinc-800/50"
                    }`}
                    onClick={() => setSelectedRepo(repo.fullName)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {repo.fullName}
                      </p>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-1.5 shrink-0">
                      {repo.private ? (
                        <Lock className="h-3 w-3 text-zinc-500" />
                      ) : (
                        <Globe className="h-3 w-3 text-zinc-500" />
                      )}
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                        {repo.private ? "Private" : "Public"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-800/50 bg-red-900/20 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <ImportingProgress status={importingStatus} />
        )}

        {/* Footer */}
        {step !== "checking" && step !== "importing" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            {step === "select" && (
              <Button
                onClick={() => void handleImport()}
                disabled={!selectedRepo}
                className="bg-brand-600 text-white hover:bg-brand-500"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Import
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
