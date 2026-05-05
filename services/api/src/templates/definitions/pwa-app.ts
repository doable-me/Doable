import type { TemplateDefinition } from "../registry.js";

export const pwaAppTemplate: TemplateDefinition = {
  id: "pwa-app",
  name: "Progressive Web App",
  description:
    "Installable PWA with offline support, service worker, manifest, and mobile-optimized UI. Works on phones, tablets, and desktops like a native app.",
  category: "starter",
  tags: ["react", "vite", "pwa", "offline", "installable", "mobile", "service-worker"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "vite-react",

  codeFiles: {
    "package.json": JSON.stringify(
      {
        name: "doable-pwa",
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
          "idb-keyval": "^6.2.1",
        },
        devDependencies: {
          "@tailwindcss/vite": "^4.0.0",
          "@types/react": "^19.0.3",
          "@types/react-dom": "^19.0.2",
          "@vitejs/plugin-react": "^4.3.4",
          "enhanced-resolve": "^5.18.1",
          tailwindcss: "^4.0.0",
          typescript: "^5.7.2",
          vite: "^6.0.0",
          "vite-plugin-pwa": "^0.21.1",
        },
      },
      null,
      2
    ),

    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: [
        "favicon.svg",
      ],
      manifest: {
        name: "My App",
        short_name: "MyApp",
        description: "A fast, installable app built with Doable",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: "icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\\/\\/fonts\\.googleapis\\.com\\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\\/\\/fonts\\.gstatic\\.com\\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /\\/api\\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60,
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
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
        include: ["src", "vite-env.d.ts"],
      },
      null,
      2
    ),

    "vite-env.d.ts": `/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export {};
`,

    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#6366f1" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="My App" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <title>My App</title>
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
    try {
      window.parent.postMessage({
        type: "doable-preview-error",
        errors: [{
          message: error.message,
          source: info.componentStack || "",
          stack: error.stack || "",
          timestamp: Date.now(),
        }],
      }, "*");
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #eef2ff, #f5f3ff, #faf5ff)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: "24px",
        }}>
          <div style={{
            maxWidth: "420px",
            textAlign: "center",
            background: "white",
            borderRadius: "16px",
            padding: "40px 32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}>
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#1f2937", margin: "0 0 8px" }}>
              Making improvements...
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px", lineHeight: 1.5 }}>
              Doable is automatically fixing this. The preview will update in a moment.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Refresh
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

    "src/App.tsx": `import { useState } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PWAStatus } from "@/components/PWAStatus";
import { Smartphone, Wifi, WifiOff, Download, Zap, Shield, Globe } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-indigo-950">
      <OfflineIndicator />
      <InstallPrompt />

      {/* Header */}
      <header className="border-b border-neutral-200/60 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">My App</h1>
          </div>
          <PWAStatus />
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900">
            <Smartphone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Installable Progressive Web App</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Works everywhere.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Even offline.</span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            This app installs on your phone, tablet, or desktop. It works without internet
            and loads instantly — just like a native app.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Download className="w-6 h-6" />}
            title="Install on Any Device"
            description="Add to your home screen on iOS, Android, or desktop. No app store needed."
            color="indigo"
          />
          <FeatureCard
            icon={<WifiOff className="w-6 h-6" />}
            title="Works Offline"
            description="Service worker caches your app shell and assets. Use it on a plane, subway, or anywhere."
            color="purple"
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Fast & Secure"
            description="Loads instantly from cache. Served over HTTPS with automatic updates in the background."
            color="violet"
          />
        </div>

        {/* How it works */}
        <div className="mt-20 text-center">
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-8">How it works</h3>
          <div className="grid sm:grid-cols-3 gap-8 text-left">
            <Step number={1} title="Visit the app" description="Open in any browser — Chrome, Safari, Edge, Firefox." />
            <Step number={2} title="Install it" description="Tap 'Add to Home Screen' or click Install in the address bar." />
            <Step number={3} title="Use it anywhere" description="Opens full-screen like a native app. Works offline automatically." />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "indigo" | "purple" | "violet";
}) {
  const colors = {
    indigo: "from-indigo-500 to-indigo-600 shadow-indigo-500/20",
    purple: "from-purple-500 to-purple-600 shadow-purple-500/20",
    violet: "from-violet-500 to-violet-600 shadow-violet-500/20",
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow">
      <div className={\`w-12 h-12 rounded-xl bg-gradient-to-br \${colors[color]} flex items-center justify-center text-white shadow-lg mb-4\`}>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{number}</span>
      </div>
      <div>
        <h4 className="font-medium text-neutral-900 dark:text-white">{title}</h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{description}</p>
      </div>
    </div>
  );
}
`,

    "src/components/InstallPrompt.tsx": `import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (display-mode: standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a short delay (don't interrupt first interaction)
      setTimeout(() => setShowPrompt(true), 3000);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl shadow-black/10 border border-neutral-200 dark:border-neutral-800 p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">Install this app</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Add to your home screen for the best experience
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          className="flex-shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
`,

    "src/components/OfflineIndicator.tsx": `import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div className={\`fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 px-4 text-xs font-medium transition-colors \${
      isOnline
        ? "bg-emerald-500 text-white"
        : "bg-amber-500 text-white"
    }\`}>
      {isOnline ? (
        <span className="flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" />
          Back online
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          You're offline — app still works
        </span>
      )}
    </div>
  );
}
`,

    "src/components/PWAStatus.tsx": `import { useEffect, useState } from "react";
import { Smartphone, CheckCircle } from "lucide-react";

export function PWAStatus() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  if (!isStandalone) return null;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900">
      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Installed</span>
    </div>
  );
}
`,

    "src/hooks/usePWA.ts": `import { useState, useEffect, useCallback } from "react";

interface PWAState {
  /** Whether the app is installed (running in standalone mode) */
  isInstalled: boolean;
  /** Whether a new version is available */
  updateAvailable: boolean;
  /** Whether the app is ready for offline use */
  offlineReady: boolean;
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Trigger the native install prompt (only works if beforeinstallprompt fired) */
  promptInstall: () => Promise<"accepted" | "dismissed" | null>;
  /** Apply pending update and reload */
  applyUpdate: () => void;
}

export function usePWA(): PWAState {
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Check if already installed
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);

    // Listen for install prompt
    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => setIsInstalled(true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Register SW and listen for updates
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        setOfflineReady(true);

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") setIsInstalled(true);
    return outcome;
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  }, [registration]);

  return { isInstalled, updateAvailable, offlineReady, isOnline, promptInstall, applyUpdate };
}
`,

    "src/lib/offline-storage.ts": `/**
 * Simple offline-first key-value storage using IndexedDB.
 * Uses idb-keyval for a zero-config IndexedDB wrapper.
 *
 * Usage:
 *   import { offlineStore } from "@/lib/offline-storage";
 *   await offlineStore.set("todos", myTodos);
 *   const todos = await offlineStore.get<Todo[]>("todos");
 */
import { get, set, del, keys, clear } from "idb-keyval";

export const offlineStore = {
  get: <T>(key: string) => get<T>(key),
  set: <T>(key: string, value: T) => set(key, value),
  delete: (key: string) => del(key),
  keys: () => keys(),
  clear: () => clear(),
};
`,

    "src/index.css": `@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

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
  --primary: 239 84% 67%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --ring: 239 84% 67%;
  --radius: 0.5rem;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --primary: 239 84% 67%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --ring: 239 84% 67%;
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
  /* Safe area insets for iOS notch/home indicator */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

/* PWA animations */
@keyframes slide-in-from-bottom-4 {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.animate-in {
  animation-fill-mode: both;
}

.slide-in-from-bottom-4 {
  animation-name: slide-in-from-bottom-4;
}

.duration-300 {
  animation-duration: 300ms;
}
`,

    "src/lib/utils.ts": `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,

    "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#6366f1"/>
  <path d="M160 160h64v192h-64z" fill="white"/>
  <path d="M256 160h96c53 0 96 43 96 96s-43 96-96 96h-96V160z" fill="white"/>
  <rect x="256" y="192" width="80" height="128" rx="64" fill="#6366f1"/>
</svg>
`,

    "public/icon-192.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#6366f1"/>
  <path d="M160 160h64v192h-64z" fill="white"/>
  <path d="M256 160h96c53 0 96 43 96 96s-43 96-96 96h-96V160z" fill="white"/>
  <rect x="256" y="192" width="80" height="128" rx="64" fill="#6366f1"/>
</svg>
`,

    "public/icon-512.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#6366f1"/>
  <path d="M160 160h64v192h-64z" fill="white"/>
  <path d="M256 160h96c53 0 96 43 96 96s-43 96-96 96h-96V160z" fill="white"/>
  <rect x="256" y="192" width="80" height="128" rx="64" fill="#6366f1"/>
</svg>
`,
  },

  contextOverrides: {
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 4 (using @tailwindcss/vite plugin)
- PWA: vite-plugin-pwa (Workbox-powered service worker)
- Offline Storage: idb-keyval (IndexedDB wrapper)
- UI Components: shadcn/ui pattern (add as needed)
- Icons: Lucide React
- Utilities: clsx + tailwind-merge via cn()

## PWA Architecture
- Service worker: auto-generated by vite-plugin-pwa (Workbox generateSW)
- Manifest: configured in vite.config.ts VitePWA() plugin options
- Caching: static assets use CacheFirst, API calls use NetworkFirst
- Install prompt: custom UI via BeforeInstallPromptEvent
- Offline indicator: listens to navigator.onLine + online/offline events
- Offline data: use \`@/lib/offline-storage.ts\` (IndexedDB via idb-keyval)

## File Structure
- \`src/App.tsx\` — Root component (default export)
- \`src/main.tsx\` — Entry point
- \`src/components/InstallPrompt.tsx\` — Native install prompt UI
- \`src/components/OfflineIndicator.tsx\` — Online/offline status bar
- \`src/components/PWAStatus.tsx\` — Shows "Installed" badge when in standalone
- \`src/hooks/usePWA.ts\` — All-in-one PWA hook (install, update, offline status)
- \`src/lib/offline-storage.ts\` — IndexedDB helper for offline data
- \`src/lib/utils.ts\` — Utility functions (cn, etc.)
- \`public/\` — Icons, manifest assets (favicon.svg, pwa-*.png)

## PWA Conventions
- manifest is configured inside vite.config.ts (NOT a separate file)
- Service worker is auto-generated — never create sw.js manually
- Use \`registerType: "autoUpdate"\` so updates apply silently
- Icons: provide 192×192 and 512×512 PNG (maskable for Android adaptive icons)
- start_url and scope use "./" for HashRouter sub-path compatibility
- Use viewport-fit=cover + env(safe-area-inset-*) for iPhone notch

## Conventions
- Path alias: \`@/\` maps to \`src/\`
- CSS variables for theming (see index.css @theme section)
- Tailwind v4: use \`@import "tailwindcss"\` (not @tailwind directives)
- HashRouter for routing (sub-path safe)
`,
  },
};
