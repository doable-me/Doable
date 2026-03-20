import type postgres from "postgres";
import type { GitHubConnectionRow, GitHubCommitRow, GitHubUserTokenRow } from "../types.js";

export function githubQueries(sql: postgres.Sql) {
  return {
    // ─── Connections ──────────────────────────────────────────

    async findConnectionByProject(
      projectId: string
    ): Promise<GitHubConnectionRow | undefined> {
      const [conn] = await sql<GitHubConnectionRow[]>`
        SELECT * FROM github_connections WHERE project_id = ${projectId}
      `;
      return conn;
    },

    async findConnectionByRepo(
      repoOwner: string,
      repoName: string
    ): Promise<GitHubConnectionRow | undefined> {
      const [conn] = await sql<GitHubConnectionRow[]>`
        SELECT * FROM github_connections
        WHERE repo_owner = ${repoOwner} AND repo_name = ${repoName}
      `;
      return conn;
    },

    async createConnection(data: {
      projectId: string;
      repoOwner: string;
      repoName: string;
      defaultBranch?: string;
      accessToken: string;
      webhookSecret?: string;
      createdBy: string;
    }): Promise<GitHubConnectionRow> {
      const [conn] = await sql<GitHubConnectionRow[]>`
        INSERT INTO github_connections (
          project_id, repo_owner, repo_name, default_branch,
          access_token, webhook_secret, created_by
        )
        VALUES (
          ${data.projectId},
          ${data.repoOwner},
          ${data.repoName},
          ${data.defaultBranch ?? "main"},
          ${data.accessToken},
          ${data.webhookSecret ?? null},
          ${data.createdBy}
        )
        ON CONFLICT (project_id) DO UPDATE SET
          repo_owner = EXCLUDED.repo_owner,
          repo_name = EXCLUDED.repo_name,
          default_branch = EXCLUDED.default_branch,
          access_token = EXCLUDED.access_token,
          webhook_secret = EXCLUDED.webhook_secret,
          updated_at = now()
        RETURNING *
      `;
      return conn!;
    },

    async updateConnection(
      projectId: string,
      data: Partial<{
        repoOwner: string;
        repoName: string;
        defaultBranch: string;
        accessToken: string;
        webhookSecret: string | null;
        syncStatus: string;
        lastSyncedAt: Date;
      }>
    ): Promise<GitHubConnectionRow | undefined> {
      const values: Record<string, unknown> = {};

      if (data.repoOwner !== undefined) values.repo_owner = data.repoOwner;
      if (data.repoName !== undefined) values.repo_name = data.repoName;
      if (data.defaultBranch !== undefined) values.default_branch = data.defaultBranch;
      if (data.accessToken !== undefined) values.access_token = data.accessToken;
      if (data.webhookSecret !== undefined) values.webhook_secret = data.webhookSecret;
      if (data.syncStatus !== undefined) values.sync_status = data.syncStatus;
      if (data.lastSyncedAt !== undefined) values.last_synced_at = data.lastSyncedAt;

      values.updated_at = new Date();

      if (Object.keys(values).length <= 1) {
        return this.findConnectionByProject(projectId);
      }

      const [conn] = await sql<GitHubConnectionRow[]>`
        UPDATE github_connections
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE project_id = ${projectId}
        RETURNING *
      `;
      return conn;
    },

    async deleteConnection(projectId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM github_connections WHERE project_id = ${projectId}
      `;
      return result.count > 0;
    },

    // ─── Commits ──────────────────────────────────────────────

    async listCommits(
      connectionId: string,
      opts: { page?: number; pageSize?: number } = {}
    ): Promise<{ rows: GitHubCommitRow[]; total: number }> {
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM github_commits
        WHERE connection_id = ${connectionId}
      `;

      const rows = await sql<GitHubCommitRow[]>`
        SELECT * FROM github_commits
        WHERE connection_id = ${connectionId}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    async createCommit(data: {
      connectionId: string;
      sha: string;
      message: string;
      author: string;
      branch: string;
      direction: "push" | "pull";
      versionId?: string;
    }): Promise<GitHubCommitRow> {
      const [commit] = await sql<GitHubCommitRow[]>`
        INSERT INTO github_commits (
          connection_id, sha, message, author, branch, direction, version_id
        )
        VALUES (
          ${data.connectionId},
          ${data.sha},
          ${data.message},
          ${data.author},
          ${data.branch},
          ${data.direction},
          ${data.versionId ?? null}
        )
        RETURNING *
      `;
      return commit!;
    },

    async findCommitBySha(sha: string): Promise<GitHubCommitRow | undefined> {
      const [commit] = await sql<GitHubCommitRow[]>`
        SELECT * FROM github_commits WHERE sha = ${sha}
      `;
      return commit;
    },

    // ─── User Tokens (OAuth-based GitHub connection per user) ──

    async findUserToken(
      userId: string
    ): Promise<GitHubUserTokenRow | undefined> {
      const [row] = await sql<GitHubUserTokenRow[]>`
        SELECT * FROM github_user_tokens WHERE user_id = ${userId}
      `;
      return row;
    },

    async upsertUserToken(data: {
      userId: string;
      githubUsername: string;
      githubId?: string;
      accessToken: string;
      scopes?: string;
    }): Promise<GitHubUserTokenRow> {
      const [row] = await sql<GitHubUserTokenRow[]>`
        INSERT INTO github_user_tokens (
          user_id, github_username, github_id, access_token, scopes
        )
        VALUES (
          ${data.userId},
          ${data.githubUsername},
          ${data.githubId ?? null},
          ${data.accessToken},
          ${data.scopes ?? "repo"}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          github_username = EXCLUDED.github_username,
          github_id = EXCLUDED.github_id,
          access_token = EXCLUDED.access_token,
          scopes = EXCLUDED.scopes,
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async deleteUserToken(userId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM github_user_tokens WHERE user_id = ${userId}
      `;
      return result.count > 0;
    },
  };
}
