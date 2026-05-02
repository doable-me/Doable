import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@doable/shared"],
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
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com http://localhost:* http://127.0.0.1:* https://*.doable.me",
              "connect-src 'self' https://*.doable.me wss://*.doable.me ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://localhost:* http://127.0.0.1:*",
              "frame-src 'self' http://localhost:* http://127.0.0.1:* https://*.doable.me",
              "frame-ancestors 'self'",
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
        ],
      },
    ];
  },
};

export default nextConfig;
