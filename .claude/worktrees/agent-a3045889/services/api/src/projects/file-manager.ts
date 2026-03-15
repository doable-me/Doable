/**
 * Project File Manager
 *
 * Scaffolds Vite+React+TypeScript projects on the server filesystem
 * and provides file CRUD operations. This is the core of how Doable's
 * live preview works — files written here are served by the Vite dev server.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
  listProjectFiles,
  getProjectPath,
  ensureProjectDir,
  FileNotFoundError,
  FileAccessError,
} from "../ai/project-files.js";

// Re-export for convenience
export {
  readProjectFile as readFile,
  writeProjectFile as writeFile,
  deleteProjectFile as deleteFile,
  listProjectFiles as listFiles,
  getProjectPath,
  FileNotFoundError,
  FileAccessError,
};

// ─── Scaffold Templates ──────────────────────────────────

function packageJson(): string {
  return JSON.stringify(
    {
      name: "doable-project",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@tailwindcss/vite": "^4.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^4.3.0",
        tailwindcss: "^4.0.0",
        typescript: "^5.7.0",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  );
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
  },
});
`;
}

function tsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: "force",
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedSideEffectImports: true,
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function indexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Doable App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function mainTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function appTsx(): string {
  return `function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-indigo-600 mb-4">
          Hello from Doable
        </h1>
        <p className="text-gray-600 text-lg">
          Start building your app by chatting with the AI assistant.
        </p>
      </div>
    </div>
  );
}

export default App;
`;
}

function indexCss(): string {
  return `@import "tailwindcss";
`;
}

function viteEnvDts(): string {
  return `/// <reference types="vite/client" />
`;
}

// ─── Scaffold Function ───────────────────────────────────

export interface ScaffoldResult {
  projectPath: string;
  files: string[];
  installOutput: string;
}

/**
 * Create a new Vite+React+TypeScript project scaffold.
 * Writes all template files and runs `pnpm install`.
 */
export async function createProject(projectId: string): Promise<ScaffoldResult> {
  const projectPath = getProjectPath(projectId);

  // Check if already scaffolded
  if (existsSync(projectPath + "/package.json")) {
    throw new ProjectExistsError(projectId);
  }

  await ensureProjectDir(projectId);

  // Write all scaffold files
  const files: Array<[string, string]> = [
    ["package.json", packageJson()],
    ["vite.config.ts", viteConfig()],
    ["tsconfig.json", tsConfig()],
    ["index.html", indexHtml()],
    ["src/main.tsx", mainTsx()],
    ["src/App.tsx", appTsx()],
    ["src/index.css", indexCss()],
    ["src/vite-env.d.ts", viteEnvDts()],
  ];

  const createdFiles: string[] = [];
  for (const [filePath, content] of files) {
    await writeProjectFile(projectId, filePath, content);
    createdFiles.push(filePath);
  }

  // Run pnpm install
  const installOutput = await runPnpmInstall(projectPath);

  return {
    projectPath,
    files: createdFiles,
    installOutput,
  };
}

/**
 * Check if a project has been scaffolded (has package.json).
 */
export function isProjectScaffolded(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);
  return existsSync(projectPath + "/package.json");
}

// ─── pnpm Install ────────────────────────────────────────

function runPnpmInstall(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use npm instead of pnpm to avoid workspace interference
    // (pnpm in a monorepo would treat the project as a workspace member)
    const child = spawn("npm", ["install", "--legacy-peer-deps"], {
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
      reject(new Error(`Failed to run pnpm install: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(
          new Error(`pnpm install exited with code ${code}:\n${stdout}\n${stderr}`),
        );
      }
    });

    // Timeout after 3 minutes
    setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("pnpm install timed out after 3 minutes"));
    }, 180_000);
  });
}

// ─── Errors ──────────────────────────────────────────────

export class ProjectExistsError extends Error {
  readonly projectId: string;
  constructor(projectId: string) {
    super(`Project already scaffolded: ${projectId}`);
    this.name = "ProjectExistsError";
    this.projectId = projectId;
  }
}
