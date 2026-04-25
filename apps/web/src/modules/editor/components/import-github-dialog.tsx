"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Search, Lock, Globe } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
}

interface ImportGitHubDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (opts: {
    repoOwner: string;
    repoName: string;
    branch: string;
  }) => Promise<void>;
  onInitiateOAuth: () => void;
  repos: GitHubRepo[];
  reposLoading: boolean;
  githubUsername: string | null;
  isGitHubConnected: boolean;
  onLoadRepos: () => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────

export function ImportGitHubDialog({
  open,
  onClose,
  onImport,
  onInitiateOAuth,
  repos,
  reposLoading,
  githubUsername,
  isGitHubConnected,
  onLoadRepos,
}: ImportGitHubDialogProps) {
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load repos when dialog opens and user is connected
  useEffect(() => {
    if (open && isGitHubConnected && repos.length === 0 && !reposLoading) {
      void onLoadRepos();
    }
  }, [open, isGitHubConnected, repos.length, reposLoading, onLoadRepos]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedRepo("");
      setError(null);
      setSearchQuery("");
    }
  }, [open]);

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !importing) onClose();
    },
    [onClose, importing]
  );

  const handleImport = useCallback(async () => {
    setError(null);
    setImporting(true);

    try {
      const repo = repos.find((r) => r.fullName === selectedRepo);
      if (!repo) {
        setError("Please select a repository");
        setImporting(false);
        return;
      }
      const [owner, name] = repo.fullName.split("/");
      await onImport({
        repoOwner: owner!,
        repoName: name!,
        branch: repo.defaultBranch,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Import failed";
      setError(message);
    } finally {
      setImporting(false);
    }
  }, [repos, selectedRepo, onImport, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Import from GitHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Import an existing repository to continue working on it in Doable.
          </p>
        </div>

        {/* Not connected -- show OAuth button */}
        {!isGitHubConnected ? (
          <div className="p-6">
            <div className="rounded-lg border border-dashed p-8 text-center">
              <svg
                className="mx-auto h-10 w-10 text-muted-foreground"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <h4 className="mt-4 text-sm font-medium">
                Connect your GitHub account
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Authorize Doable to access your repositories.
              </p>
              <button
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={onInitiateOAuth}
              >
                Connect with GitHub
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Connected user info */}
            <div className="border-b px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-muted-foreground">
                  Connected as{" "}
                  <span className="font-medium text-foreground">
                    {githubUsername}
                  </span>
                </span>
              </div>
            </div>

            {/* Repo picker */}
            <div className="p-6">
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto rounded-md border">
                  {reposLoading ? (
                    <div className="flex items-center justify-center gap-2 p-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Loading repositories...
                      </span>
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      {searchQuery
                        ? "No repositories match your search"
                        : "No repositories found"}
                    </p>
                  ) : (
                    filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        className={`flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-0 transition-colors ${
                          selectedRepo === repo.fullName
                            ? "bg-primary/5 border-primary/20"
                            : "hover:bg-accent/50"
                        }`}
                        onClick={() => setSelectedRepo(repo.fullName)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {repo.fullName}
                          </p>
                          {repo.description && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {repo.description}
                            </p>
                          )}
                        </div>
                        <div className="ml-2 flex items-center gap-1.5">
                          {repo.private ? (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                            {repo.private ? "Private" : "Public"}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                onClick={onClose}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={() => void handleImport()}
                disabled={importing || !selectedRepo}
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importing...
                  </span>
                ) : (
                  "Import Repository"
                )}
              </button>
            </div>
          </>
        )}

        {/* Close button for non-connected state */}
        {!isGitHubConnected && (
          <div className="flex justify-end border-t px-6 py-4">
            <button
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
