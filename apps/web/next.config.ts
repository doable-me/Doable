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
  async headers() {
    return [
      {
        // Apply security headers to all routes of the Next.js app itself
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
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
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), fullscreen=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
