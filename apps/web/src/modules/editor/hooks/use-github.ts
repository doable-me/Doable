"use client";

import { useState, useCallback, useEffect } from "react";

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

interface SyncStatus {
  connected: boolean;
  status: "synced" | "ahead" | "behind" | "diverged" | "disconnected";
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
}

interface SyncResult {
  direction: "push" | "pull";
  commitSha: string;
  message: string;
  filesChanged: number;
}

interface UseGitHubOpts {
  projectId: string;
  projectPath: string;
  userId: string;
  apiBase?: string;
  githubToken?: string;
}

interface UseGitHubReturn {
  status: SyncStatus | null;
  repos: GitHubRepo[];
  reposLoading: boolean;
  githubUser: string | null;
  pushing: boolean;
  pulling: boolean;
  connecting: boolean;
  error: string | null;
  connect: (opts: {
    repoOwner: string;
    repoName: string;
    branch: string;
    createNew: boolean;
    isPrivate: boolean;
    description: string;
  }) => Promise<void>;
  push: (message: string) => Promise<SyncResult>;
  pull: () => Promise<SyncResult>;
  refreshStatus: () => Promise<void>;
  loadRepos: () => Promise<void>;
  disconnect: () => Promise<void>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useGitHub(opts: UseGitHubOpts): UseGitHubReturn {
  const { projectId, projectPath, userId, apiBase = "/api", githubToken } = opts;

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJson = useCallback(
    async <T>(url: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`${apiBase}${url}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(githubToken ? { "X-GitHub-Token": githubToken } : {}),
          ...init?.headers,
        },
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? `Request failed (${res.status})`);
      }

      return json.data as T;
    },
    [apiBase, githubToken]
  );

  // ─── Refresh sync status ──────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchJson<SyncStatus>(
        `/projects/${projectId}/github/status`
      );
      setStatus(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get status";
      setError(message);
    }
  }, [fetchJson, projectId]);

  // Load status on mount
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // ─── Load repos ──────────────────────────────────────────

  const loadRepos = useCallback(async () => {
    if (!githubToken) return;

    setReposLoading(true);
    try {
      const data = await fetchJson<GitHubRepo[]>("/github/repos");
      setRepos(data);

      // Also get the authenticated user
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${githubToken}` },
      });
      if (res.ok) {
        const user = (await res.json()) as { login: string };
        setGithubUser(user.login);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load repos";
      setError(message);
    } finally {
      setReposLoading(false);
    }
  }, [fetchJson, githubToken]);

  // ─── Connect ─────────────────────────────────────────────

  const connect = useCallback(
    async (connectOpts: {
      repoOwner: string;
      repoName: string;
      branch: string;
      createNew: boolean;
      isPrivate: boolean;
      description: string;
    }) => {
      setConnecting(true);
      setError(null);

      try {
        await fetchJson(`/projects/${projectId}/github/connect`, {
          method: "POST",
          body: JSON.stringify({
            token: githubToken,
            repoOwner: connectOpts.repoOwner,
            repoName: connectOpts.repoName,
            branch: connectOpts.branch,
            userId,
            projectPath,
            createNew: connectOpts.createNew,
            isPrivate: connectOpts.isPrivate,
            description: connectOpts.description,
          }),
        });

        await refreshStatus();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        setError(message);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [fetchJson, projectId, githubToken, userId, projectPath, refreshStatus]
  );

  // ─── Push ────────────────────────────────────────────────

  const push = useCallback(
    async (message: string): Promise<SyncResult> => {
      setPushing(true);
      setError(null);

      try {
        const result = await fetchJson<SyncResult>(
          `/projects/${projectId}/github/push`,
          {
            method: "POST",
            body: JSON.stringify({ message, userId, projectPath }),
          }
        );

        await refreshStatus();
        return result;
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "Push failed";
        setError(errMessage);
        throw err;
      } finally {
        setPushing(false);
      }
    },
    [fetchJson, projectId, userId, projectPath, refreshStatus]
  );

  // ─── Pull ────────────────────────────────────────────────

  const pull = useCallback(async (): Promise<SyncResult> => {
    setPulling(true);
    setError(null);

    try {
      const result = await fetchJson<SyncResult>(
        `/projects/${projectId}/github/pull`,
        {
          method: "POST",
          body: JSON.stringify({ userId, projectPath }),
        }
      );

      await refreshStatus();
      return result;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Pull failed";
      setError(errMessage);
      throw err;
    } finally {
      setPulling(false);
    }
  }, [fetchJson, projectId, userId, projectPath, refreshStatus]);

  // ─── Disconnect ──────────────────────────────────────────

  const disconnect = useCallback(async () => {
    try {
      await fetchJson(`/projects/${projectId}/github/connect`, {
        method: "DELETE",
      });
      setStatus(null);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnect failed";
      setError(message);
    }
  }, [fetchJson, projectId, refreshStatus]);

  return {
    status,
    repos,
    reposLoading,
    githubUser,
    pushing,
    pulling,
    connecting,
    error,
    connect,
    push,
    pull,
    refreshStatus,
    loadRepos,
    disconnect,
  };
}
