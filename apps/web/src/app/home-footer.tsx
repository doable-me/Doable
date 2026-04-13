import Link from "next/link";
import { Twitter, Github, Linkedin } from "lucide-react";

export function HomeFooter() {
  return (
    <footer className="relative z-10 border-t border-gray-800/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-300">
                <span className="text-xs font-bold text-white">D</span>
              </div>
              <span className="text-base font-semibold text-white">
                Doable
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-500">
              Build apps and websites by chatting with AI. From idea to
              deployed app in minutes.
            </p>
            <div className="mt-4 flex gap-4">
              {[
                { Icon: Twitter, label: "Twitter" },
                { Icon: Github, label: "GitHub" },
                { Icon: Linkedin, label: "LinkedIn" },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  className="text-gray-600 transition-colors hover:text-gray-400"
                  aria-label={label}
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {[
            {
              title: "Product",
              links: ["Features", "Templates", "Pricing", "Changelog"],
            },
            {
              title: "Resources",
              links: ["Documentation", "Guides", "Blog", "Support"],
            },
            {
              title: "Company",
              links: ["About", "Careers", "Privacy", "Terms"],
            },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-sm font-semibold text-gray-300">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-gray-600 transition-colors hover:text-gray-400"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-gray-800/50 pt-6">
          <p className="text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Doable. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
