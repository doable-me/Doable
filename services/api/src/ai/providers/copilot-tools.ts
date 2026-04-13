/**
 * Doable-specific tools for Copilot agent sessions.
 *
 * These provide real filesystem operations so the AI can create, edit,
 * and read files in the project directory. Vite hot-reloads changes.
 * dovault ConfigGuard blocks writes to server-side config files.
 */

import { defineTool, type Tool } from "@github/copilot-sdk";
import {
  readFile,
  writeFile,
  listFiles,
  getProjectPath,
} from "../../projects/file-manager.js";
import { restartDevServer, isRunning } from "../../projects/dev-server.js";
import { ConfigGuard } from "dovault";

const configGuard = new ConfigGuard();

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

export function createDoableTools(projectId: string, userId?: string): Tool[] {
  return ([
    defineTool("create_file", {
      description: "Create a new file in the project with the given content. Creates parent directories as needed.",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root (e.g. 'src/components/Button.tsx')" },
          content: { type: "string" as const, description: "The full file content to write" },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const { path, content } = args;
        if (configGuard.isLocked(path)) {
          return { success: false, error: `Cannot create ${path} — server-side config files are locked by dovault for security.` };
        }
        emitToolEvent(projectId, "create_file", "start", { path });
        await writeFile(projectId, path, content);
        emitToolEvent(projectId, "create_file", "end", { path });
        return { success: true, path, size: Buffer.byteLength(content, "utf-8"), message: `Created ${path}` };
      },
    }),

    defineTool("edit_file", {
      description: "Replace the entire content of an existing file. Read the file first, then write the complete updated content.",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root" },
          content: { type: "string" as const, description: "The complete new file content" },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const { path, content } = args;
        if (configGuard.isLocked(path)) {
          return { success: false, error: `Cannot edit ${path} — server-side config files are locked by dovault for security.` };
        }
        emitToolEvent(projectId, "edit_file", "start", { path });
        await writeFile(projectId, path, content);
        emitToolEvent(projectId, "edit_file", "end", { path });
        return { success: true, path, size: Buffer.byteLength(content, "utf-8"), message: `Updated ${path}` };
      },
    }),

    defineTool("read_file", {
      description: "Read the contents of a file in the project. Returns the full file content.",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Relative path from the project root" },
        },
        required: ["path"] as const,
      },
      handler: async (args: { path: string }) => {
        emitToolEvent(projectId, "read_file", "start", { path: args.path });
        try {
          const content = await readFile(projectId, args.path);
          emitToolEvent(projectId, "read_file", "end", { path: args.path });
          return { success: true, path: args.path, content, lines: content.split("\n").length };
        } catch (err) {
          emitToolEvent(projectId, "read_file", "end", { path: args.path });
          return { success: false, error: err instanceof Error ? err.message : `File not found: ${args.path}` };
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
        const npmArgs = ["install", "--ignore-scripts", ...(dev ? ["--save-dev"] : []), ...pkgList, "--legacy-peer-deps"];

        return new Promise((resolve) => {
          const child = spawnCmd("npm", npmArgs, { cwd: projectPath, shell: true, stdio: "pipe", env: { ...process.env, FORCE_COLOR: "0" } });
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
  ] as Tool[]);
}
