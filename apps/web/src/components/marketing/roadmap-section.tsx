"use client";

import Link from "next/link";
import { BookOpen, FileText, Map, Rocket } from "lucide-react";

const ROADMAP = [
  {
    icon: BookOpen,
    status: "Coming soon",
    title: "Docs & guides",
    desc: "Product docs, AI builder recipes, and named-query / auth walkthroughs.",
  },
  {
    icon: FileText,
    status: "Coming soon",
    title: "API & SDK reference",
    desc: "@doable/runtime, @doable/data, and platform endpoints documented end-to-end.",
  },
  {
    icon: Map,
    status: "In progress",
    title: "Templates marketplace",
    desc: "Starter packs for SaaS, booking, waitlists, and full-stack workflows.",
  },
  {
    icon: Rocket,
    status: "Shipped",
    title: "Live AI builder",
    desc: "Chat → scaffold → migrate → seed → ship with live preview today.",
  },
];

export function MarketingRoadmapSection() {
  return (
    <section id="roadmap" className="relative z-10 border-t border-white/5 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Docs & what&apos;s next
          </h2>
          <p className="mt-3 text-gray-400">
            Appbrics is shipping fast. Here&apos;s what&apos;s live and what&apos;s on the
            roadmap.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {ROADMAP.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-[#0c1520] p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                  <item.icon className="h-5 w-5 text-brand-400" />
                </div>
                <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-400">
                  {item.status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Prefer a short overview now?{" "}
          <Link href="/docs" className="text-brand-300 hover:text-brand-200">
            Visit the docs hub
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
