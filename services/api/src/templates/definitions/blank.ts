import type { TemplateDefinition } from "../registry.js";

export const blankTemplate: TemplateDefinition = {
  id: "blank",
  name: "Blank Project",
  description: "Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.",
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
          "lucide-react": "^0.577.0",
          "tailwind-merge": "^2.6.0",
        },
        devDependencies: {
          "@tailwindcss/vite": "^4.0.0",
          "@types/react": "^19.0.3",
          "@types/react-dom": "^19.0.2",
          "@vitejs/plugin-react": "^4.3.4",
          tailwindcss: "^4.0.0",
          typescript: "^5.7.2",
          vite: "^6.0.0",
        },
      },
      null,
      2
    ),

    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
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
import App from "./App";
import "./index.css";

// Error Boundary - catches React rendering errors and shows a friendly message
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report to parent frame for auto-fix
    try {
      window.parent.postMessage({
        type: 'doable-preview-error',
        errors: [{
          message: error.message,
          source: info.componentStack || '',
          stack: error.stack || '',
          timestamp: Date.now()
        }]
      }, '*');
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fdf2f8, #faf5ff, #eff6ff)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '24px'
        }}>
          <div style={{
            maxWidth: '420px',
            textAlign: 'center',
            background: 'white',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '20px'
            }}>\u2728</div>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1f2937',
              margin: '0 0 8px'
            }}>Making improvements...</h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0 0 24px',
              lineHeight: 1.5
            }}>
              Doable is automatically fixing this. The preview will update in a moment.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Refresh Preview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
`,

    "src/App.tsx": `export default function App() {
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
}
`,

    "src/index.css": `@import "tailwindcss";

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-ring: hsl(var(--ring));
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

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
  border-color: var(--color-border);
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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
- Styling: Tailwind CSS 4 (using @tailwindcss/vite plugin)
- UI Components: shadcn/ui pattern (add as needed)
- Icons: Lucide React
- Utilities: clsx + tailwind-merge via cn()

## File Structure
- \`src/App.tsx\` — Root component (default export)
- \`src/main.tsx\` — Entry point
- \`src/lib/utils.ts\` — Utility functions (cn, etc.)
- \`src/components/\` — Reusable components (create as needed)
- \`src/hooks/\` — Custom hooks (create as needed)

## Conventions
- Path alias: \`@/\` maps to \`src/\`
- CSS variables for theming (see index.css @theme section)
- shadcn/ui color system with HSL variables
- Tailwind v4: use \`@import "tailwindcss"\` (not @tailwind directives)
`,
  },
};
