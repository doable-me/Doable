"use client";

import { useState, useCallback, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────

interface SyncStatus {
  connected: boolean;
  status: string;
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
  repoOwner: string | null;
  repoName: string | null;
}

interface CommitEntry {
  id: string;
  sha: string;
  message: string;
  author: string;
  branch: string;
  direction: "push" | "pull";
  createdAt: string;
}

interface GitHubSettingsProps {
  projectId: string;
  accessToken: string;
  apiBase?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Component ──────────────────────────────────────────────

export function GitHubSettings({
  projectId,
  accessToken,
  apiBase = API_URL,
}: GitHubSettingsProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchJson = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`${apiBase}${url}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...((init?.headers as Record<string, string>) ?? {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Request failed");
      return json.data as T;
    },
    [apiBase, accessToken]
  );

  // ─── Load status ──────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchJson<SyncStatus>(
        `/${projectId}/github/status`
      );
      setStatus(data);
    } catch {
      // Not connected
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [fetchJson, projectId]);

  // ─── Load commit history ──────────────────────────────────

  const loadCommits = useCallback(async () => {
    try {
      const data = await fetchJson<{
        commits: CommitEntry[];
        total: number;
      }>(`/${projectId}/github/commits`);
      setCommits(data.commits);
    } catch {
      // Silently fail
    }
  }, [fetchJson, projectId]);

  useEffect(() => {
    void loadStatus();
    void loadCommits();
  }, [loadStatus, loadCommits]);

  // ─── Push ─────────────────────────────────────────────────

  const handlePush = useCallback(async (force = false) => {
    if (!commitMessage.trim()) return;

    setPushing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<{ filesChanged: number; commitSha: string }>(
        `/${projectId}/github/push`,
        {
          method: "POST",
          body: JSON.stringify({
            message: commitMessage,
            projectPath: `/projects/${projectId}/files`,
            force,
          }),
        }
      );

      setCommitMessage("");
      setSuccessMessage(
        `Pushed ${result.filesChanged} files (${result.commitSha.slice(0, 7)})`
      );
      await loadStatus();
      await loadCommits();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      setError(message);
    } finally {
      setPushing(false);
    }
  }, [commitMessage, fetchJson, projectId, loadStatus, loadCommits]);

  // ─── Pull ─────────────────────────────────────────────────

  const handlePull = useCallback(async () => {
    setPulling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<{ filesChanged: number }>(
        `/${projectId}/github/pull`,
        {
          method: "POST",
          body: JSON.stringify({
            projectPath: `/projects/${projectId}/files`,
          }),
        }
      );

      setSuccessMessage(`Pulled ${result.filesChanged} files`);
      await loadStatus();
      await loadCommits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  }, [fetchJson, projectId, loadStatus, loadCommits]);

  // ─── Disconnect ───────────────────────────────────────────

  const handleDisconnect = useCallback(async () => {
    setError(null);
    try {
      await fetchJson(`/${projectId}/github/connect`, {
        method: "DELETE",
      });
      setStatus(null);
      setCommits([]);
      setSuccessMessage("Disconnected from GitHub");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    }
  }, [fetchJson, projectId]);

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">Loading GitHub settings...</p>
      </div>
    );
  }

  const isDiverged = status?.status === "diverged" || status?.status === "conflict";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">GitHub Integration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your project to GitHub for version control and collaboration.
        </p>
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
          {isDiverged && (
            <button
              className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              onClick={() => void handlePush(true)}
              disabled={pushing || !commitMessage.trim()}
            >
              Force Push (overwrite remote)
            </button>
          )}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {!status?.connected ? (
        /* Not connected state */
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h4 className="text-sm font-medium">Not connected to GitHub</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect to push and pull code, track changes, and collaborate.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Use the GitHub button in the editor toolbar to connect this project.
          </p>
        </div>
      ) : (
        /* Connected state */
        <>
          {/* Connection info */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Connected Repository</p>
                {status.repoUrl && (
                  <a
                    href={status.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-sm text-primary hover:underline"
                  >
                    {status.repoOwner}/{status.repoName}
                  </a>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status.status === "synced"
                        ? "bg-green-500"
                        : status.status === "behind"
                          ? "bg-amber-500"
                          : status.status === "diverged" || status.status === "conflict"
                            ? "bg-red-500"
                            : "bg-gray-400"
                    }`}
                  />
                  <span className="text-xs font-medium capitalize">
                    {status.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Branch: {status.branch}
                </p>
              </div>
            </div>

            {status.lastSyncedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Push */}
          <div className="rounded-lg border p-4">
            <h4 className="text-sm font-medium">Push to GitHub</h4>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handlePush();
                }}
              />
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={() => void handlePush()}
                disabled={pushing || !commitMessage.trim()}
              >
                {pushing ? "Pushing..." : "Push"}
              </button>
            </div>
          </div>

          {/* Pull */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Pull from GitHub</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Download the latest changes from the remote repository.
                </p>
              </div>
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                onClick={() => void handlePull()}
                disabled={pulling}
              >
                {pulling ? "Pulling..." : "Pull"}
              </button>
            </div>
          </div>

          {/* Commit history */}
          {commits.length > 0 && (
            <div className="rounded-lg border p-4">
              <h4 className="mb-3 text-sm font-medium">Recent Sync History</h4>
              <div className="space-y-1">
                {commits.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.sha.slice(0, 7)} by {c.author} &middot;{" "}
                        {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.direction === "push"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {c.direction}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disconnect */}
          <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
            <div>
              <h4 className="text-sm font-medium text-red-800">
                Disconnect Repository
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Removes the connection. Your code will not be deleted.
              </p>
            </div>
            <button
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
