import type { TemplateDefinition } from "../registry.js";

export const blankTemplate: TemplateDefinition = {
  id: "blank",
  name: "Blank Project",
  description: "Minimal React + Vite + Tailwind CSS + shadcn/ui starter. Clean slate with best-practice defaults.",
  category: "starter",
  previewImageUrl: null,
  isOfficial: true,

  codeFiles: {
    "package.json": JSON.stringify(
      {
        name: "doable-project",
        private: true,
        version: "0.0.1",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "class-variance-authority": "^0.7.1",
          clsx: "^2.1.1",
          "lucide-react": "^0.468.0",
          "tailwind-merge": "^2.6.0",
          "tailwindcss-animate": "^1.0.7",
        },
        devDependencies: {
          "@types/react": "^19.0.3",
          "@types/react-dom": "^19.0.2",
          "@vitejs/plugin-react": "^4.3.4",
          autoprefixer: "^10.4.20",
          postcss: "^8.4.49",
          tailwindcss: "^3.4.17",
          typescript: "^5.7.2",
          vite: "^6.0.0",
        },
      },
      null,
      2
    ),

    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
`,

    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noUncheckedIndexedAccess: true,
          resolveJsonModule: true,
          isolatedModules: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
          noEmit: true,
        },
        include: ["src"],
      },
      null,
      2
    ),

    "tailwind.config.ts": `import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
`,

    "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,

    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Doable Project</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

    "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

    "src/App.tsx": `export const App = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Your project is ready
        </h1>
        <p className="text-muted-foreground">
          Start building by editing <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">src/App.tsx</code>
        </p>
      </div>
    </div>
  );
};
`,

    "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}
`,

    "src/lib/utils.ts": `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
  },

  contextOverrides: {
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3 + tailwindcss-animate
- UI Components: shadcn/ui pattern (add as needed)
- Icons: Lucide React
- Utilities: clsx + tailwind-merge via cn()

## File Structure
- \`src/App.tsx\` — Root component
- \`src/main.tsx\` — Entry point
- \`src/lib/utils.ts\` — Utility functions (cn, etc.)
- \`src/components/\` — Reusable components (create as needed)
- \`src/hooks/\` — Custom hooks (create as needed)

## Conventions
- Path alias: \`@/\` maps to \`src/\`
- CSS variables for theming (see index.css)
- shadcn/ui color system with HSL variables
`,
  },
};
