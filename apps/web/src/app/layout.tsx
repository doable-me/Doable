import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Doable - Build apps by chatting with AI",
  description:
    "Create apps and websites by chatting with AI. Go from idea to deployed app in minutes, not months.",
  keywords: ["AI", "app builder", "code generation", "full-stack", "no-code"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=localStorage.getItem("doable_brand_theme");if(b)document.documentElement.setAttribute("data-brand",b)}catch(e){}})()`,
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
