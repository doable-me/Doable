---
name: "pwa-builder"
description: "Add Progressive Web App (PWA) capabilities — installable on phones/tablets/desktop, works offline, service worker with caching strategies, manifest, install prompt UI. Triggers on: pwa, installable, offline, service worker, add to home screen, native app."
---

# Building Progressive Web Apps (PWA)

## When to Use This Skill
Use this when the user asks to:
- Make their app installable / "add to home screen"
- Add offline support / "work without internet"
- Create a PWA / progressive web app
- Add a service worker
- Make the app feel like a native app
- Add push notifications (basic setup)

## Step 1: Install vite-plugin-pwa

Add to `package.json` devDependencies:
```json
{
  "devDependencies": {
    "vite-plugin-pwa": "^0.21.1"
  }
}
```

For offline data storage, add to dependencies:
```json
{
  "dependencies": {
    "idb-keyval": "^6.2.1"
  }
}
```

Then run install via the `install_package` tool.

## Step 2: Configure vite.config.ts

```typescript
import { defineConfig } from "vite";
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
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "APP_NAME_HERE",
        short_name: "SHORT_NAME",
        description: "APP_DESCRIPTION",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
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
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/.*/,
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
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { host: true, allowedHosts: true },
});
```

## Step 3: Add TypeScript Declarations

Create or update `vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
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
```

## Step 4: Update index.html

Add these meta tags to `<head>`:
```html
<meta name="theme-color" content="#6366f1" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="APP_NAME" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

Update the viewport meta for iPhone safe areas:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

## Step 5: Create PWA Icons

Create an SVG favicon at `public/favicon.svg` that represents the app.
The 192×192 and 512×512 PNG icons can be generated from this SVG.
For a quick placeholder, create a simple branded SVG:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#6366f1"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    fill="white" font-size="280" font-weight="700" font-family="system-ui">
    A
  </text>
</svg>
```

Replace the letter and color to match the app's brand.

## Step 6: Install Prompt Component

```tsx
// src/components/InstallPrompt.tsx
import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
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
    if (outcome === "accepted") setIsInstalled(true);
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">Install this app</p>
          <p className="text-xs text-neutral-500 mt-0.5">Add to home screen for the best experience</p>
          <div className="flex gap-2 mt-3">
            <button onClick={handleInstall} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              Install
            </button>
            <button onClick={() => setShowPrompt(false)} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg">
              Not now
            </button>
          </div>
        </div>
        <button onClick={() => setShowPrompt(false)} className="p-1 text-neutral-400 hover:text-neutral-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

## Step 7: Offline Indicator Component

```tsx
// src/components/OfflineIndicator.tsx
import { useState, useEffect } from "react";
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
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 text-xs font-medium ${
      isOnline ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
    }`}>
      {isOnline ? (
        <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Back online</span>
      ) : (
        <span className="flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> You're offline — app still works</span>
      )}
    </div>
  );
}
```

## Step 8: Offline Data Storage

```typescript
// src/lib/offline-storage.ts
import { get, set, del, keys, clear } from "idb-keyval";

export const offlineStore = {
  get: <T>(key: string) => get<T>(key),
  set: <T>(key: string, value: T) => set(key, value),
  delete: (key: string) => del(key),
  keys: () => keys(),
  clear: () => clear(),
};
```

Use for persisting user data that survives offline:
```typescript
import { offlineStore } from "@/lib/offline-storage";

// Save
await offlineStore.set("user-notes", notes);

// Load
const notes = await offlineStore.get<Note[]>("user-notes") ?? [];
```

## Step 9: usePWA Hook (All-in-One)

```typescript
// src/hooks/usePWA.ts
import { useState, useEffect, useCallback } from "react";

export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const onBeforeInstall = (e: BeforeInstallPromptEvent) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => setIsInstalled(true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setOfflineReady(true);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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

  return { isInstalled, updateAvailable, offlineReady, isOnline, promptInstall };
}
```

## Critical Rules

1. **NEVER create a sw.js or service-worker.js manually** — vite-plugin-pwa generates it automatically via Workbox.
2. **NEVER use navigator.serviceWorker.register()** directly — the plugin handles registration.
3. **manifest goes in vite.config.ts** as part of VitePWA() options — NOT as a separate manifest.json file.
4. **start_url and scope MUST be "./"** (relative) because the app may run at a sub-path (/preview/{id}/).
5. **Use HashRouter** (not BrowserRouter) for routing — critical for sub-path PWA compatibility.
6. **Icons**: minimum 192×192 + 512×512 PNG. Always include one with `purpose: "maskable"` for Android adaptive icons.
7. **registerType: "autoUpdate"** — updates apply silently in background. No user action needed.
8. **viewport-fit=cover** — required for iPhone notch/safe areas to render correctly.
9. **Offline data: use idb-keyval** (IndexedDB) — NOT localStorage (too small, sync-blocking).
10. **theme_color in manifest AND in meta tag** — must match. Affects browser chrome color on mobile.
11. **VitePWA() MUST be in vite.config.ts plugins array** — this is the MOST CRITICAL step. Without it, the build will NOT generate sw.js, manifest.webmanifest, or registerSW.js. The entire PWA depends on this plugin being present. Always verify vite.config.ts includes `import { VitePWA } from "vite-plugin-pwa"` and `VitePWA({...})` in the plugins array.
12. **Wrap ALL IndexedDB/idb-keyval calls in try/catch** — the Doable preview iframe is sandboxed and blocks IndexedDB access. If the app crashes on IDB access in preview, the user sees a blank screen. Always catch SecurityError and fall back gracefully (e.g., use in-memory storage as fallback).

## Caching Strategy Guide

| Content Type | Strategy | Why |
|---|---|---|
| App shell (HTML/JS/CSS) | **Precache** (automatic) | Enables instant offline load |
| Images/fonts | **CacheFirst** | Rarely change, save bandwidth |
| API calls | **NetworkFirst** | Always prefer fresh data, cache as fallback |
| User-generated content | **StaleWhileRevalidate** | Show cached, update in background |

## iOS-Specific Notes

- iOS Safari does NOT fire `beforeinstallprompt` — users must manually "Add to Home Screen"
- For iOS: rely on the meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`)
- iOS standalone mode doesn't support push notifications (iOS 16.4+ supports them partially)
- Always test on iOS Safari — service worker behavior differs from Chrome

## Testing PWA

After building, use Lighthouse (Chrome DevTools → Lighthouse → PWA audit) to verify:
- ✅ Installable (manifest + service worker)
- ✅ Works offline (service worker caches shell)
- ✅ Has proper icons (192 + 512)
- ✅ Correct theme_color and background_color
- ✅ Redirects HTTP to HTTPS (handled by Cloudflare)
