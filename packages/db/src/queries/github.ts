import type postgres from "postgres";
import type { GitHubConnectionRow, GitHubCommitRow, GitHubUserTokenRow } from "../types.js";
import { getEncryptionKey } from "../secrets.js";

const ENCRYPTION_KEY = getEncryptionKey();

export function githubQueries(sql: postgres.Sql) {
  return {
    // ─── Connections ──────────────────────────────────────────

    async findConnectionByProject(
      projectId: string
    ): Promise<GitHubConnectionRow | undefined> {
      const [conn] = await sql<GitHubConnectionRow[]>`
        SELECT *,
          pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token,
          CASE WHEN webhook_secret_encrypted IS NOT NULL
            THEN pgp_sym_decrypt(webhook_secret_encrypted::bytea, ${ENCRYPTION_KEY})
            ELSE NULL
          END AS webhook_secret
        FROM github_connections WHERE project_id = ${projectId}
      `;
      return conn;
    },

    async findConnectionByRepo(
      repoOwner: string,
      repoName: string
    ): Promise<GitHubConnectionRow | undefined> {
      const [conn] = await sql<GitHubConnectionRow[]>`
        SELECT *,
          pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token,
          CASE WHEN webhook_secret_encrypted IS NOT NULL
            THEN pgp_sym_decrypt(webhook_secret_encrypted::bytea, ${ENCRYPTION_KEY})
            ELSE NULL
          END AS webhook_secret
        FROM github_connections
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
          access_token_encrypted, webhook_secret_encrypted, created_by
        )
        VALUES (
          ${data.projectId},
          ${data.repoOwner},
          ${data.repoName},
          ${data.defaultBranch ?? "main"},
          pgp_sym_encrypt(${data.accessToken}, ${ENCRYPTION_KEY}),
          ${data.webhookSecret ? sql`pgp_sym_encrypt(${data.webhookSecret}, ${ENCRYPTION_KEY})` : null},
          ${data.createdBy}
        )
        ON CONFLICT (project_id) DO UPDATE SET
          repo_owner = EXCLUDED.repo_owner,
          repo_name = EXCLUDED.repo_name,
          default_branch = EXCLUDED.default_branch,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
          updated_at = now()
        RETURNING *,
          pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token,
          CASE WHEN webhook_secret_encrypted IS NOT NULL
            THEN pgp_sym_decrypt(webhook_secret_encrypted::bytea, ${ENCRYPTION_KEY})
            ELSE NULL
          END AS webhook_secret
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
      // For encrypted fields, we need to use raw SQL with pgp_sym_encrypt
      // For other fields, we can use the regular update pattern
      const setClauses: string[] = [];
      const nonEncryptedValues: Record<string, unknown> = {};

      if (data.repoOwner !== undefined) nonEncryptedValues.repo_owner = data.repoOwner;
      if (data.repoName !== undefined) nonEncryptedValues.repo_name = data.repoName;
      if (data.defaultBranch !== undefined) nonEncryptedValues.default_branch = data.defaultBranch;
      if (data.syncStatus !== undefined) nonEncryptedValues.sync_status = data.syncStatus;
      if (data.lastSyncedAt !== undefined) nonEncryptedValues.last_synced_at = data.lastSyncedAt;

      nonEncryptedValues.updated_at = new Date();

      // Handle encrypted fields separately
      const hasEncryptedUpdate = data.accessToken !== undefined || data.webhookSecret !== undefined;
      const hasNonEncryptedUpdate = Object.keys(nonEncryptedValues).length > 1; // > 1 because updated_at is always there

      if (!hasEncryptedUpdate && !hasNonEncryptedUpdate) {
        return this.findConnectionByProject(projectId);
      }

      if (hasEncryptedUpdate) {
        // Use a single UPDATE with both encrypted and non-encrypted fields
        const [conn] = await sql<GitHubConnectionRow[]>`
          UPDATE github_connections
          SET ${sql(nonEncryptedValues as Record<string, postgres.SerializableParameter>)}
            ${data.accessToken !== undefined ? sql`, access_token_encrypted = pgp_sym_encrypt(${data.accessToken}, ${ENCRYPTION_KEY})` : sql``}
            ${data.webhookSecret !== undefined
              ? (data.webhookSecret === null
                ? sql`, webhook_secret_encrypted = NULL`
                : sql`, webhook_secret_encrypted = pgp_sym_encrypt(${data.webhookSecret}, ${ENCRYPTION_KEY})`)
              : sql``}
          WHERE project_id = ${projectId}
          RETURNING *,
            pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token,
            CASE WHEN webhook_secret_encrypted IS NOT NULL
              THEN pgp_sym_decrypt(webhook_secret_encrypted::bytea, ${ENCRYPTION_KEY})
              ELSE NULL
            END AS webhook_secret
        `;
        return conn;
      }

      const [conn] = await sql<GitHubConnectionRow[]>`
        UPDATE github_connections
        SET ${sql(nonEncryptedValues as Record<string, postgres.SerializableParameter>)}
        WHERE project_id = ${projectId}
        RETURNING *,
          pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token,
          CASE WHEN webhook_secret_encrypted IS NOT NULL
            THEN pgp_sym_decrypt(webhook_secret_encrypted::bytea, ${ENCRYPTION_KEY})
            ELSE NULL
          END AS webhook_secret
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
      // Decrypt in SQL but tolerate key mismatch / corrupt ciphertext:
      // return the row with a NULL access_token instead of throwing, so
      // callers can treat it as "not connected" and prompt reconnect.
      try {
        const [row] = await sql<GitHubUserTokenRow[]>`
          SELECT *,
            pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token
          FROM github_user_tokens WHERE user_id = ${userId}
        `;
        return row;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/wrong key|corrupt data|decrypt/i.test(msg)) {
          const [row] = await sql<GitHubUserTokenRow[]>`
            SELECT *, NULL::text AS access_token
            FROM github_user_tokens WHERE user_id = ${userId}
          `;
          return row;
        }
        throw err;
      }
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
          user_id, github_username, github_id, access_token_encrypted, scopes
        )
        VALUES (
          ${data.userId},
          ${data.githubUsername},
          ${data.githubId ?? null},
          pgp_sym_encrypt(${data.accessToken}, ${ENCRYPTION_KEY}),
          ${data.scopes ?? "repo"}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          github_username = EXCLUDED.github_username,
          github_id = EXCLUDED.github_id,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          scopes = EXCLUDED.scopes,
          updated_at = now()
        RETURNING *,
          pgp_sym_decrypt(access_token_encrypted::bytea, ${ENCRYPTION_KEY}) AS access_token
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
