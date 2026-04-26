import Link from "next/link";
import { Twitter, Github, Linkedin } from "lucide-react";

const linkColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Templates", href: "/templates" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/help" },
      { label: "GitHub", href: "https://github.com/doable-me/doable" },
      { label: "Support", href: "/contact" },
      { label: "Status", href: "https://status.doable.me" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function HomeFooter() {
  return (
    <footer className="relative z-10 border-t border-gray-800/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-300">
                <span className="text-xs font-bold text-white self-end mb-1">D</span>
                <span className="h-2 w-2 rounded-full bg-violet-700 self-end mb-2 ml-0.5 shrink-0" />
              </div>
              <span className="text-base font-semibold text-white">Doable</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-500">
              Tell AI what you want to do and Doable gets it done.
              From idea to deployed app in minutes.
            </p>
            <div className="mt-4 flex gap-4">
              <a
                href="https://twitter.com/doable_me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 transition-colors hover:text-gray-400"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://github.com/doable-me/doable"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 transition-colors hover:text-gray-400"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com/company/doable-works"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 transition-colors hover:text-gray-400"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {linkColumns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-sm font-semibold text-gray-300">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("http") ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-600 transition-colors hover:text-gray-400"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-gray-600 transition-colors hover:text-gray-400"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-gray-800/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Doable Works LLC. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
            <Link href="/terms" className="hover:text-gray-400">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-400">
              Privacy
            </Link>
            <Link href="/cookies" className="hover:text-gray-400">
              Cookies
            </Link>
            <Link href="/acceptable-use" className="hover:text-gray-400">
              Acceptable Use
            </Link>
            <Link href="/dmca" className="hover:text-gray-400">
              DMCA
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
