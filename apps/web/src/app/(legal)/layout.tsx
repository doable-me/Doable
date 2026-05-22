import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-800/50 bg-[#0a0a0a]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-300">
              <span className="text-sm font-bold text-white self-end mb-1">D</span>
              <span className="h-2 w-2 rounded-full bg-violet-700 self-end mb-2 ml-0.5 shrink-0" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              Doable
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </nav>

      {/* Sub-nav: legal pages */}
      <div className="border-b border-gray-800/50">
        <div className="mx-auto flex max-w-5xl gap-6 overflow-x-auto px-4 py-3 text-sm sm:px-6 lg:px-8">
          <Link
            href="/terms"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            Privacy Policy
          </Link>
          <Link
            href="/cookies"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            Cookie Policy
          </Link>
          <Link
            href="/acceptable-use"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            Acceptable Use
          </Link>
          <Link
            href="/dmca"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            DMCA
          </Link>
          <Link
            href="/contact"
            className="whitespace-nowrap text-gray-400 transition-colors hover:text-white"
          >
            Contact
          </Link>
        </div>
      </div>

      {/* Article body */}
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="legal-article">{children}</article>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Doable Works LLC. All rights reserved.
            Doable is a registered service of Doable Works LLC.
          </p>
        </div>
      </footer>
    </div>
  );
}
