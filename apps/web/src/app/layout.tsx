import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Doable | Dream it. Do it. Done.",
  description:
    "Tell AI what you want to do and Doable gets it done. From idea to deployed app in minutes.",
  keywords: ["AI", "app builder", "code generation", "full-stack", "no-code"],
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
        className={`${inter.variable} font-sans antialiased`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
