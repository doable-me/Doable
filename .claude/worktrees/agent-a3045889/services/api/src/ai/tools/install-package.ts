import { spawn } from "node:child_process";
import type { Tool } from "./index.js";
import { getProjectPath } from "../project-files.js";

// Packages that should never be installed
const BLOCKED_PACKAGES = new Set([
  "eval",
  "child_process",
  "fs-extra-unsafe",
]);

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

    // Validate package names
    for (const pkg of packages) {
      const name = pkg.replace(/@[\d^~>=<.*]+$/, ""); // Strip version
      if (BLOCKED_PACKAGES.has(name)) {
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
    }

    const cwd = getProjectPath(ctx.projectId);
    const args = buildArgs(pm, packages, isDev);

    const result = await runInstall(pm, args, cwd);

    if (!result.success) {
      return {
        success: false,
        output: result.output,
        error: result.error ?? "Installation failed",
      };
    }

    return {
      success: true,
      output: `Installed ${packages.join(", ")}${isDev ? " (dev)" : ""}\n${result.output}`,
      metadata: { packages, dev: isDev, packageManager: pm },
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────

function buildArgs(pm: PackageManager, packages: string[], isDev: boolean): string[] {
  switch (pm) {
    case "npm":
      return ["install", ...(isDev ? ["--save-dev"] : []), ...packages];
    case "pnpm":
      return ["add", ...(isDev ? ["-D"] : []), ...packages];
    case "yarn":
      return ["add", ...(isDev ? ["--dev"] : []), ...packages];
  }
}

function runInstall(
  pm: string,
  args: string[],
  cwd: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(pm, args, {
      cwd,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
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
