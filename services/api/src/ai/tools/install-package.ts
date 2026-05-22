import { spawn } from "node:child_process";
import type { Tool } from "./index.js";
import { getProjectPath } from "../project-files.js";
import { restartDevServer, isRunning } from "../../projects/dev-server.js";
import { buildSafeEnv } from "../../projects/safe-env.js";
import { linkDoableSdk } from "../../projects/link-sdk.js";
import { sql } from "../../db/index.js";
import { getSandboxSettings, listSandboxRules } from "../../sandbox/queries.js";
import { evaluateSandbox } from "../../sandbox/rule-matcher.js";
import { jailedSpawn } from "../../sandbox/orchestrator.js";
import { loadSystemRules } from "../../sandbox/system-rules.js";

// Blocked packages are now loaded from the sandbox_system_rules table
// (Migration 080, scope='global', rule_type='package'). Manage via
// `doable admin` CLI/TUI. Fallback defaults are in system-rules.ts.

/**
 * Look up the workspace id for a project. Returns null if the project
 * row is missing or the column is unset, in which case the install
 * proceeds without consulting workspace rules (preserves behavior for
 * legacy / on-disk projects).
 */
async function getWorkspaceIdForProject(projectId: string): Promise<string | null> {
  try {
    const [row] = await sql<{ workspace_id: string | null }[]>`
      SELECT workspace_id FROM projects WHERE id = ${projectId}
    `;
    return row?.workspace_id ?? null;
  } catch {
    return null;
  }
}

// Allowed package managers
const ALLOWED_MANAGERS = ["npm", "pnpm", "yarn"] as const;
type PackageManager = (typeof ALLOWED_MANAGERS)[number];

export const installPackageTool: Tool = {
  name: "install_package",
  description:
    "Install an npm package in the project. Supports npm, pnpm, and yarn.",
  parameters: {
    type: "object",
    properties: {
      packages: {
        type: "array",
        items: { type: "string" },
        description: "Package names to install (e.g. ['react', 'react-dom'])",
      },
      dev: {
        type: "boolean",
        description: "Install as dev dependency (default: false)",
        default: false,
      },
      package_manager: {
        type: "string",
        enum: ["npm", "pnpm", "yarn"],
        description: "Package manager to use (default: npm)",
        default: "npm",
      },
    },
    required: ["packages"],
  },

  async execute(params, ctx) {
    const packages = params.packages as string[];
    const isDev = Boolean(params.dev ?? false);
    const pm = (params.package_manager as PackageManager) ?? "npm";

    if (!packages || packages.length === 0) {
      return {
        success: false,
        output: "",
        error: "No packages specified",
      };
    }

    // Validate package manager
    if (!ALLOWED_MANAGERS.includes(pm)) {
      return {
        success: false,
        output: "",
        error: `Invalid package manager: ${pm}. Use: ${ALLOWED_MANAGERS.join(", ")}`,
      };
    }

    // Validate package names against system-level blocked packages (DB)
    // and workspace sandbox rules. System rules come from
    // sandbox_system_rules (Migration 080). Workspace rules come from
    // workspace_sandbox_rules (Migration 073).
    const sys = await loadSystemRules();
    const workspaceId = await getWorkspaceIdForProject(ctx.projectId);
    const sandboxSettings = workspaceId
      ? await getSandboxSettings(workspaceId)
      : { tool_default_action: "allow" as const, network_default_action: "allow" as const };
    const sandboxRules = workspaceId ? await listSandboxRules(workspaceId) : [];

    for (const pkg of packages) {
      const name = pkg.replace(/@[\d^~>=<.*]+$/, ""); // Strip version
      if (sys.blockedPackages.has(name)) {
        return {
          success: false,
          output: "",
          error: `Package '${name}' is blocked for security reasons`,
        };
      }
      if (!/^(@[\w-]+\/)?[\w.-]+(@.*)?$/.test(pkg)) {
        return {
          success: false,
          output: "",
          error: `Invalid package name: ${pkg}`,
        };
      }
      // Workspace sandbox rules. Tool target shape: 'install:<package>'.
      // The pattern can be e.g. 'install:eval', 'install:*' (block all),
      // 'install:@evil/*' (block scope). See sandbox/rule-matcher.ts.
      if (workspaceId) {
        const verdict = evaluateSandbox(
          sandboxRules,
          "tool",
          sandboxSettings.tool_default_action,
          `install:${name}`,
        );
        if (verdict.action === "deny") {
          return {
            success: false,
            output: "",
            error: `Package '${name}' is denied by workspace sandbox policy. ${verdict.reason}`,
          };
        }
      }
    }

    const cwd = getProjectPath(ctx.projectId);

    // Special-case @doable/sdk — it's a private workspace package, not on npm.
    // Link it from the monorepo instead of running npm install.
    const sdkPackages = packages.filter((p) => p === "@doable/sdk" || p.startsWith("@doable/sdk@"));
    const npmPackages = packages.filter((p) => p !== "@doable/sdk" && !p.startsWith("@doable/sdk@"));

    if (sdkPackages.length > 0) {
      try {
        await linkDoableSdk(cwd);
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Failed to link @doable/sdk: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // If only @doable/sdk was requested, skip npm install entirely
    if (npmPackages.length === 0) {
      let restarted = false;
      if (isRunning(ctx.projectId)) {
        try {
          await restartDevServer(ctx.projectId, { userId: ctx.userId });
          restarted = true;
        } catch (err) {
          console.error(`[install_package] Failed to restart dev server:`, err);
        }
      }
      return {
        success: true,
        output: `Linked @doable/sdk${restarted ? " (dev server restarted)" : ""}`,
        metadata: { packages: sdkPackages, dev: isDev, packageManager: pm },
      };
    }

    const args = buildArgs(pm, npmPackages, isDev);

    const result = await runInstall(pm, args, cwd, {
      projectId: ctx.projectId,
      workspaceId: workspaceId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
    });

    if (!result.success) {
      return {
        success: false,
        output: result.output,
        error: result.error ?? "Installation failed",
      };
    }

    // Restart the Vite dev server so it picks up newly installed packages
    let restarted = false;
    if (isRunning(ctx.projectId)) {
      try {
        await restartDevServer(ctx.projectId, { userId: ctx.userId });
        restarted = true;
      } catch (err) {
        console.error(`[install_package] Failed to restart dev server:`, err);
      }
    }

    return {
      success: true,
      output: `Installed ${[...sdkPackages.map(() => "@doable/sdk (linked)"), ...npmPackages].join(", ")}${isDev ? " (dev)" : ""}${restarted ? " (dev server restarted)" : ""}\n${result.output}`,
      metadata: { packages: [...sdkPackages, ...npmPackages], dev: isDev, packageManager: pm },
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────

function buildArgs(pm: PackageManager, packages: string[], isDev: boolean): string[] {
  switch (pm) {
    case "npm":
      // --include=dev guards against NODE_ENV=production (the api container
      // default) making npm install run in --omit=dev mode and pruning the
      // scaffold's vite/plugin-react/typescript devDeps as "extraneous".
      // The restart that install-package triggers right after would then
      // die with Cannot find module .../vite/bin/vite.js.
      return ["install", "--ignore-scripts", "--include=dev", ...(isDev ? ["--save-dev"] : []), ...packages];
    case "pnpm":
      return ["add", "--ignore-scripts", ...(isDev ? ["-D"] : []), ...packages];
    case "yarn":
      return ["add", "--ignore-scripts", ...(isDev ? ["--dev"] : []), ...packages];
  }
}

/**
 * Spawn the package manager to install the requested packages.
 *
 * Note (Phase 1D of integration↔AI chat bridge): vault-backed integration env
 * vars are intentionally NOT injected here. All three supported package
 * managers run with `--ignore-scripts` (see `buildArgs` above), which disables
 * postinstall lifecycle scripts entirely. Postinstall scripts are the only
 * thing that would consume env vars during install, so threading vault
 * credentials through this path would buy nothing while expanding the surface
 * area where decrypted secrets live in process memory. The Vite dev server
 * (which actually consumes those env vars at runtime) gets restarted right
 * after install completes — see the `restartDevServer` call above — and that
 * spawn picks up the vault env via the normal `startDevServer` path.
 */
async function runInstall(
  pm: string,
  args: string[],
  cwd: string,
  spawnCtx: {
    projectId: string;
    workspaceId: string | null;
    userId: string;
    sessionId: string;
  },
): Promise<{ success: boolean; output: string; error?: string }> {
  // Feature flag: DOABLE_SANDBOX_INSTALL=1 routes through the new jailedSpawn
  // orchestrator. OFF by default — operators flip per host once verified.
  const useJail = process.env.DOABLE_SANDBOX_INSTALL === "1";

  if (useJail) {
    try {
      const hardening = (process.env.DOABLE_HARDENING_LEVEL ?? "dev") as
        | "off"
        | "dev"
        | "staging"
        | "prod";
      const result = await jailedSpawn(
        pm,
        args,
        {
          projectId: spawnCtx.projectId,
          workspaceId: spawnCtx.workspaceId,
          userId: spawnCtx.userId,
          sessionId: spawnCtx.sessionId,
          hardening,
        },
        "install",
      );
      const combined = (result.stdout ?? "") + (result.stderr ?? "");
      const success = result.exitCode === 0 && !result.oomKilled;
      return {
        success,
        output: combined,
        error: !success
          ? result.oomKilled
            ? `${pm} killed (out of memory)`
            : `${pm} exited with code ${result.exitCode}`
          : undefined,
      };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: `Failed to run ${pm} via jailedSpawn: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Legacy path — raw spawn, kept side-by-side for safety.
  return new Promise((resolve) => {
    const child = spawn(pm, args, {
      cwd,
      shell: true,
      stdio: "pipe",
      // NODE_ENV=development to keep devDeps in place; the api container
      // runs NODE_ENV=production by default, which makes `npm install`
      // prune the scaffold's vite/plugin-react/typescript as "extraneous".
      env: buildSafeEnv(undefined, { FORCE_COLOR: "0", NODE_ENV: "development" }),
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        error: `Failed to run ${pm}: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: stdout + stderr,
        error: code !== 0 ? `${pm} exited with code ${code}` : undefined,
      });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill("SIGTERM");
    }, 120_000);
  });
}
