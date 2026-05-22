import type postgres from "postgres";
import { DEFAULT_CONTEXT_FILES, VALID_CONTEXT_FILENAMES } from "./defaults.js";
import type { AiSessionMode } from "@doable/shared";
import { environmentQueries } from "@doable/db";

// ─── Types ──────────────────────────────────────────────────

export interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

export interface ProjectContext {
  projectId: string;
  files: ContextFile[];
}

// ─── Manager ────────────────────────────────────────────────

export function contextManager(sql: postgres.Sql) {
  const envDb = environmentQueries(sql);

  /** Helper: get the environment_id for a project, creating if needed */
  async function ensureProjectEnv(projectId: string): Promise<string> {
    // Look up project's workspace_id, name, and a suitable created_by
    const [proj] = await sql<{ workspace_id: string; name: string }[]>`
      SELECT workspace_id, name FROM projects WHERE id = ${projectId}
    `;
    if (!proj) throw new Error(`Project ${projectId} not found`);

    const [ws] = await sql<{ owner_id: string }[]>`
      SELECT owner_id FROM workspaces WHERE id = ${proj.workspace_id}
    `;
    const createdBy = ws?.owner_id ?? "system";

    const env = await envDb.getOrCreateForProject(projectId, proj.workspace_id, createdBy, proj.name);
    return env.id;
  }

  return {
    /**
     * Initialize context for a project.
     * Creates default context files in the project's environment_knowledge.
     */
    async initializeContext(projectId: string): Promise<ContextFile[]> {
      const envId = await ensureProjectEnv(projectId);

      const existing = await sql<{ filename: string }[]>`
        SELECT filename FROM environment_knowledge
        WHERE environment_id = ${envId}
      `;

      const existingNames = new Set(existing.map((r) => r.filename));
      const toCreate = DEFAULT_CONTEXT_FILES.filter(
        (f) => !existingNames.has(f.filename)
      );

      if (toCreate.length === 0) {
        return this.readContext(projectId);
      }

      for (const file of toCreate) {
        await sql`
          INSERT INTO environment_knowledge (environment_id, filename, content)
          VALUES (${envId}, ${file.filename}, ${file.defaultContent})
          ON CONFLICT (environment_id, filename) DO NOTHING
        `;
      }

      return this.readContext(projectId);
    },

    /**
     * Read all context files for a project.
     */
    async readContext(projectId: string): Promise<ContextFile[]> {
      const env = await envDb.getForProject(projectId);
      if (!env) return [];
      const rows = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM environment_knowledge
        WHERE environment_id = ${env.id}
        ORDER BY filename ASC
      `;
      return rows;
    },

    /**
     * Read a single context file.
     */
    async readContextFile(
      projectId: string,
      filename: string
    ): Promise<ContextFile | undefined> {
      const env = await envDb.getForProject(projectId);
      if (!env) return undefined;
      const [row] = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM environment_knowledge
        WHERE environment_id = ${env.id} AND filename = ${filename}
      `;
      return row;
    },

    /**
     * Update (or create) a context file.
     */
    async updateContextFile(
      projectId: string,
      filename: string,
      content: string
    ): Promise<ContextFile> {
      const envId = await ensureProjectEnv(projectId);
      const [row] = await sql<ContextFile[]>`
        INSERT INTO environment_knowledge (environment_id, filename, content)
        VALUES (${envId}, ${filename}, ${content})
        ON CONFLICT (environment_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING filename, content, updated_at AS "updatedAt"
      `;
      return row!;
    },

    /**
     * Create a new custom context file.
     */
    async createContextFile(
      projectId: string,
      filename: string,
      content: string
    ): Promise<ContextFile> {
      const envId = await ensureProjectEnv(projectId);
      const [row] = await sql<ContextFile[]>`
        INSERT INTO environment_knowledge (environment_id, filename, content)
        VALUES (${envId}, ${filename}, ${content})
        RETURNING filename, content, updated_at AS "updatedAt"
      `;
      return row!;
    },

    /**
     * Delete a context file (only custom files; default ones get reset).
     */
    async deleteContextFile(
      projectId: string,
      filename: string
    ): Promise<boolean> {
      if (VALID_CONTEXT_FILENAMES.includes(filename)) {
        const def = DEFAULT_CONTEXT_FILES.find((f) => f.filename === filename);
        if (def) {
          await this.updateContextFile(projectId, filename, def.defaultContent);
          return true;
        }
      }

      const env = await envDb.getForProject(projectId);
      if (!env) return false;
      const result = await sql`
        DELETE FROM environment_knowledge
        WHERE environment_id = ${env.id} AND filename = ${filename}
      `;
      return result.count > 0;
    },

    /**
     * Append a note to the memory.md context file.
     */
    async appendToMemory(
      projectId: string,
      note: string
    ): Promise<void> {
      const existing = await this.readContextFile(projectId, "memory.md");
      const currentContent = existing?.content ?? "";

      const timestamp = new Date().toISOString().split("T")[0];
      const entry = `\n- [${timestamp}] ${note}`;

      let updatedContent: string;
      if (currentContent.includes("## Session Notes")) {
        updatedContent = currentContent.replace(
          "## Session Notes",
          `## Session Notes${entry}`
        );
      } else {
        updatedContent = `${currentContent.trimEnd()}\n\n## Session Notes${entry}\n`;
      }

      await this.updateContextFile(projectId, "memory.md", updatedContent);
    },

    /**
     * Build the full context for injection into an AI prompt.
     */
    async injectContext(
      projectId: string,
      mode: AiSessionMode
    ): Promise<string> {
      const { buildContextPrompt } = await import("./injector.js");
      const files = await this.initializeContext(projectId);
      return buildContextPrompt(files, mode);
    },

    // ── Workspace context (via workspace environment) ──
    async getWorkspaceContext(workspaceId: string): Promise<ContextFile[]> {
      const env = await envDb.getForWorkspace(workspaceId);
      if (!env) return [];
      const rows = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM environment_knowledge
        WHERE environment_id = ${env.id}
        ORDER BY filename
      `;
      return rows;
    },

    async setWorkspaceContext(workspaceId: string, filename: string, content: string, createdBy?: string): Promise<ContextFile> {
      const env = await envDb.getOrCreateForWorkspace(workspaceId, createdBy ?? "system");
      const [row] = await sql<ContextFile[]>`
        INSERT INTO environment_knowledge (environment_id, filename, content)
        VALUES (${env.id}, ${filename}, ${content})
        ON CONFLICT (environment_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING filename, content, updated_at AS "updatedAt"
      `;
      return row!;
    },

    async deleteWorkspaceContext(workspaceId: string, filename: string): Promise<boolean> {
      const env = await envDb.getForWorkspace(workspaceId);
      if (!env) return false;
      const result = await sql`
        DELETE FROM environment_knowledge
        WHERE environment_id = ${env.id} AND filename = ${filename}
      `;
      return result.count > 0;
    },

    // ── User context (via user environment) ──
    async getUserContext(userId: string, workspaceId: string): Promise<ContextFile[]> {
      const env = await envDb.getForUser(userId, workspaceId);
      if (!env) return [];
      const rows = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM environment_knowledge
        WHERE environment_id = ${env.id}
        ORDER BY filename
      `;
      return rows;
    },

    async setUserContext(userId: string, workspaceId: string, filename: string, content: string): Promise<ContextFile> {
      const env = await envDb.getOrCreateForUser(userId, workspaceId);
      const [row] = await sql<ContextFile[]>`
        INSERT INTO environment_knowledge (environment_id, filename, content)
        VALUES (${env.id}, ${filename}, ${content})
        ON CONFLICT (environment_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING filename, content, updated_at AS "updatedAt"
      `;
      return row!;
    },

    /**
     * Resolve effective context across all scopes.
     * Priority: user > project > workspace.
     */
    async resolveEffectiveContext(
      workspaceId: string,
      projectId: string,
      userId: string,
      mode: AiSessionMode,
    ): Promise<string> {
      const { buildContextPrompt, resolveMultiScopeContext } = await import("./injector.js");

      const [workspaceFiles, projectFiles, userFiles] = await Promise.all([
        this.getWorkspaceContext(workspaceId),
        this.initializeContext(projectId),
        this.getUserContext(userId, workspaceId),
      ]);

      const resolved = resolveMultiScopeContext(workspaceFiles, projectFiles, userFiles);
      return buildContextPrompt(resolved, mode);
    },
  };
}
