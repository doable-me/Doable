import type postgres from "postgres";
import type { TemplateDefinition } from "./registry.js";
import { getTemplate } from "./registry.js";
import { contextManager } from "../context/manager.js";
import { DEFAULT_CONTEXT_FILES } from "../context/defaults.js";
import { defaultRegistry } from "../frameworks/registry.js";

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
     * Creates the full project directory structure including:
     * - All source files from the template definition
     * - .doable/ context files (knowledge.md, instructions.md, identity.md)
     * - package.json with correct dependencies
     * - Vite config, tsconfig, tailwind config
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

      // 4. Ensure .doable/ context files are written as project files too
      // so they appear in the file tree for user visibility
      await writeDoableContextFiles(
        sql,
        options.projectId,
        template
      );

      // 5. Update template usage count
      await sql`
        UPDATE templates
        SET usage_count = usage_count + 1
        WHERE id = ${options.templateId}
      `.catch(() => {
        // Template might not exist in DB (built-in only) -- that's fine
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
     *
     * Derived from the framework adapter's `family`. Templates today don't
     * carry a `framework_id` on the in-memory `TemplateDefinition` type
     * (it lives on the DB row); for built-in callers we default to
     * "vite-react" — byte-identical to the previous hardcoded behavior.
     */
    getInstallCommand(templateId: string): string {
      return resolveInstallCommand(templateId);
    },

    /**
     * Get the dev server start command for a template. Derived from the
     * framework adapter's `family`. Defaults to "vite-react" for current
     * templates — byte-identical to the previous hardcoded behavior.
     */
    getDevCommand(templateId: string): string {
      return resolveDevCommand(templateId);
    },
  };
}

// ─── Adapter-driven command resolution ──────────────────────

/**
 * Resolve a frameworkId from a templateId. Falls back to "vite-react"
 * (the default for every built-in template today; matches the
 * `templates.framework_id DEFAULT 'vite-react'` migration in 060).
 */
function resolveFrameworkId(templateId?: string): string {
  if (!templateId) return "vite-react";
  const template = getTemplate(templateId);
  // `framework_id` is a DB column on `templates` (migration 060) but is
  // not (yet) part of the in-memory TemplateDefinition shape. Read it
  // defensively so we degrade gracefully when it's absent.
  const fid = (template as { framework_id?: string } | undefined)?.framework_id;
  return fid ?? "vite-react";
}

function resolveInstallCommand(templateId?: string): string {
  const id = resolveFrameworkId(templateId);
  const adapter = defaultRegistry.getAdapter(id);
  if (adapter.family === "node") return "npm install";
  if (adapter.family === "python") return "pip install -r requirements.txt";
  if (adapter.family === "ruby") return "bundle install";
  return "echo 'no install needed'";
}

function resolveDevCommand(templateId?: string): string {
  const id = resolveFrameworkId(templateId);
  const adapter = defaultRegistry.getAdapter(id);
  if (adapter.family === "node") return "npm run dev";
  if (adapter.family === "python") return "python manage.py runserver";
  if (adapter.family === "ruby") return "bundle exec rails server";
  return "echo 'no dev command'";
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

/**
 * Write .doable/ context files as project files so they appear
 * in the project file tree.
 */
async function writeDoableContextFiles(
  sql: postgres.Sql,
  projectId: string,
  template: TemplateDefinition
): Promise<void> {
  // Build context content from overrides or defaults
  const contextFiles: Record<string, string> = {};

  // Start with defaults for all standard context files
  for (const def of DEFAULT_CONTEXT_FILES) {
    contextFiles[def.filename] = def.defaultContent;
  }

  // Override with template-specific content
  if (template.contextOverrides) {
    for (const [filename, content] of Object.entries(
      template.contextOverrides
    )) {
      contextFiles[filename] = content;
    }
  }

  // Ensure instructions.md always exists with template-specific guidance
  if (!contextFiles["instructions.md"]) {
    contextFiles["instructions.md"] = buildInstructionsContent(template);
  }

  // Write each context file as a .doable/ project file
  for (const [filename, content] of Object.entries(contextFiles)) {
    const filePath = `.doable/${filename}`;
    await sql`
      INSERT INTO project_files (project_id, file_path, content)
      VALUES (${projectId}, ${filePath}, ${content})
      ON CONFLICT (project_id, file_path)
      DO UPDATE SET content = ${content}, updated_at = now()
    `;
  }
}

function buildInstructionsContent(template: TemplateDefinition): string {
  return `# Coding Instructions

## Template: ${template.name}

### General Rules
- Use TypeScript strict mode
- Follow existing code patterns and naming conventions
- Use Tailwind CSS for styling (no inline styles unless necessary)
- Prefer functional React components with hooks
- Use path alias \`@/\` for imports from \`src/\`

### Component Guidelines
- Export components as named exports
- Keep components focused and single-responsibility
- Use \`cn()\` utility for conditional class merging
- Follow shadcn/ui patterns for UI components

### File Organization
- Place page components in \`src/pages/\` or \`src/app/\`
- Place reusable components in \`src/components/\`
- Place hooks in \`src/hooks/\`
- Place utilities in \`src/lib/\`
- Place types in \`src/types.ts\` or co-locate with components
`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
