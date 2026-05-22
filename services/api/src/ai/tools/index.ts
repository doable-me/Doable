import type { ToolDefinition, ToolResult } from "@doable/shared/types/ai.js";

// ─── Tool Interface ───────────────────────────────────────

export interface ToolContext {
  projectId: string;
  userId: string;
  sessionId: string;
  projectPath: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ─── Tool Registry ────────────────────────────────────────

class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${name}`,
      };
    }

    try {
      return await tool.execute(params, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: "",
        error: `Tool '${name}' failed: ${message}`,
      };
    }
  }
}

// ─── Singleton Registry ───────────────────────────────────

export const toolRegistry = new ToolRegistry();

// ─── Register All Tools ───────────────────────────────────

import { createFileTool } from "./create-file.js";
import { editFileTool } from "./edit-file.js";
import { deleteFileTool } from "./delete-file.js";
import { readFileTool } from "./read-file.js";
import { listFilesTool } from "./list-files.js";
import { runBuildTool } from "./run-build.js";
import { searchFilesTool } from "./search-files.js";
import { installPackageTool } from "./install-package.js";
import { askClarificationTool } from "./plan-tools.js";
import { createPlanTool } from "./plan-tools.js";
import { markStepCompleteTool } from "./plan-tools.js";

toolRegistry.register(createFileTool);
toolRegistry.register(editFileTool);
toolRegistry.register(deleteFileTool);
toolRegistry.register(readFileTool);
toolRegistry.register(listFilesTool);
toolRegistry.register(runBuildTool);
toolRegistry.register(searchFilesTool);
toolRegistry.register(installPackageTool);
toolRegistry.register(askClarificationTool);
toolRegistry.register(createPlanTool);
toolRegistry.register(markStepCompleteTool);
