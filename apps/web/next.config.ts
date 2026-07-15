import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@doable/shared"],
  typescript: { ignoreBuildErrors: true },
  // Next.js 16 blocks cross-origin requests to dev-only resources
  // (/_next/webpack-hmr and the dev-asset chunks) unless the request's
  // Origin matches an entry here. On a tunneled install the web process
  // binds to 127.0.0.1 but the browser hits https://<env>.doable.me,
  // which Next.js classifies as cross-origin. Blocked HMR + dev chunks
  // break hydration on routes with nested Suspense boundaries (dashboard,
  // editor), leaving the page frozen on the SSR Loading fallback. Derive
  // the install apex from NEXT_PUBLIC_APP_URL the same way headers() does.
  allowedDevOrigins: (() => {
    const fromUrl = (u: string | undefined) => {
      if (!u) return null;
      try { return new URL(u).hostname; } catch { return null; }
    };
    const apex = (host: string) => {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
      const parts = host.split(".").filter(Boolean);
      return parts.length <= 2 ? host : parts.slice(-2).join(".");
    };
    // Dev-only cross-origin allowlist. Derive from the install env; never
    // hardcode our own domain so self-hosters don't carry `*.doable.me`.
    const host = fromUrl(process.env.NEXT_PUBLIC_APP_URL)
      || fromUrl(process.env.NEXT_PUBLIC_API_URL)
      || "";
    return [host, host ? `*.${apex(host)}` : "", "localhost", "127.0.0.1"].filter(Boolean);
  })(),
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "cdn.activepieces.com",
      },
    ],
  },
  async redirects() {
    return [
      { source: '/settings/ai', destination: '/ai-settings', permanent: false },
      { source: '/settings/usage', destination: '/usage', permanent: false },
      { source: '/settings/billing', destination: '/billing', permanent: false },
    ];
  },
  async rewrites() {
    return [
      // Bare /favicon.ico requests (crawlers, browsers without <link rel="icon">)
      // are served by the dynamic icon.tsx route. Standalone build doesn't auto-alias
      // icon.tsx to /favicon.ico, so we wire it explicitly.
      { source: '/favicon.ico', destination: '/icon' },
    ];
  },
  async headers() {
    // Derive the user's install apex (e.g. `multaimind.com`) from the public
    // env so CSP allows cross-origin connect/img/frame for `*.<apex>`. Falls
    // back to `*.doable.me` for source-tree dev runs that don't preseed
    // NEXT_PUBLIC_APP_URL. We only honour the first non-empty value, since
    // all three public URLs always sit under the same apex.
    const hostFromUrl = (u: string | undefined): string => {
      if (!u) return "";
      try {
        return new URL(u).hostname;
      } catch {
        return "";
      }
    };
    const apexOf = (host: string): string => {
      // IPv4 / bare IP: return as-is, no wildcard expansion (Universal SSL
      // doesn't apply to IP installs anyway — those use self-signed certs).
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
      const parts = host.split(".").filter(Boolean);
      if (parts.length <= 2) return host;
      return parts.slice(-2).join(".");
    };
    // Do NOT hardcode our own domain as a fallback — a self-hoster whose
    // NEXT_PUBLIC_* env isn't wired must never ship `*.doable.me` in their CSP.
    // When the install host is unknown we omit the cross-origin apex-wildcard
    // entirely; `'self'` (+ localhost) already covers single-host / path-based
    // installs, and a subdomain-split install always preseeds NEXT_PUBLIC_APP_URL.
    const installHost =
      hostFromUrl(process.env.NEXT_PUBLIC_APP_URL) ||
      hostFromUrl(process.env.NEXT_PUBLIC_API_URL) ||
      hostFromUrl(process.env.NEXT_PUBLIC_WS_URL) ||
      "";
    const installApex = installHost ? apexOf(installHost) : "";
    const apexAllow = installApex ? `https://*.${installApex}` : "";
    const apexAllowWs = installApex ? `wss://*.${installApex}` : "";
    // The live app preview runs in a CROSS-ORIGIN iframe served from the API
    // origin (NEXT_PUBLIC_API_URL, e.g. https://staging-api.doable.me). For the
    // generated app to use the microphone (ElevenLabs STT / doable.voice.listen)
    // and to autoplay TTS audio, the parent Permissions-Policy must DELEGATE
    // those features to that child origin — `self` alone is not enough for a
    // cross-origin child — and the preview <iframe> carries
    // allow="microphone; autoplay".
    const apiUrlRaw = process.env.NEXT_PUBLIC_API_URL || "";
    const previewOrigin = apiUrlRaw
      ? (() => { try { return new URL(apiUrlRaw).origin; } catch { return ""; } })()
      : "";
    const micList = previewOrigin ? `(self "${previewOrigin}")` : "(self)";
    // BUG-016: CSP was applying `unsafe-eval` + `unsafe-inline` to every
    // route, neutering XSS protection. The editor route legitimately needs
    // `unsafe-eval` (Monaco worker) and inline styles (Tailwind/Monaco),
    // but the rest of the app can run under a stricter policy. We define
    // two CSPs and route the relaxed one only to /editor/*.
    const baseSecurityHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        // `microphone=(self)` (not the empty allowlist `()`) is required for
        // the dashboard/editor voice-input button: with `()` the browser
        // refuses microphone access to this document at the policy layer
        // *before* the user's per-site setting is consulted, so
        // permissions.query({name:'microphone'}) reports "denied" and every
        // getUserMedia / SpeechRecognition call fails with not-allowed.
        // See doableinfo/microphone_bug.md.
        key: "Permissions-Policy",
        value: `camera=(), microphone=${micList}, autoplay=${micList}, geolocation=(), fullscreen=(self)`,
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
    ];

    // Editor needs `unsafe-eval` (Monaco worker, Vite HMR client in
    // previewed projects) and `unsafe-inline` (Monaco injects style tags).
    const editorCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      `img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://cdn.activepieces.com http://localhost:* http://127.0.0.1:* ${apexAllow}`,
      `connect-src 'self' ${apexAllow} ${apexAllowWs} ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://cloudflareinsights.com`,
      `frame-src 'self' http://localhost:* http://127.0.0.1:* ${apexAllow}`,
      "frame-ancestors 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");

    // Strict CSP for everything else. React 19 + Next.js 16 emit code that
    // relies on `eval()`/`new Function()` for hydration in BOTH development
    // AND production builds (dev uses it for Fast Refresh + source maps; prod
    // uses it inside the RSC payload bootstrap and the React server-actions
    // runtime). Dropping `'unsafe-eval'` in prod leaves `form.onSubmit`
    // undefined, mount effects unfired, and the page dead at the SSR loading
    // fallback — symptoms observed on /setup (spinner forever, no /auth/me
    // request) and /signup (Create-account button posts the form natively to
    // `/signup?` with no React handler running). Until we move to a
    // nonce-based CSP we must keep `'unsafe-eval'` for every non-editor
    // route. `'unsafe-inline'` stays for the same hydration reasons.
    const scriptSrcExtra = "'unsafe-eval' ";
    // We keep `'unsafe-inline'` on script-src and style-src because Next.js
    // App Router emits inline bootstrap scripts (self.__next_r, self.__next_f
    // RSC payload, theme bootstrap) that React requires for hydration.
    // Future: switch to nonce-based CSP once middleware nonce injection is
    // wired up.
    const strictCsp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${scriptSrcExtra}https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      `img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://cdn.activepieces.com http://localhost:* http://127.0.0.1:* ${apexAllow}`,
      `connect-src 'self' ${apexAllow} ${apexAllowWs} ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://cloudflareinsights.com`,
      `frame-src 'self' http://localhost:* http://127.0.0.1:* ${apexAllow}`,
      "frame-ancestors 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");

    return [
      {
        source: "/editor/:path*",
        headers: [
          { key: "Content-Security-Policy", value: editorCsp },
          ...baseSecurityHeaders,
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: strictCsp },
          ...baseSecurityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;

