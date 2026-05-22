import type { Metadata } from "next";
import "./globals.css";
import { TracingInit } from "@/components/tracing-init";

// We DELIBERATELY do NOT use next/font/google here. next/font fetches font
// files from fonts.googleapis.com at build time, which breaks offline/firewalled
// installs (corporate proxies, region-blocked deploys, transient network
// flakes during docker build — observed on Hetzner during R3 cycle-A). The
// inline style below prefers Inter when present locally and falls back to the
// platform sans stack, so the app renders correctly with or without Inter.

// Opt entire app out of static generation. Pages use runtime env, per-user
// auth, and search params — static prerender fails without them at build time.
// Pair with app/global-error.tsx so Next stops synthesising the Pages-Router
// `<Html>` fallback that breaks pure App-Router apps under force-dynamic.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doable | Dream it. Do it. Done.",
  description:
    "Tell AI what you want to do and Doable gets it done. From idea to deployed app in minutes.",
  keywords: ["AI", "app builder", "code generation", "full-stack", "no-code"],
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=localStorage.getItem("doable_brand_theme");if(b)document.documentElement.setAttribute("data-brand",b);var t=localStorage.getItem("doable_theme")||"dark";var resolved=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var cl=document.documentElement.classList;cl.remove("dark","light");cl.add(resolved);document.documentElement.style.colorScheme=resolved;}catch(e){document.documentElement.classList.add("dark");}})()`,
          }}
        />
      </head>
      <body
        className="font-sans antialiased"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        <TracingInit />
        {children}
      </body>
    </html>
  );
}
