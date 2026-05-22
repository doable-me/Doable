"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  GitHubRepo,
  SyncStatus,
  SyncResult,
  CommitEntry,
  UseGitHubOpts,
  UseGitHubReturn,
} from "./use-github-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Hook ───────────────────────────────────────────────────

export function useGitHub(opts: UseGitHubOpts): UseGitHubReturn {
  const { projectId, projectPath, userId, accessToken, apiBase = API_URL, githubToken: initialGithubToken } = opts;

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);

  // Track the github token (from OAuth callback URL params or prop)
  const [githubToken, setGithubToken] = useState<string | null>(initialGithubToken ?? null);
  const initialCheckDone = useRef(false);

  // ─── API helper ──────────────────────────────────────────

  const fetchJson = useCallback(
    async <T>(url: string, init?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...((init?.headers as Record<string, string>) ?? {}),
      };

      if (githubToken) {
        headers["X-GitHub-Token"] = githubToken;
      }

      const res = await fetch(`${apiBase}${url}`, {
        ...init,
        headers,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? `Request failed (${res.status})`);
      }

      return json.data as T;
    },
    [apiBase, accessToken, githubToken]
  );

  // ─── Check for OAuth callback params in URL ──────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("githubToken");
    const usernameFromUrl = params.get("githubUsername");

    if (tokenFromUrl) {
      setGithubToken(tokenFromUrl);
      setGithubUsername(usernameFromUrl);
      setIsGitHubConnected(true);

      // Clean the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("githubToken");
      url.searchParams.delete("githubUsername");
      url.searchParams.delete("githubConnected");
      url.searchParams.delete("projectId");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // ─── Check user-level GitHub connection status ───────────

  useEffect(() => {
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;

    (async () => {
      try {
        const data = await fetchJson<{
          connected: boolean;
          githubUsername: string | null;
          tokenExpired?: boolean;
        }>("/github/status");

        setIsGitHubConnected(data.connected);
        if (data.githubUsername) {
          setGithubUsername(data.githubUsername);
        }
      } catch {
        // Not connected or API unavailable
      }
    })();
  }, [fetchJson]);

  // ─── Refresh project sync status ─────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchJson<SyncStatus>(
        `/${projectId}/github/status`
      );
      setStatus(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get status";
      setError(message);
    }
  }, [fetchJson, projectId]);

  // Load project-level status on mount
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // ─── Initiate OAuth ──────────────────────────────────────

  const initiateOAuth = useCallback(() => {
    const returnUrl = `${window.location.origin}/editor/${projectId}`;
    const params = new URLSearchParams({
      projectId,
      userId,
      returnUrl,
    });
    window.location.href = `${apiBase}/github/connect?${params.toString()}`;
  }, [projectId, userId, apiBase]);

  // ─── Load repos ──────────────────────────────────────────

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      const data = await fetchJson<GitHubRepo[]>("/github/repos");
      setRepos(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load repos";
      setError(message);
    } finally {
      setReposLoading(false);
    }
  }, [fetchJson]);

  // ─── Connect project to repo ────────────────────────────

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
        await fetchJson(`/${projectId}/github/connect`, {
          method: "POST",
          body: JSON.stringify({
            repoOwner: connectOpts.repoOwner,
            repoName: connectOpts.repoName,
            branch: connectOpts.branch,
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
    [fetchJson, projectId, projectPath, refreshStatus]
  );

  // ─── Push ────────────────────────────────────────────────

  const push = useCallback(
    async (message: string, force = false): Promise<SyncResult> => {
      setPushing(true);
      setError(null);

      try {
        const result = await fetchJson<SyncResult>(
          `/${projectId}/github/push`,
          {
            method: "POST",
            body: JSON.stringify({ message, projectPath, force }),
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
    [fetchJson, projectId, projectPath, refreshStatus]
  );

  // ─── Pull ────────────────────────────────────────────────

  const pull = useCallback(async (): Promise<SyncResult> => {
    setPulling(true);
    setError(null);

    try {
      const result = await fetchJson<SyncResult>(
        `/${projectId}/github/pull`,
        {
          method: "POST",
          body: JSON.stringify({ projectPath }),
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
  }, [fetchJson, projectId, projectPath, refreshStatus]);

  // ─── Load commit history ─────────────────────────────────

  const loadCommits = useCallback(async () => {
    setCommitsLoading(true);
    try {
      const data = await fetchJson<{
        commits: CommitEntry[];
        total: number;
      }>(`/${projectId}/github/commits`);
      setCommits(data.commits);
    } catch {
      // Silently fail
    } finally {
      setCommitsLoading(false);
    }
  }, [fetchJson, projectId]);

  // ─── Disconnect project ──────────────────────────────────

  const disconnect = useCallback(async () => {
    try {
      await fetchJson(`/${projectId}/github/connect`, {
        method: "DELETE",
      });
      setStatus(null);
      setCommits([]);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnect failed";
      setError(message);
    }
  }, [fetchJson, projectId, refreshStatus]);

  // ─── Disconnect user-level GitHub ────────────────────────

  const disconnectUser = useCallback(async () => {
    try {
      await fetchJson("/github/disconnect", {
        method: "DELETE",
      });
      setIsGitHubConnected(false);
      setGithubUsername(null);
      setGithubToken(null);
      setRepos([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnect failed";
      setError(message);
    }
  }, [fetchJson]);

  // ─── Clear error ──────────────────────────────────────────

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    isGitHubConnected,
    githubUsername,
    repos,
    reposLoading,
    pushing,
    pulling,
    connecting,
    error,
    commits,
    commitsLoading,
    initiateOAuth,
    connect,
    push,
    pull,
    refreshStatus,
    loadRepos,
    loadCommits,
    disconnect,
    disconnectUser,
    clearError,
  };
}
