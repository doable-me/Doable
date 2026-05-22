// ─── Types ──────────────────────────────────────────────────
export interface GitHubRepo {
  id: number; name: string; fullName: string; private: boolean;
  htmlUrl: string; defaultBranch: string; description: string | null;
}
export interface GitHubCommit {
  sha: string; message: string; author: string; date: string; htmlUrl: string;
}
export interface GitHubBranch { name: string; sha: string; protected: boolean; }

const GITHUB_API = "https://api.github.com";

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`GitHub API error (${res.status}): ${error?.message ?? res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── Authentication ─────────────────────────────────────────

export async function authenticate(
  token: string
): Promise<{ login: string; id: number }> {
  return request(token, "GET", "/user");
}

// ─── Repositories ───────────────────────────────────────────

export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const repos = await request<
    Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
      default_branch: string;
      description: string | null;
    }>
  >(token, "GET", "/user/repos?sort=updated&per_page=100");

  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    description: r.description,
  }));
}

export async function createRepo(
  token: string,
  opts: { name: string; description?: string; isPrivate?: boolean }
): Promise<GitHubRepo> {
  const repo = await request<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    default_branch: string;
    description: string | null;
  }>(token, "POST", "/user/repos", {
    name: opts.name,
    description: opts.description ?? "",
    private: opts.isPrivate ?? true,
    auto_init: false,
  });

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    description: repo.description,
  };
}

/**
 * Create a new repo, or if it already exists under the authenticated user,
 * return the existing one. Avoids 422 "name already exists" errors.
 */
export async function createOrGetRepo(
  token: string,
  owner: string,
  opts: { name: string; description?: string; isPrivate?: boolean }
): Promise<{ repo: GitHubRepo; alreadyExisted: boolean }> {
  try {
    const repo = await createRepo(token, opts);
    return { repo, alreadyExisted: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // 422 = name already taken — try to get the existing repo
    if (message.includes("422")) {
      try {
        const existing = await getRepo(token, owner, opts.name);
        return { repo: existing, alreadyExisted: true };
      } catch {
        // Can't access the repo — it might belong to an org or be deleted
        throw new Error(
          `Repository "${opts.name}" already exists but could not be accessed. ` +
          `Try a different name.`
        );
      }
    }
    throw err;
  }
}

// ─── Commits ────────────────────────────────────────────────

export async function getCommits(
  token: string,
  owner: string,
  repo: string,
  opts: { branch?: string; perPage?: number } = {}
): Promise<GitHubCommit[]> {
  const branch = opts.branch ?? "main";
  const perPage = opts.perPage ?? 30;

  const commits = await request<
    Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string };
      };
      html_url: string;
    }>
  >(
    token,
    "GET",
    `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`
  );

  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    htmlUrl: c.html_url,
  }));
}

// ─── Branches ───────────────────────────────────────────────

export async function getBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubBranch[]> {
  const branches = await request<
    Array<{
      name: string;
      commit: { sha: string };
      protected: boolean;
    }>
  >(token, "GET", `/repos/${owner}/${repo}/branches`);

  return branches.map((b) => ({
    name: b.name,
    sha: b.commit.sha,
    protected: b.protected,
  }));
}

// ─── Repository Details ─────────────────────────────────────

export async function getRepo(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRepo> {
  const r = await request<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    default_branch: string;
    description: string | null;
  }>(token, "GET", `/repos/${owner}/${repo}`);

  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    description: r.description,
  };
}
