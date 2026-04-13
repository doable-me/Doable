export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
}

export interface SyncStatus {
  connected: boolean;
  status: "synced" | "ahead" | "behind" | "diverged" | "conflict" | "disconnected";
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
  repoOwner: string | null;
  repoName: string | null;
  lastCommitSha: string | null;
}

export interface SyncResult {
  direction: "push" | "pull";
  commitSha: string;
  message: string;
  filesChanged: number;
}

export interface CommitEntry {
  id: string;
  sha: string;
  message: string;
  author: string;
  branch: string;
  direction: "push" | "pull";
  createdAt: string;
}

export interface UseGitHubOpts {
  projectId: string;
  projectPath: string;
  userId: string;
  accessToken: string;
  apiBase?: string;
  githubToken?: string | null;
}

export interface UseGitHubReturn {
  // Connection status
  status: SyncStatus | null;
  isGitHubConnected: boolean;
  githubUsername: string | null;

  // Repos
  repos: GitHubRepo[];
  reposLoading: boolean;

  // Operations
  pushing: boolean;
  pulling: boolean;
  connecting: boolean;
  error: string | null;

  // Commit history
  commits: CommitEntry[];
  commitsLoading: boolean;

  // Actions
  initiateOAuth: () => void;
  connect: (opts: {
    repoOwner: string;
    repoName: string;
    branch: string;
    createNew: boolean;
    isPrivate: boolean;
    description: string;
  }) => Promise<void>;
  push: (message: string, force?: boolean) => Promise<SyncResult>;
  pull: () => Promise<SyncResult>;
  refreshStatus: () => Promise<void>;
  loadRepos: () => Promise<void>;
  loadCommits: () => Promise<void>;
  disconnect: () => Promise<void>;
  disconnectUser: () => Promise<void>;
  clearError: () => void;
}
