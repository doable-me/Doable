import { spawn } from "node:child_process";
import type { Tool } from "./index.js";
import { getProjectPath } from "../project-files.js";

export const searchFilesTool: Tool = {
  name: "search_files",
  description:
    "Search for text patterns across project files using grep. " +
    "Supports regex patterns. Returns matching lines with file paths and line numbers.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Search pattern (regex supported)",
      },
      glob: {
        type: "string",
        description: "File glob filter (e.g. '*.tsx', '*.css')",
      },
      case_sensitive: {
        type: "boolean",
        description: "Case-sensitive search (default: false)",
        default: false,
      },
      max_results: {
        type: "number",
        description: "Maximum number of matches to return (default: 50)",
        default: 50,
      },
    },
    required: ["pattern"],
  },

  async execute(params, ctx) {
    const pattern = String(params.pattern);
    const glob = params.glob ? String(params.glob) : undefined;
    const caseSensitive = Boolean(params.case_sensitive ?? false);
    const maxResults = Number(params.max_results ?? 50);

    const cwd = getProjectPath(ctx.projectId);

    const args = [
      "--line-number",
      "--no-heading",
      "--color=never",
      `--max-count=${maxResults}`,
    ];

    if (!caseSensitive) {
      args.push("--ignore-case");
    }

    if (glob) {
      args.push("--glob", glob);
    }

    // Exclude common directories
    args.push("--glob", "!node_modules");
    args.push("--glob", "!.git");
    args.push("--glob", "!dist");

    args.push("--", pattern, ".");

    const result = await runCommand("rg", args, cwd);

    // Fall back to grep if ripgrep isn't available
    if (result.error && result.error.includes("ENOENT")) {
      return await fallbackGrep(pattern, cwd, caseSensitive, maxResults);
    }

    if (result.output.trim().length === 0) {
      return {
        success: true,
        output: `No matches found for pattern: ${pattern}`,
        metadata: { count: 0 },
      };
    }

    const lines = result.output.trim().split("\n");
    return {
      success: true,
      output: `${lines.length} matches:\n${result.output.trim()}`,
      metadata: { count: lines.length },
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ output: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "pipe" });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve({ output: "", error: err.message });
    });

    child.on("close", () => {
      resolve({
        output: stdout,
        error: stderr.length > 0 ? stderr : undefined,
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill("SIGTERM");
    }, 30_000);
  });
}

async function fallbackGrep(
  pattern: string,
  cwd: string,
  caseSensitive: boolean,
  _maxResults: number,
): Promise<{ success: boolean; output: string; metadata?: Record<string, unknown> }> {
  const args = ["-rn", "--include=*.*"];
  if (!caseSensitive) args.push("-i");
  args.push("--", pattern, ".");

  const result = await runCommand("grep", args, cwd);

  if (result.output.trim().length === 0) {
    return {
      success: true,
      output: `No matches found for pattern: ${pattern}`,
      metadata: { count: 0 },
    };
  }

  const lines = result.output.trim().split("\n");
  return {
    success: true,
    output: `${lines.length} matches:\n${result.output.trim()}`,
    metadata: { count: lines.length },
  };
}
