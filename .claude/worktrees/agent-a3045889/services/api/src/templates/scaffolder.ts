import type postgres from "postgres";
import type { TemplateDefinition } from "./registry.js";
import { getTemplate } from "./registry.js";
import { contextManager } from "../context/manager.js";
import { DEFAULT_CONTEXT_FILES } from "../context/defaults.js";

// ─── Types ──────────────────────────────────────────────────

export interface ScaffoldResult {
  projectId: string;
  templateId: string;
  filesCreated: string[];
  contextFilesCreated: string[];
}

export interface ScaffoldOptions {
  projectId: string;
  templateId: string;
  /** Override project name in generated files */
  projectName?: string;
}

// ─── Scaffolder ─────────────────────────────────────────────

export function scaffolder(sql: postgres.Sql) {
  const ctx = contextManager(sql);

  return {
    /**
     * Scaffold a blank project (no template).
     * Creates default context files and a minimal file structure.
     */
    async scaffoldBlank(projectId: string): Promise<ScaffoldResult> {
      const template = getTemplate("blank");
      if (!template) throw new Error("Blank template not found");

      return this.scaffoldFromTemplate({
        projectId,
        templateId: "blank",
      });
    },

    /**
     * Scaffold a project from a template.
     * Creates code files in the project's file store and initializes context.
     */
    async scaffoldFromTemplate(
      options: ScaffoldOptions
    ): Promise<ScaffoldResult> {
      const template = getTemplate(options.templateId);
      if (!template) {
        throw new Error(`Template "${options.templateId}" not found`);
      }

      // 1. Store code files in the database
      const filesCreated = await writeCodeFiles(
        sql,
        options.projectId,
        template,
        options.projectName
      );

      // 2. Initialize context files
      const contextFiles = await ctx.initializeContext(options.projectId);

      // 3. Apply template-specific context overrides
      const overrideNames: string[] = [];
      if (template.contextOverrides) {
        for (const [filename, content] of Object.entries(
          template.contextOverrides
        )) {
          await ctx.updateContextFile(options.projectId, filename, content);
          overrideNames.push(filename);
        }
      }

      // 4. Update template usage count
      await sql`
        UPDATE templates
        SET usage_count = usage_count + 1
        WHERE id = ${options.templateId}
      `.catch(() => {
        // Template might not exist in DB (built-in only) — that's fine
      });

      return {
        projectId: options.projectId,
        templateId: options.templateId,
        filesCreated,
        contextFilesCreated: contextFiles.map((f) => f.filename),
      };
    },

    /**
     * Install dependencies for a scaffolded project.
     * Returns the command that should be run in the project's sandbox.
     */
    getInstallCommand(templateId: string): string {
      // All current templates use npm/pnpm
      return "npm install";
    },
  };
}

// ─── Internal Helpers ───────────────────────────────────────

async function writeCodeFiles(
  sql: postgres.Sql,
  projectId: string,
  template: TemplateDefinition,
  projectName?: string
): Promise<string[]> {
  const paths: string[] = [];

  for (const [filePath, rawContent] of Object.entries(template.codeFiles)) {
    let content = rawContent;

    // Replace placeholder project name if provided
    if (projectName) {
      content = content.replace(/doable-project/g, slugify(projectName));
    }

    await sql`
      INSERT INTO project_files (project_id, file_path, content)
      VALUES (${projectId}, ${filePath}, ${content})
      ON CONFLICT (project_id, file_path)
      DO UPDATE SET content = ${content}, updated_at = now()
    `;

    paths.push(filePath);
  }

  return paths;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
