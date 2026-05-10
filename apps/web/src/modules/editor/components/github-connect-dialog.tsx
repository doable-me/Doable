"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Lock, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface GitHubConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (opts: {
    repoOwner: string;
    repoName: string;
    branch: string;
    createNew: boolean;
    isPrivate: boolean;
    description: string;
  }) => Promise<void>;
  onInitiateOAuth: () => void;
  /** Drop the current user-level GitHub OAuth token then re-launch OAuth so
   * the user can sign in as a different GitHub account. Optional — when
   * absent, no Switch-account control is shown. */
  onSwitchAccount?: () => Promise<void>;
  repos: never[];
  reposLoading: boolean;
  githubUsername: string | null;
  isGitHubConnected: boolean;
  onLoadRepos: () => Promise<void>;
  /** Project name — used to auto-generate repo name */
  projectName?: string;
  /** Project description — used to pre-fill repo description */
  projectDescription?: string;
}

// ─── Helpers ────────────────────────────────────────────────

function slugifyRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "my-project";
}

// ─── Component ──────────────────────────────────────────────

export function GitHubConnectDialog({
  open,
  onClose,
  onConnect,
  onInitiateOAuth,
  onSwitchAccount,
  githubUsername,
  isGitHubConnected,
  projectName,
  projectDescription,
}: GitHubConnectDialogProps) {
  const autoRepoName = slugifyRepoName(projectName ?? "my-project");

  const [repoName, setRepoName] = useState(autoRepoName);
  const [description, setDescription] = useState(projectDescription ?? "");
  const [isPrivate, setIsPrivate] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSwitchAccount = useCallback(async () => {
    if (!onSwitchAccount) return;
    if (!confirm(
      `Disconnect ${githubUsername ? `@${githubUsername}` : "your GitHub account"} and connect a different one?\n\n` +
      "Existing project-to-repo links won't be deleted, but new pushes/pulls will use the next account you sign in with.",
    )) return;
    setSwitching(true);
    setError(null);
    try {
      await onSwitchAccount();
    } catch (err) {
      setSwitching(false);
      setError(err instanceof Error ? err.message : "Failed to switch account");
    }
  }, [onSwitchAccount, githubUsername]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRepoName(autoRepoName);
      setDescription(projectDescription ?? "");
      setIsPrivate(true);
      setConnecting(false);
      setError(null);
      setShowAdvanced(false);
    }
  }, [open, autoRepoName, projectDescription]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !connecting) onClose();
    },
    [onClose, connecting]
  );

  const handleConnect = useCallback(async () => {
    if (!githubUsername) return;
    setError(null);
    setConnecting(true);

    try {
      const name = repoName.trim() || autoRepoName;
      await onConnect({
        repoOwner: githubUsername,
        repoName: name,
        branch: "main",
        createNew: true,
        isPrivate,
        description,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
    } finally {
      setConnecting(false);
    }
  }, [
    githubUsername,
    repoName,
    autoRepoName,
    isPrivate,
    description,
    onConnect,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Connect to GitHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Push this project to a GitHub repository.
          </p>
        </div>

        {/* Not connected — show OAuth button */}
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
                Authorize Doable to access your repositories so you can push and
                pull code.
              </p>
              <button
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={onInitiateOAuth}
              >
                Connect with GitHub
              </button>
            </div>

            <div className="flex justify-end border-t mt-6 pt-4">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Connected — show one-click create */}
            <div className="p-6 space-y-4">
              {/* Connected user */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">
                    Connected as{" "}
                    <span className="font-medium text-foreground">
                      {githubUsername}
                    </span>
                  </span>
                </div>
                {onSwitchAccount && (
                  <button
                    type="button"
                    onClick={() => void handleSwitchAccount()}
                    disabled={switching || connecting}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                    title="Disconnect this GitHub account and connect a different one"
                  >
                    {switching ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Disconnecting…
                      </span>
                    ) : (
                      "Switch account"
                    )}
                  </button>
                )}
              </div>

              {/* Repo preview — shows what will be created */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono font-medium">
                    {githubUsername}/{repoName || autoRepoName}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                    {isPrivate ? "Private" : "Public"}
                  </span>
                </div>
                {description && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {/* Advanced options (collapsed by default) */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Customize name & settings
              </button>

              {showAdvanced && (
                <div className="space-y-3 rounded-md border p-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Repository Name
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {githubUsername}/
                      </span>
                      <input
                        type="text"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                        placeholder={autoRepoName}
                        className="flex-1 rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A brief description"
                      className="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!isPrivate}
                      onChange={(e) => setIsPrivate(!e.target.checked)}
                      className="rounded border"
                    />
                    <span className="text-xs">Make repository public</span>
                  </label>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                onClick={onClose}
                disabled={connecting}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={() => void handleConnect()}
                disabled={connecting}
              >
                {connecting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create & Connect"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
