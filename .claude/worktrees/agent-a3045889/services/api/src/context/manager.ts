import type postgres from "postgres";
import { DEFAULT_CONTEXT_FILES, VALID_CONTEXT_FILENAMES } from "./defaults.js";
import type { AiSessionMode } from "@doable/shared";

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
  return {
    /**
     * Initialize context for a new project.
     * Creates all default context files in the database.
     */
    async initializeContext(projectId: string): Promise<ContextFile[]> {
      const existing = await sql<{ filename: string }[]>`
        SELECT filename FROM project_context_files
        WHERE project_id = ${projectId}
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
          INSERT INTO project_context_files (project_id, filename, content)
          VALUES (${projectId}, ${file.filename}, ${file.defaultContent})
          ON CONFLICT (project_id, filename) DO NOTHING
        `;
      }

      return this.readContext(projectId);
    },

    /**
     * Read all context files for a project.
     */
    async readContext(projectId: string): Promise<ContextFile[]> {
      const rows = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM project_context_files
        WHERE project_id = ${projectId}
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
      const [row] = await sql<ContextFile[]>`
        SELECT filename, content, updated_at AS "updatedAt"
        FROM project_context_files
        WHERE project_id = ${projectId} AND filename = ${filename}
      `;
      return row;
    },

    /**
     * Update (or create) a context file.
     * Returns the updated file.
     */
    async updateContextFile(
      projectId: string,
      filename: string,
      content: string
    ): Promise<ContextFile> {
      const [row] = await sql<ContextFile[]>`
        INSERT INTO project_context_files (project_id, filename, content)
        VALUES (${projectId}, ${filename}, ${content})
        ON CONFLICT (project_id, filename)
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
      const [row] = await sql<ContextFile[]>`
        INSERT INTO project_context_files (project_id, filename, content)
        VALUES (${projectId}, ${filename}, ${content})
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
        // Reset default files to their default content instead of deleting
        const def = DEFAULT_CONTEXT_FILES.find((f) => f.filename === filename);
        if (def) {
          await this.updateContextFile(projectId, filename, def.defaultContent);
          return true;
        }
      }

      const result = await sql`
        DELETE FROM project_context_files
        WHERE project_id = ${projectId} AND filename = ${filename}
      `;
      return result.count > 0;
    },

    /**
     * Build the full context for injection into an AI prompt.
     * Selects and orders files based on mode, respects token budget.
     */
    async injectContext(
      projectId: string,
      mode: AiSessionMode
    ): Promise<string> {
      const { buildContextPrompt } = await import("./injector.js");
      const files = await this.readContext(projectId);
      return buildContextPrompt(files, mode);
    },
  };
}
