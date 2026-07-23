"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { HomeFooter } from "@/app/home-footer";

const SECTIONS = [
  {
    title: "Getting started",
    items: [
      { label: "Create a project", status: "Live — use the dashboard" },
      { label: "Describe your app in chat", status: "Live — Agent mode" },
      { label: "Deploy a public URL", status: "Live — Deploy in the editor" },
    ],
  },
  {
    title: "Full-stack runtime",
    items: [
      { label: "Inbuilt database + RLS", status: "Live" },
      { label: "Named queries (@doable/runtime)", status: "Live" },
      { label: "Auth (signup / login)", status: "Live" },
      { label: "Workflows, webhooks, schedules", status: "Live" },
    ],
  },
  {
    title: "Coming next",
    items: [
      { label: "Deep product documentation", status: "Coming soon" },
      { label: "API & SDK reference site", status: "Coming soon" },
      { label: "Template marketplace", status: "In progress" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#060b12] text-white">
      <nav className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <BrandLogo variant="inverse" />
          <Button
            asChild
            className="rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-gray-200"
          >
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-medium text-brand-300">Documentation</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Appbrics docs hub</h1>
        <p className="mt-3 max-w-2xl text-gray-400">
          Full guides are on the way. Until then, use this map of what already
          works in the product and what we&apos;re documenting next.
        </p>

        <div className="mt-12 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10 bg-[#0c1520]">
                {section.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-sm text-gray-500">{item.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild className="rounded-full bg-brand-500 hover:bg-brand-400">
            <Link href="/signup">Build an app</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="rounded-full text-gray-300 hover:text-white"
          >
            <Link href="/#pricing">View pricing</Link>
          </Button>
        </div>
      </main>

      <HomeFooter />
    </div>
  );
}
