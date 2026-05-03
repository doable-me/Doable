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
import { html } from "hono/html";

/**
 * Hono entrypoint for the Doable starter. Chained route definitions
 * keep the type information flowing into the client; serve() boots a
 * Node HTTP server on the supervisor-provided PORT (defaults to 3000).
 */
const app = new Hono();

const landingPage = html\`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Doable App</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #ffffff; --fg: #171717; --muted: #737373; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0a0a0a; --fg: #ededed; --muted: #a3a3a3; }
    }
    body {
      font-family: "Inter", system-ui, sans-serif;
      background: var(--bg);
      color: var(--fg);
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { text-align: center; }
    .container > * + * { margin-top: 1.5rem; }
    .logo-wrap { display: flex; justify-content: center; }
    .logo { width: 4rem; height: 4rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
    h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; }
    .tagline { font-size: 1.125rem; color: #F97316; font-weight: 500; transition: opacity 400ms; }
    .subtitle { font-size: 0.875rem; color: var(--muted); }
    .dots { display: flex; justify-content: center; gap: 0.375rem; padding-top: 0.5rem; }
    .dot {
      width: 0.375rem; height: 0.375rem; border-radius: 50%; background: #F97316;
      animation: pulse-dot 1.4s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse-dot {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.2); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-wrap">
      <svg viewBox="0 0 40 40" fill="none" class="logo">
        <rect width="40" height="40" rx="10" fill="#F97316">
          <animate attributeName="rx" values="10;14;10" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" style="font-size:22px;font-weight:700;font-family:system-ui">D</text>
      </svg>
    </div>
    <div>
      <h1>Doable</h1>
      <p class="tagline" id="tagline">Dream it. Build it.</p>
    </div>
    <p class="subtitle">Your project is ready &mdash; start chatting to build</p>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  </div>
  <script>
    const phrases = ["Dream it. Build it.", "Ideas become reality here.", "Your canvas awaits.", "Let's create something amazing.", "From zero to wow."];
    let i = 0;
    const el = document.getElementById("tagline");
    setInterval(() => { el.style.opacity = "0"; setTimeout(() => { i = (i + 1) % phrases.length; el.textContent = phrases[i]; el.style.opacity = "1"; }, 400); }, 3500);
  </script>
</body>
</html>\`;

app.get("/", (c) => c.html(landingPage));

// Support Doable preview base path
const basePath = process.env.DOABLE_BASE_PATH;
if (basePath && basePath !== "/") {
  app.get(basePath, (c) => c.html(landingPage));
  app.get(basePath.replace(/\\/$/, ""), (c) => c.html(landingPage));
}

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(\`Hono server listening on http://\${hostname}:\${info.port}\`);
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
