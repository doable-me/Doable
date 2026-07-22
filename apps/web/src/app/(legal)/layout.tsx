import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#060b12] text-gray-200">
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#060b12]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo variant="inverse" />
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </nav>

      <div className="border-b border-white/5">
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

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <article className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-a:text-brand-400">
          {children}
        </article>
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-gray-600 sm:px-6 lg:px-8">
          <p>
            &copy; {new Date().getFullYear()} Appbrics. All rights reserved.
          </p>
          <p className="mt-1">
            Built with Appbrics.
          </p>
        </div>
      </footer>
    </div>
  );
}
