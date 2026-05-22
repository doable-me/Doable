/**
 * Doable-owned `bash` tool — overrides the Copilot SDK's built-in bash.
 *
 * Per SandboxAgnosticSandboxingPRD/13-ai-tool-integration.md §§4-6, the SDK
 * exposes a `bash` tool we cannot disable. By registering our own `bash` with
 * `overridesBuiltInTool: true`, the SDK quietly routes every model `bash`
 * call into this handler. From here, we hand off to `jailedSpawn` so the
 * command runs inside the configured sandbox backend (psroot / bubblewrap /
 * systemd / sandbox-exec / dovault), never directly on the host.
 *
 * The `onPreToolUse` hook in copilot-engine.ts keeps its regex denylist as
 * a second line of defense.
 */

import { defineTool, type Tool } from "@github/copilot-sdk";
import { jailedSpawn, type SpawnContext } from "../../sandbox/orchestrator.js";
import { acquireDevUid } from "../../runtime/dev-uid-allocator.js";

const MAX_OUTPUT_BYTES = 1_000_000; // 1 MB cap per stream, per PRD §6.4 / §8.

function truncateOutput(s: string): string {
  if (Buffer.byteLength(s, "utf8") <= MAX_OUTPUT_BYTES) return s;
  // Slice on bytes — JS strings are UTF-16, but Copilot transcript expects
  // UTF-8 sizes. Buffer slice keeps the cap honest at the wire level.
  const buf = Buffer.from(s, "utf8").slice(0, MAX_OUTPUT_BYTES);
  return buf.toString("utf8") + "\n[truncated: output exceeded 1 MB]";
}

export interface BashToolCtx {
  projectId: string;
  workspaceId?: string | null;
  userId: string;
  sessionId: string;
}

/**
 * Build the Doable-owned `bash` tool. Wire it into the per-session tool list
 * so the SDK routes every model `bash` call through `jailedSpawn` instead of
 * the CLI's built-in unsandboxed shell.
 */
export function createBashTool(ctx: BashToolCtx): Tool {
  return defineTool("bash", {
    description:
      "Execute a shell command in the project sandbox. All commands run inside the configured isolation backend (psroot / bubblewrap / systemd / sandbox-exec / dovault); the host filesystem and network are not directly accessible.",
    overridesBuiltInTool: true,
    parameters: {
      type: "object" as const,
      properties: {
        command: {
          type: "string" as const,
          description:
            "The shell command to run. Executed as `/bin/sh -c <command>` inside the sandbox.",
        },
      },
      required: ["command"] as const,
    },
    handler: async (args: { command: string }) => {
      const command = args.command;
      if (!command || typeof command !== "string") {
        return {
          success: false,
          error: "bash: missing required 'command' argument",
          output: "",
        };
      }

      // R14 BUG-R13-DEV-VITE-UIDNS — share the dev-server's sandbox uid so the
      // AI bash tool can write into the project dir owned by that uid. acquireDevUid
      // is idempotent: returns the existing per-project uid if one was already
      // allocated by dev-server-start (matching path: same project, same uid).
      // Returns null on non-Linux or when sudo+sandbox-spawn isn't installed.
      const projectSandboxUid = acquireDevUid(ctx.projectId) ?? undefined;

      const spawnCtx: SpawnContext = {
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId ?? null,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        hardening:
          (process.env.DOABLE_HARDENING_LEVEL as SpawnContext["hardening"]) ??
          "dev",
        hostUid: projectSandboxUid,
      };

      try {
        const result = await jailedSpawn(
          "/bin/sh",
          ["-c", command],
          spawnCtx,
          "ai-bash",
        );

        const stdout = truncateOutput(result.stdout);
        const stderr = truncateOutput(result.stderr);
        const success = result.exitCode === 0 && !result.oomKilled;

        const output = [
          stdout,
          stderr ? `\n[stderr]\n${stderr}` : "",
        ].join("");

        return {
          success,
          output,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          oomKilled: result.oomKilled,
          backendId: result.backendId,
          profileId: result.profileId,
          message: success
            ? `Command exited 0 in ${result.durationMs}ms (backend=${result.backendId})`
            : result.oomKilled
              ? `Command killed (OOM) after ${result.durationMs}ms`
              : `Command exited ${result.exitCode} in ${result.durationMs}ms`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: "",
          error: `bash: sandbox spawn failed — ${message}`,
        };
      }
    },
  }) as Tool;
}
