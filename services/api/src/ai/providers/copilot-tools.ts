/**
 * Doable-specific tools for Copilot agent sessions.
 *
 * These provide real filesystem operations so the AI can create, edit,
 * and read files in the project directory. Vite hot-reloads changes.
 * dovault ConfigGuard blocks writes to server-side config files.
 */

import { defineTool, type Tool } from "@github/copilot-sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  readFile,
  writeFile,
  listFiles,
  getProjectPath,
} from "../../projects/file-manager.js";
import { restartDevServer, isRunning } from "../../projects/dev-server.js";
import { ConfigGuard } from "dovault";
import { defaultRegistry } from "../../frameworks/registry.js";
import { sql } from "../../db/index.js";
import { createBashTool } from "../tools/bash.js";
import { validateFileSyntax } from "../tools/validate-syntax.js";

/**
 * Per-project ConfigGuard. The bare `new ConfigGuard()` only ships
 * vite-react locks (vite.config.*, postcss.config.*, tailwind.config.*).
 * That meant a Next.js project's next.config.ts was *not* locked, so the
 * AI could overwrite it with a `.js` variant containing TypeScript syntax
 * — exactly the bug that surfaced live (`SyntaxError: Unexpected token '{'`
 * because `next.config.js` had `import type { NextConfig }`).
 *
 * Per-project guards are cached for the process lifetime — framework_id
 * doesn't change post-creation, so the cache is safe.
 */
const guardCache = new Map<string, ConfigGuard>();

async function getConfigGuard(projectId: string): Promise<ConfigGuard> {
  const cached = guardCache.get(projectId);
  if (cached) return cached;

  let frameworkId = "vite-react";
  try {
    const [row] = await sql<{ framework_id: string | null }[]>`
      SELECT framework_id FROM projects WHERE id = ${projectId}
    `;
    if (row?.framework_id) frameworkId = row.framework_id;
  } catch {
    /* DB unreachable — vite-react fallback is safe */
  }

  let extraLockedFiles: string[] = [];
  try {
    const adapter = defaultRegistry.getAdapter(frameworkId);
    extraLockedFiles = adapter.lockedConfigFiles?.() ?? [];
  } catch {
    /* unknown framework — defaults still apply */
  }

  const guard = new ConfigGuard({ extraLockedFiles });
  guardCache.set(projectId, guard);
  return guard;
}

/**
 * Per-project framework_id cache. The AI's bash tool exposes the project
 * root as `/app` (the sandbox bind-mount). LLMs sometimes leak that path
 * into create_file/edit_file calls (e.g. `app/src/Calculator.tsx`), which
 * lands at `<project>/app/src/Calculator.tsx` and is silently ignored by
 * the Vite dev server (which serves `<project>/src/`). For vite-react
 * projects we strip a leading `app/` here. Next.js projects legitimately
 * use `app/page.tsx` so we don't strip there.
 */
const frameworkCache = new Map<string, string>();

async function getProjectFramework(projectId: string): Promise<string> {
  const cached = frameworkCache.get(projectId);
  if (cached) return cached;
  let frameworkId = "vite-react";
  try {
    const [row] = await sql<{ framework_id: string | null }[]>`
      SELECT framework_id FROM projects WHERE id = ${projectId}
    `;
    if (row?.framework_id) frameworkId = row.framework_id;
  } catch {
    /* DB unreachable — vite-react fallback is safe */
  }
  frameworkCache.set(projectId, frameworkId);
  return frameworkId;
}

/**
 * Normalize a file path — if the AI passes an absolute path that starts with
 * the project directory, strip the prefix to make it relative. Also strips
 * leading './' for consistency. For vite-react projects also strips a leading
 * `app/` segment (see frameworkCache doc above).
 */
function normalizePath(projectId: string, filePath: string, frameworkId?: string): string {
  let p = filePath;
  const projectRoot = getProjectPath(projectId);
  // Strip absolute project prefix (handles both / and \ separators)
  const normalizedRoot = projectRoot.replace(/\\/g, "/");
  const normalizedPath = p.replace(/\\/g, "/");
  if (normalizedPath.startsWith(normalizedRoot + "/")) {
    p = normalizedPath.slice(normalizedRoot.length + 1);
  } else if (normalizedPath.startsWith(normalizedRoot)) {
    p = normalizedPath.slice(normalizedRoot.length);
  }
  // Strip leading ./ or /
  p = p.replace(/^\.\//, "").replace(/^\//, "");
  // Strip leading `app/` for vite-react projects (sandbox bind-mount leak).
  // Only strips when followed by another segment so a top-level `app/` file
  // that's legitimately meant to be at the root stays as-is. Conservative:
  // we only do this when we know the framework is vite-react.
  if (frameworkId === "vite-react" && /^app\/[^/]/.test(p)) {
    p = p.slice(4);
  }
  return p || filePath;
}

type ToolEventHandler = (toolName: string, status: "start" | "end", args: Record<string, unknown>) => void;
const toolEventHandlers = new Map<string, ToolEventHandler>();

export function onToolEvent(projectId: string, handler: ToolEventHandler): () => void {
  toolEventHandlers.set(projectId, handler);
  return () => { toolEventHandlers.delete(projectId); };
}

function emitToolEvent(projectId: string, toolName: string, status: "start" | "end", args: Record<string, unknown>) {
  const handler = toolEventHandlers.get(projectId);
  if (handler) handler(toolName, status, args);
}

export interface DoableToolOptions {
  userId?: string;
  workspaceId?: string;
  hasSupabase?: boolean;
}

export function createDoableTools(projectId: string, userId?: string, workspaceId?: string, options?: DoableToolOptions): Tool[] {
  const hasSupabase = options?.hasSupabase ?? false;
  return ([
    defineTool("create_file", {
      description: "Create or overwrite a file in the project. Required fields are `path` (RELATIVE, e.g. 'index.html', 'src/App.tsx') and `content` (the full file body as a string). Do NOT use `file_text` — this tool uses `content`. Do NOT pass `command`. Do NOT use absolute paths or `/app/...` prefixes.",
      overridesBuiltInTool: true,
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root (e.g. 'src/components/Button.tsx'). Do NOT use absolute paths and do NOT prefix with 'app/' or '/app/' — `/app` is the sandbox bind-mount path that bash sees, NOT a directory inside the project. For Vite/React projects, components go directly under 'src/' at the project root." },
          content: { type: "string" as const, description: "The full file content to write. Field name is `content` — NOT `file_text`." },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const frameworkId = await getProjectFramework(projectId);
        const filePath = normalizePath(projectId, args.path, frameworkId);
        const { content } = args;
        const guard = await getConfigGuard(projectId);
        if (guard.isLocked(filePath)) {
          return { success: false, error: `Cannot create ${filePath} — server-side config files are locked by dovault for security.` };
        }
        const fullPath = path.join(getProjectPath(projectId), filePath);
        const alreadyExists = existsSync(fullPath);
        // Pre-write syntax check — mirrors tools/create-file.ts. Catches LLM
        // mistakes (e.g. `catch (console.error) {}`, malformed JSON,
        // unbalanced JSX) BEFORE the broken file hits disk and the dev
        // server, so the model retries in the same tool call.
        const syntaxCheck = validateFileSyntax(filePath, content);
        if (!syntaxCheck.ok) {
          return {
            success: false,
            error:
              `Syntax error in ${filePath}: ${syntaxCheck.message}\n` +
              `File was NOT created. Fix the syntax and call create_file again.`,
          };
        }
        emitToolEvent(projectId, "create_file", "start", { path: filePath });
        await writeFile(projectId, filePath, content);
        emitToolEvent(projectId, "create_file", "end", { path: filePath });
        return {
          success: true,
          path: filePath,
          size: Buffer.byteLength(content, "utf-8"),
          message: alreadyExists ? `Overwrote existing file ${filePath}` : `Created ${filePath}`,
          overwritten: alreadyExists,
        };
      },
    }),

    defineTool("edit_file", {
      description: "Replace the entire content of an existing file. Required fields are `path` (RELATIVE, e.g. 'index.html') and `content` (the full new file body). Do NOT use `file_text` — this tool uses `content`. Do NOT pass `command`. Read the file first, then write the complete updated content.",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root. Do NOT use absolute paths and do NOT prefix with 'app/' — `/app` is the sandbox bind-mount path that bash sees, NOT a directory inside the project." },
          content: { type: "string" as const, description: "The complete new file content. Field name is `content` — NOT `file_text`." },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const frameworkId = await getProjectFramework(projectId);
        const filePath = normalizePath(projectId, args.path, frameworkId);
        const { content } = args;
        const guard = await getConfigGuard(projectId);
        if (guard.isLocked(filePath)) {
          return { success: false, error: `Cannot edit ${filePath} — server-side config files are locked by dovault for security.` };
        }
        // Pre-write syntax check — same protection as create_file above.
        const syntaxCheck = validateFileSyntax(filePath, content);
        if (!syntaxCheck.ok) {
          return {
            success: false,
            error:
              `Syntax error in ${filePath} after edit: ${syntaxCheck.message}\n` +
              `File was NOT modified. Re-read the file and try a different edit.`,
          };
        }
        emitToolEvent(projectId, "edit_file", "start", { path: filePath });
        await writeFile(projectId, filePath, content);
        emitToolEvent(projectId, "edit_file", "end", { path: filePath });
        return { success: true, path: filePath, size: Buffer.byteLength(content, "utf-8"), message: `Updated ${filePath}` };
      },
    }),

    defineTool("read_file", {
      description: "Read the contents of a file in the project. Returns the full file content. Use relative paths (e.g. 'index.html').",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root. Do NOT use absolute paths and do NOT prefix with 'app/' — `/app` is the sandbox bind-mount path that bash sees, NOT a directory inside the project." },
        },
        required: ["path"] as const,
      },
      handler: async (args: { path: string }) => {
        const frameworkId = await getProjectFramework(projectId);
        const filePath = normalizePath(projectId, args.path, frameworkId);
        emitToolEvent(projectId, "read_file", "start", { path: filePath });
        try {
          const content = await readFile(projectId, filePath);
          emitToolEvent(projectId, "read_file", "end", { path: filePath });
          return { success: true, path: filePath, content, lines: content.split("\n").length };
        } catch (err) {
          emitToolEvent(projectId, "read_file", "end", { path: filePath });
          return { success: false, error: err instanceof Error ? err.message : `File not found: ${filePath}` };
        }
      },
    }),

    defineTool("list_files", {
      description: "List all files in the project directory (excluding node_modules, .git, dist). Returns relative paths.",
      parameters: {
        type: "object" as const,
        properties: {
          directory: { type: "string" as const, description: "Subdirectory to list (default: project root). Use '.' for root." },
        },
      },
      handler: async (args: { directory?: string }) => {
        const dir = args.directory ?? ".";
        emitToolEvent(projectId, "list_files", "start", { directory: dir });
        const files = await listFiles(projectId, dir);
        emitToolEvent(projectId, "list_files", "end", { directory: dir });
        return { success: true, count: files.length, files };
      },
    }),

    defineTool("install_package", {
      description: "Install npm packages in the project. Call this BEFORE importing any package not in package.json.",
      parameters: {
        type: "object" as const,
        properties: {
          packages: { type: "string" as const, description: "Space-separated package names (e.g. 'react-router-dom lucide-react')" },
          dev: { type: "boolean" as const, description: "Install as dev dependency (default: false)" },
        },
        required: ["packages"] as const,
      },
      handler: async (args: { packages: string; dev?: boolean }) => {
        const { packages, dev } = args;
        emitToolEvent(projectId, "install_package", "start", { packages });
        const { spawn: spawnCmd } = await import("node:child_process");
        const projectPath = getProjectPath(projectId);
        const pkgList = packages.split(/\s+/).filter(Boolean);
        // BUG-PUB-004: the API runs with NODE_ENV=production (docker/systemd
        // default). A bare `npm install <pkg>` then silently switches to
        // --omit=dev and PRUNES existing devDependencies — including `vite`,
        // `@vitejs/plugin-react`, `tailwindcss` — out of node_modules. The
        // per-project vite dev server then can't start ("Preview failed to
        // start" → install circuit-breaker). Mirror the framework adapters:
        // force --include=dev AND NODE_ENV=development on the install spawn.
        const npmArgs = ["install", "--ignore-scripts", "--include=dev", ...(dev ? ["--save-dev"] : []), ...pkgList, "--legacy-peer-deps"];

        return new Promise((resolve) => {
          const child = spawnCmd("npm", npmArgs, { cwd: projectPath, shell: true, stdio: "pipe", env: { ...process.env, FORCE_COLOR: "0", NODE_ENV: "development" } });
          let output = "";
          child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
          child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

          child.on("close", async (code) => {
            emitToolEvent(projectId, "install_package", "end", { packages });
            let restarted = false;
            if (code === 0 && isRunning(projectId)) {
              try { await restartDevServer(projectId, userId ? { userId } : undefined); restarted = true; } catch {}
            }
            resolve({
              success: code === 0, packages: pkgList, dev: dev ?? false,
              message: code === 0 ? `Installed ${pkgList.join(", ")}${restarted ? " (dev server restarted)" : ""}` : `Install failed with code ${code}`,
              output: output.slice(-500),
            });
          });
          child.on("error", (err) => {
            emitToolEvent(projectId, "install_package", "end", { packages });
            resolve({ success: false, error: err.message, message: `Failed to run npm install: ${err.message}` });
          });
          setTimeout(() => { child.kill("SIGTERM"); resolve({ success: false, message: "npm install timed out" }); }, 120_000);
        });
      },
    }),

    defineTool("deploy_preview", {
      description: "Deploy the current project to a preview URL for testing",
      parameters: {
        type: "object" as const,
        properties: { message: { type: "string" as const, description: "Deployment commit message" } },
      },
      handler: async (_args: { message?: string }) => {
        return { success: true, url: `https://preview-${projectId}.doable.dev`, message: "Preview deployed successfully" };
      },
    }),

    // ─── Plan Mode V2 Tools ──────────────────────────────

    defineTool("ask_clarification", {
      description: "Ask the user friendly, non-technical clarifying questions before generating a plan. Maximum 4 questions.",
      parameters: {
        type: "object" as const,
        properties: {
          questions: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "string" as const, description: "Unique question ID" },
                question: { type: "string" as const, description: "Plain-language question about goals, audience, or preferences." },
                type: { type: "string" as const, enum: ["multi_choice", "yes_no", "free_text"] as const },
                options: { type: "array" as const, items: { type: "string" as const } },
                default: { type: "string" as const },
                context: { type: "string" as const, description: "Brief explanation of why you're asking" },
              },
              required: ["id", "question", "type"] as const,
            },
          },
        },
        required: ["questions"] as const,
      },
      handler: async (args: { questions: Array<{ id: string; question: string; type: string; options?: string[]; default?: string; context?: string }> }) => {
        emitToolEvent(projectId, "ask_clarification", "start", {});
        const questions = args.questions.slice(0, 4);
        emitToolEvent(projectId, "ask_clarification", "end", { output: JSON.stringify(questions) });
        return { success: true, questions, message: `Asked ${questions.length} clarification questions` };
      },
    }),

    defineTool("create_plan", {
      description: "Create a step-by-step plan describing what the user will see and experience. No technical terms.",
      parameters: {
        type: "object" as const,
        properties: {
          summary: { type: "string" as const, description: "1-2 sentence summary a non-technical person would understand." },
          complexity: { type: "string" as const, enum: ["simple", "moderate", "complex"] as const },
          steps: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                title: { type: "string" as const, description: "What the user will see." },
                description: { type: "string" as const, description: "Describe the experience." },
                details: { type: "string" as const, description: "HIDDEN from user. Technical notes for AI." },
                filePaths: { type: "array" as const, items: { type: "string" as const }, description: "HIDDEN. Files to create/modify." },
              },
              required: ["title", "description"] as const,
            },
          },
        },
        required: ["summary", "complexity", "steps"] as const,
      },
      handler: async (args: { summary: string; complexity: string; steps: Array<{ title: string; description: string; details?: string; filePaths?: string[] }> }) => {
        const { randomUUID } = await import("node:crypto");
        const planId = randomUUID();
        const steps = args.steps.map((s, i) => ({
          id: randomUUID(), order: i + 1, title: s.title, description: s.description,
          details: s.details, filePaths: s.filePaths, status: "pending" as const,
        }));
        const plan = { id: planId, projectId, summary: args.summary, complexity: args.complexity, steps, status: "draft" as const, createdAt: new Date().toISOString() };

        try {
          const { writeFile: fsWrite, mkdir } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const projectPath = getProjectPath(projectId);
          await mkdir(join(projectPath, ".doable"), { recursive: true });
          let md = `# Plan\n\nPlan ID: ${planId}\n\n${args.summary}\n\n**Complexity:** ${args.complexity}\n\n`;
          for (const step of steps) {
            md += `## ${step.order}. ${step.title}\n\n${step.description}\n\n`;
            if (step.details) md += `**Details:** ${step.details}\n\n`;
            if (step.filePaths?.length) md += `**Files:** ${step.filePaths.join(", ")}\n\n`;
          }
          md += `\n---\nAfter each step, call mark_step_complete(stepId, planId).\n`;
          await fsWrite(join(projectPath, ".doable", "plan.md"), md, "utf-8");
        } catch { /* non-fatal */ }

        emitToolEvent(projectId, "create_plan", "start", {});
        emitToolEvent(projectId, "create_plan", "end", { output: JSON.stringify(plan) });
        return { success: true, plan, message: `Created plan with ${steps.length} steps` };
      },
    }),

    defineTool("provision_supabase", {
      description: "Create a brand-new Supabase database for this project. ALWAYS call this BEFORE writing code that imports '@supabase/supabase-js'. The platform handles everything automatically.",
      parameters: {
        type: "object" as const,
        properties: { name: { type: "string" as const, description: "Optional name for the Supabase project." } },
      },
      handler: async (args: { name?: string }) => {
        emitToolEvent(projectId, "provision_supabase", "start", { name: args.name ?? "" });
        const result = {
          success: true, _sseHint: "provision_supabase_required" as const,
          reason: "The chat UI should open the Supabase project creation dialog.",
          name: args.name ?? "",
        };
        emitToolEvent(projectId, "provision_supabase", "end", { name: args.name ?? "" });
        return result;
      },
    }),

    ...(hasSupabase ? [defineTool("run_supabase_migration", {
      description: "Execute SQL against the user's connected Supabase database. Use this to CREATE TABLES, add columns, create indexes, or set up RLS policies BEFORE writing application code that depends on those tables. Always use IF NOT EXISTS to make migrations idempotent.",
      parameters: {
        type: "object" as const,
        properties: {
          sql: { type: "string" as const, description: "The SQL to execute (CREATE TABLE, ALTER TABLE, CREATE POLICY, etc.)" },
        },
        required: ["sql"] as const,
      },
      handler: async (args: { sql: string }) => {
        emitToolEvent(projectId, "run_supabase_migration", "start", { sql: args.sql.slice(0, 100) });
        try {
          if (!workspaceId) {
            return { success: false, error: "No workspace context — cannot resolve Supabase credentials." };
          }
          const { runMigration } = await import("../../integrations/supabase/migrate.js");
          const { credentialVault } = await import("../../integrations/credential-vault.js");

          // Get the mgmt OAuth token (needed for Management API DDL)
          const mgmtConn = await credentialVault.get(userId ?? "", "supabase-mgmt", workspaceId, projectId);
          const accessToken = (mgmtConn?.credentials as Record<string, unknown> | null)?.access_token as string | undefined;
          if (!accessToken) {
            return { success: false, error: "No Supabase management token found. User must connect Supabase first." };
          }

          // Get project ref from supabase data connection
          const dataConn = await credentialVault.get(userId ?? "", "supabase", workspaceId, projectId);
          const projectRef = (dataConn?.metadata as Record<string, unknown> | null)?.projectRef as string | undefined;
          if (!projectRef) {
            return { success: false, error: "No Supabase project ref found. User must connect a Supabase project first." };
          }

          const result = await runMigration({ accessToken, projectRef, sql: args.sql });
          emitToolEvent(projectId, "run_supabase_migration", "end", { ok: result.ok });
          if (!result.ok) {
            return { success: false, error: `Migration failed: ${result.error}` };
          }
          return { success: true, message: "Migration executed successfully.", rows: result.rows };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          emitToolEvent(projectId, "run_supabase_migration", "end", { error: msg });
          return { success: false, error: msg };
        }
      },
    })] : []),

    defineTool("request_integration", {
      description: "Request a third-party service the user has not connected. Call this INSTEAD of asking users to paste API keys.",
      parameters: {
        type: "object" as const,
        properties: {
          integrationId: { type: "string" as const, description: "Registry ID (e.g. 'supabase', 'stripe', 'github')." },
          reason: { type: "string" as const, description: "One sentence explaining what feature needs it." },
        },
        required: ["integrationId", "reason"] as const,
      },
      handler: async (args: { integrationId: string; reason: string }) => {
        let displayName = args.integrationId;
        let logoUrl: string | undefined;
        try {
          const { getIntegration } = await import("../../integrations/registry/index.js");
          const def = getIntegration(args.integrationId);
          if (def) { displayName = def.displayName; logoUrl = def.logoUrl; }
        } catch {}
        return {
          success: true, _sseHint: "integration_required" as const,
          integrationId: args.integrationId, displayName, logoUrl, reason: args.reason,
          message: `Requested integration "${displayName}". The user will see a Connect button.`,
        };
      },
    }),

    defineTool("mark_step_complete", {
      description: "Mark a plan step as completed during build execution.",
      parameters: {
        type: "object" as const,
        properties: {
          stepId: { type: "string" as const, description: "The step ID to mark complete" },
          planId: { type: "string" as const, description: "The plan ID" },
        },
        required: ["stepId", "planId"] as const,
      },
      handler: async (args: { stepId: string; planId: string }) => {
        emitToolEvent(projectId, "mark_step_complete", "end", { stepId: args.stepId, planId: args.planId, status: "completed" });
        return { success: true, stepId: args.stepId, planId: args.planId, status: "completed" };
      },
    }),

    // PRD ch 13: Doable-owned bash overrides SDK built-in; routes through sandbox orchestrator.
    createBashTool({ projectId, workspaceId: workspaceId ?? null, userId: userId ?? "", sessionId: projectId }),
  ] as Tool[]);
}
