import type { TemplateDefinition } from "../registry.js";

/**
 * Next.js (App Router) blank starter.
 *
 * Pairs with the `nextjs-app` framework adapter. The agent prompt for
 * `framework_id: "nextjs-app"` documents the App Router conventions
 * (server components, server actions, route handlers, NEXT_PUBLIC_*
 * env prefix, Tailwind v4 via @tailwindcss/postcss).
 *
 * Minimum viable shape: package.json + next.config.ts + tsconfig.json +
 * tailwind config + app/{layout,page,globals.css}. Enough for `next dev`
 * to boot, render a starter page, and let the AI build features on top.
 */

const PACKAGE_JSON = JSON.stringify(
  {
    name: "doable-nextjs-project",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "^15.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      tailwindcss: "^4.0.0",
      "@tailwindcss/postcss": "^4.0.0",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const NEXT_CONFIG_TS = `import type { NextConfig } from "next";

/**
 * Next.js config. Doable threads its preview base path via the
 * DOABLE_BASE_PATH env var; surface it as basePath so links resolve
 * correctly under /preview/{projectId}/. In production the runtime
 * supervisor (PRD 06) hosts this app at the project's root subdomain
 * and DOABLE_BASE_PATH is empty.
 */
const basePath = process.env.DOABLE_BASE_PATH && process.env.DOABLE_BASE_PATH !== "/"
  ? process.env.DOABLE_BASE_PATH.replace(/\\/$/, "")
  : "";

const nextConfig: NextConfig = {
  basePath,
  reactStrictMode: true,
  // Standalone output gives the production runtime a self-contained
  // server bundle the supervisor can launch via node .next/standalone/server.js.
  output: "standalone",
};

export default nextConfig;
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      paths: { "@/*": ["./src/*"] },
      plugins: [{ name: "next" }],
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  },
  null,
  2,
);

const POSTCSS_CONFIG = `module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
`;

const GLOBALS_CSS = `@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
`;

const APP_LAYOUT = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doable App",
  description: "Built with Next.js on Doable",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const APP_PAGE = `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to your Next.js app</h1>
        <p className="text-lg opacity-80 mb-8">
          Edit <code className="bg-black/10 dark:bg-white/10 px-2 py-1 rounded">app/page.tsx</code>{" "}
          and the AI will build features on top of this scaffold.
        </p>
        <p className="text-sm opacity-60">
          Server components, server actions, and route handlers are all available.
          Use <code className="bg-black/10 dark:bg-white/10 px-2 py-1 rounded">process.env.X</code>{" "}
          for server-only secrets and{" "}
          <code className="bg-black/10 dark:bg-white/10 px-2 py-1 rounded">NEXT_PUBLIC_*</code>{" "}
          for browser-safe values.
        </p>
      </div>
    </main>
  );
}
`;

const NEXT_ENV_DTS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited.
`;

const GITIGNORE = `# Next.js build artifacts
/.next/
/out/

# Production
/build

# Dependencies
node_modules

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env
.env.local
.env*.local

# TypeScript
*.tsbuildinfo
next-env.d.ts
`;

export const nextjsBlankTemplate: TemplateDefinition = {
  id: "nextjs-blank",
  name: "Next.js (App Router)",
  description:
    "Next.js 15 + React 19 + TypeScript + Tailwind CSS v4 starter with App Router. Server components, server actions, and route handlers ready out of the box.",
  category: "starter",
  tags: ["nextjs", "react", "tailwind", "typescript", "ssr", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "nextjs-app",

  codeFiles: {
    "package.json": PACKAGE_JSON,
    "next.config.ts": NEXT_CONFIG_TS,
    "tsconfig.json": TSCONFIG,
    "postcss.config.js": POSTCSS_CONFIG,
    "next-env.d.ts": NEXT_ENV_DTS,
    ".gitignore": GITIGNORE,
    "app/layout.tsx": APP_LAYOUT,
    "app/page.tsx": APP_PAGE,
    "app/globals.css": GLOBALS_CSS,
  },
};
