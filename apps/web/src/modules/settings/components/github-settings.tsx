"use client";

import { useState, useCallback, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────
interface SyncStatus { connected: boolean; status: string; lastSyncedAt: string | null; repoUrl: string | null; branch: string; }
interface CommitEntry { id: string; sha: string; message: string; author: string; branch: string; direction: "push" | "pull"; createdAt: string; }
interface GitHubSettingsProps { projectId: string; apiBase?: string; githubToken?: string; }

// ─── Component ──────────────────────────────────────────────

export function GitHubSettings({
  projectId,
  apiBase = "/api",
  githubToken,
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
          ...(githubToken ? { "X-GitHub-Token": githubToken } : {}),
          ...init?.headers,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Request failed");
      return json.data as T;
    },
    [apiBase, githubToken]
  );

  // ─── Load status ──────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchJson<SyncStatus>(
        `/projects/${projectId}/github/status`
      );
      setStatus(data);
    } catch {
      // Not connected
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [fetchJson, projectId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // ─── Push ─────────────────────────────────────────────────

  const handlePush = useCallback(async () => {
    if (!commitMessage.trim()) return;

    setPushing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<{ filesChanged: number; commitSha: string }>(
        `/projects/${projectId}/github/push`,
        {
          method: "POST",
          body: JSON.stringify({
            message: commitMessage,
            userId: "current-user", // Would come from auth context
            projectPath: `/projects/${projectId}/files`,
          }),
        }
      );

      setCommitMessage("");
      setSuccessMessage(
        `Pushed ${result.filesChanged} files (${result.commitSha.slice(0, 7)})`
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }, [commitMessage, fetchJson, projectId, loadStatus]);

  // ─── Pull ─────────────────────────────────────────────────

  const handlePull = useCallback(async () => {
    setPulling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await fetchJson<{ filesChanged: number }>(
        `/projects/${projectId}/github/pull`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: "current-user",
            projectPath: `/projects/${projectId}/files`,
          }),
        }
      );

      setSuccessMessage(`Pulled ${result.filesChanged} files`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  }, [fetchJson, projectId, loadStatus]);

  // ─── Disconnect ───────────────────────────────────────────

  const handleDisconnect = useCallback(async () => {
    setError(null);
    try {
      await fetchJson(`/projects/${projectId}/github/connect`, {
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
                    {status.repoUrl.replace("https://github.com/", "")}
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
              {commits.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 mb-1">
                  <div>
                    <p className="text-sm">{c.message}</p>
                    <p className="text-xs text-muted-foreground">{c.sha.slice(0, 7)} by {c.author}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.direction === "push" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>{c.direction}</span>
                </div>
              ))}
            </div>
          )}
          {/* Disconnect */}
          <div className="flex items-center justify-between rounded-lg border border-red-200 p-4">
            <div>
              <h4 className="text-sm font-medium text-red-800">Disconnect Repository</h4>
              <p className="mt-1 text-xs text-muted-foreground">Removes the connection. Your code will not be deleted.</p>
            </div>
            <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={() => void handleDisconnect()}>Disconnect</button>
          </div>
        </>
      )}
    </div>
  );
}
