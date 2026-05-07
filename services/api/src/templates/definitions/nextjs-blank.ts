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
import path from "path";

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
  // Prevent file tracing from scanning parent directories (monorepo root).
  outputFileTracingRoot: path.resolve(__dirname),
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
      paths: { "@/*": ["./*"] },
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

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
}

:root {
  --background: #ffffff;
  --foreground: #171717;
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
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
    // suppressHydrationWarning is REQUIRED on both <html> and <body>:
    // the Doable preview proxy injects scripts (storage namespace, error
    // capture, visual-edit bridge, analytics) into <head> AND <body> on
    // the way out, so the served HTML doesn't match what React's server
    // bundle produced. Without these props, React logs a hydration error
    // on every page load. They have no impact in production (proxy is
    // only active in the chat preview).
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
`;

const APP_PAGE = `"use client";

import { useState, useEffect } from "react";

const phrases = [
  "Dream it. Build it.",
  "Ideas become reality here.",
  "Your canvas awaits.",
  "Let's create something amazing.",
  "From zero to wow.",
];

function DoableLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <rect width="40" height="40" rx="10" className="fill-[#F97316]">
        <animate attributeName="rx" values="10;14;10" dur="3s" repeatCount="indefinite" />
      </rect>
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" className="fill-white" style={{ fontSize: "22px", fontWeight: 700, fontFamily: "system-ui" }}>
        D
      </text>
    </svg>
  );
}

export default function Home() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setOpacity(1);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-50 via-stone-100 to-white dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <DoableLogo className="w-16 h-16 drop-shadow-lg" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Doable
          </h1>
          <p
            className="text-lg text-[#F97316] font-medium transition-opacity duration-400"
            style={{ opacity, transitionDuration: "400ms" }}
          >
            {phrases[phraseIndex]}
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#F97316]"
                style={{
                  animation: \`pulse-dot 1.4s ease-in-out \${i * 0.2}s infinite\`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
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
