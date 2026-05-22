import { apiFetch } from "./api-core";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── GitHub Types ──────────────────────────────────────────

export interface ApiGitHubUserStatus {
  connected: boolean;
  githubUsername: string | null;
  tokenExpired?: boolean;
}

export interface ApiGitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
}

// ─── GitHub API Methods ────────────────────────────────────

export async function apiGitHubUserStatus(): Promise<{ data: ApiGitHubUserStatus }> {
  return apiFetch("/github/status");
}

export async function apiGitHubListRepos(): Promise<{ data: ApiGitHubRepo[] }> {
  return apiFetch("/github/repos");
}

export async function apiGitHubDisconnect(): Promise<{ data: { disconnected: true } }> {
  return apiFetch("/github/disconnect", { method: "DELETE" });
}

export async function apiImportGitHubRepo(
  projectId: string,
  repoOwner: string,
  repoName: string,
  branch: string
): Promise<{ data: { filesChanged: number; commitSha: string } }> {
  return apiFetch(`/${projectId}/github/import`, {
    method: "POST",
    body: JSON.stringify({ repoOwner, repoName, branch }),
  });
}

export function getGitHubConnectUrl(userId: string, returnUrl: string): string {
  return `${API_URL}/github/connect?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl)}`;
}
