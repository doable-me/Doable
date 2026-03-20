// ─── Types ──────────────────────────────────────────────────
export interface GitHubRepo {
  id: number; name: string; fullName: string; private: boolean;
  htmlUrl: string; defaultBranch: string; description: string | null;
}
export interface GitHubCommit {
  sha: string; message: string; author: string; date: string; htmlUrl: string;
}
export interface GitHubBranch { name: string; sha: string; protected: boolean; }
interface GitHubTreeEntry {
  path: string; mode: string; type: "blob" | "tree"; content?: string; sha?: string;
}

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
    auto_init: true,
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

export async function createCommit(
  token: string,
  owner: string,
  repo: string,
  opts: {
    branch: string;
    message: string;
    files: Array<{ path: string; content: string }>;
  }
): Promise<GitHubCommit> {
  // 1. Get the latest commit SHA on the branch
  const refData = await request<{ object: { sha: string } }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${opts.branch}`
  );
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA from the latest commit
  const commitData = await request<{ tree: { sha: string } }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`
  );
  const baseTreeSha = commitData.tree.sha;

  // 3. Create blobs for each file
  const treeEntries: GitHubTreeEntry[] = [];
  for (const file of opts.files) {
    const blob = await request<{ sha: string }>(
      token,
      "POST",
      `/repos/${owner}/${repo}/git/blobs`,
      { content: file.content, encoding: "utf-8" }
    );
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // 4. Create a new tree
  const newTree = await request<{ sha: string }>(
    token,
    "POST",
    `/repos/${owner}/${repo}/git/trees`,
    { base_tree: baseTreeSha, tree: treeEntries }
  );

  // 5. Create the commit
  const newCommit = await request<{
    sha: string;
    message: string;
    author: { name: string; date: string };
    html_url: string;
  }>(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
    message: opts.message,
    tree: newTree.sha,
    parents: [latestCommitSha],
  });

  // 6. Update the branch reference
  await request(
    token,
    "PATCH",
    `/repos/${owner}/${repo}/git/refs/heads/${opts.branch}`,
    { sha: newCommit.sha }
  );

  return {
    sha: newCommit.sha,
    message: newCommit.message,
    author: newCommit.author.name,
    date: newCommit.author.date,
    htmlUrl: newCommit.html_url ?? "",
  };
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

// ─── Latest Commit SHA ──────────────────────────────────────

export async function getLatestCommitSha(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  const refData = await request<{ object: { sha: string } }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`
  );
  return refData.object.sha;
}

// ─── Contents ───────────────────────────────────────────────

export async function getRepoContents(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<Array<{ path: string; content: string }>> {
  // Get the full tree recursively
  const refData = await request<{ object: { sha: string } }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`
  );

  const tree = await request<{
    tree: Array<{ path: string; type: string; sha: string }>;
  }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/trees/${refData.object.sha}?recursive=1`
  );

  const files: Array<{ path: string; content: string }> = [];

  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;

    const ext = entry.path.substring(entry.path.lastIndexOf(".")).toLowerCase();
    const skip = new Set([".png",".jpg",".jpeg",".gif",".ico",".woff",".woff2",".ttf",".eot",".mp4",".webm",".mp3",".zip",".tar",".gz"]);
    if (skip.has(ext)) continue;

    try {
      const blob = await request<{ content: string; encoding: string }>(
        token,
        "GET",
        `/repos/${owner}/${repo}/git/blobs/${entry.sha}`
      );

      if (blob.encoding === "base64") {
        files.push({
          path: entry.path,
          content: Buffer.from(blob.content, "base64").toString("utf-8"),
        });
      }
    } catch {
      // Skip files that fail to fetch
    }
  }

  return files;
}
