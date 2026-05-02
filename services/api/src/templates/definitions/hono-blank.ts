import type { TemplateDefinition } from "../registry.js";

/**
 * Hono blank starter (Node.js runtime).
 *
 * Pairs with the `hono` framework adapter. The agent prompt for
 * `framework_id: "hono"` documents Hono conventions (chained route
 * definitions on a single Hono() app, Web-standard Request/Response,
 * @hono/node-server for the Node adapter, tsx for dev/HMR).
 *
 * Minimum viable shape: package.json + tsconfig.json + src/index.ts.
 * Enough for `pnpm dev` (tsx watch) to boot, respond at GET /, and let
 * the AI build features on top.
 */

const PACKAGE_JSON = JSON.stringify(
  {
    name: "doable-hono-project",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
    },
    dependencies: {
      hono: "^4.0.0",
      "@hono/node-server": "^1.0.0",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      tsx: "^4.0.0",
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      isolatedModules: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  },
  null,
  2,
);

const SRC_INDEX_TS = `import { Hono } from "hono";
import { serve } from "@hono/node-server";

/**
 * Hono entrypoint for the Doable starter. Chained route definitions
 * keep the type information flowing into the client; serve() boots a
 * Node HTTP server on the supervisor-provided PORT (defaults to 3000).
 */
const app = new Hono();

app.get("/", (c) => c.text("Welcome to Hono"));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`Hono server listening on http://127.0.0.1:\${info.port}\`);
});
`;

const GITIGNORE = `# Build artifacts
dist/

# Dependencies
node_modules

# Misc
.DS_Store
*.log

# TypeScript
*.tsbuildinfo

# Local env files
.env
.env.local
.env*.local
`;

export const honoBlankTemplate: TemplateDefinition = {
  id: "hono-blank",
  name: "Hono",
  description:
    "Hono + TypeScript starter on the Node.js runtime. Web-standard Request/Response, chained route definitions, tsx-powered HMR for dev.",
  category: "starter",
  tags: ["hono", "typescript", "api", "node", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "hono",

  codeFiles: {
    "package.json": PACKAGE_JSON,
    "tsconfig.json": TSCONFIG,
    "src/index.ts": SRC_INDEX_TS,
    ".gitignore": GITIGNORE,
  },
};
