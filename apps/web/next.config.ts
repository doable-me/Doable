import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@doable/shared"],
  typescript: { ignoreBuildErrors: true },
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
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), fullscreen=(self)",
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
      "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://cdn.activepieces.com http://localhost:* http://127.0.0.1:* https://*.doable.me",
      "connect-src 'self' https://*.doable.me wss://*.doable.me ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://cloudflareinsights.com",
      "frame-src 'self' http://localhost:* http://127.0.0.1:* https://*.doable.me",
      "frame-ancestors 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");

    // Strict CSP for everything else — drops `unsafe-eval`. We keep
    // `'unsafe-inline'` on script-src and style-src because Next.js App
    // Router emits inline bootstrap scripts (self.__next_r, self.__next_f
    // RSC payload, theme bootstrap) that React requires for hydration.
    // Without it the page never hydrates and stays on loading.tsx.
    // Future: switch to nonce-based CSP once middleware nonce injection is
    // wired up.
    const strictCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://cdn.activepieces.com http://localhost:* http://127.0.0.1:* https://*.doable.me",
      "connect-src 'self' https://*.doable.me wss://*.doable.me ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://cloudflareinsights.com",
      "frame-src 'self' http://localhost:* http://127.0.0.1:* https://*.doable.me",
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
