"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Plus,
  Mic,
  MonitorSmartphone,
  Database,
  Shield,
  Sparkles,
  Layers,
  Workflow,
  Globe2,
  Lightbulb,
  Wand2,
  Send,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { HomeFooter } from "./home-footer";
import { MarketingPricingSection } from "@/components/marketing/pricing-section";
import { MarketingRoadmapSection } from "@/components/marketing/roadmap-section";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("doable_access_token");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const encoded = encodeURIComponent(prompt.trim());
    const token = localStorage.getItem("doable_access_token");
    if (token) {
      router.push(`/dashboard?prompt=${encoded}`);
    } else {
      router.push(`/signup?prompt=${encoded}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#060b12] text-white">
      <nav className="relative z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo variant="inverse" />

          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="#features"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              How it works
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Pricing
            </Link>
            <Link
              href="#roadmap"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Docs & roadmap
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-full border border-gray-700 px-4 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white sm:inline-block"
            >
              Log in
            </Link>
            <Button
              asChild
              className="rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-gray-200"
            >
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950 via-[#060b12] to-transparent opacity-90" />
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
          <div className="absolute bottom-0 left-0 right-0 h-[50vh]">
            <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/15 via-brand-400/10 to-transparent" />
            <div className="absolute bottom-0 left-1/4 h-[300px] w-[400px] rounded-full bg-sky-500/15 blur-[100px]" />
            <div className="absolute bottom-0 right-1/4 h-[300px] w-[400px] rounded-full bg-teal-400/10 blur-[100px]" />
          </div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-3xl text-center">
          <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
            Appbrics
          </h1>
          <p className="mb-3 text-xl font-medium text-brand-200 sm:text-2xl">
            Build full-stack apps with AI
          </p>
          <p className="mb-12 text-base text-gray-400 sm:text-lg">
            Describe your product. Appbrics designs the UI, wires the database,
            and ships a live preview — schema, queries, auth, and all.
          </p>

          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-[#0c1520]/90 p-3 shadow-2xl shadow-black/50 transition-colors focus-within:border-brand-400/50 focus-within:ring-2 focus-within:ring-brand-500/20">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What do you want to build?"
                rows={3}
                className="w-full resize-none bg-transparent px-2 pt-1 text-sm text-white placeholder:text-gray-500 focus:outline-none sm:text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                    title="Attach file"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                    title="Screenshot"
                  >
                    <MonitorSmartphone className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                    title="Voice input"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                  <button
                    type="submit"
                    className="ml-1 rounded-full bg-brand-600 p-2 text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
                    disabled={!prompt.trim()}
                  >
                    <ArrowUp className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            How Appbrics works
          </h2>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {[
              {
                icon: Lightbulb,
                title: "Describe your app",
                description:
                  "Share goals, roles, and screens. Appbrics understands the product intent.",
              },
              {
                icon: Wand2,
                title: "Watch it build",
                description:
                  "AI creates schema, named queries, seed data, auth, and UI — live in preview.",
              },
              {
                icon: Send,
                title: "Ship it",
                description:
                  "Deploy with one click. Custom domains and SSL when you upgrade.",
              },
            ].map((step) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                  <step.icon className="h-7 w-7 text-brand-400" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-t border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            Everything you need to ship
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-gray-400">
            Not just a UI mock — Appbrics builds real full-stack apps on your
            platform.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Sparkles,
                title: "AI agent builder",
                desc: "Agent, Plan, and Visual Edit modes that write production-ready code.",
              },
              {
                icon: Database,
                title: "Inbuilt database",
                desc: "Per-project PGlite with RLS, migrations, and demo seeding.",
              },
              {
                icon: Layers,
                title: "Named queries",
                desc: "Server-side SQL via @doable/runtime — shared by UI and workflows.",
              },
              {
                icon: Shield,
                title: "Auth built-in",
                desc: "Signup, login, and session cookies via db.auth — no password tables.",
              },
              {
                icon: Workflow,
                title: "Automations",
                desc: "Workflows, schedules, webhooks, and CDC on the app runtime.",
              },
              {
                icon: Globe2,
                title: "Deploy & domains",
                desc: "One-click publish; custom domains on Pro and above.",
              },
              {
                icon: Code2,
                title: "Full code access",
                desc: "Edit every file. Export anytime. No lock-in.",
              },
              {
                icon: MonitorSmartphone,
                title: "Live preview",
                desc: "See the app update as the agent builds — desktop and mobile.",
              },
              {
                icon: Wand2,
                title: "Plan mode",
                desc: "Clarify, approve a step plan, then build with progress tracking.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-[#0c1520] p-6 transition-colors hover:border-brand-500/30"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                  <item.icon className="h-5 w-5 text-brand-400" />
                </div>
                <h3 className="mb-1 font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingPricingSection />
      <MarketingRoadmapSection />

      <section className="relative z-10 border-t border-white/5 py-24">
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[300px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-[100px]" />
          </div>
          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
              Ready to build with Appbrics?
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-gray-400">
              Start free. Upgrade when you ship. Stripe Checkout handles payments
              securely.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                className="h-12 rounded-full bg-white px-8 text-sm font-semibold text-black hover:bg-gray-200"
              >
                <Link href="/signup">Start for free</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-12 rounded-full px-8 text-sm text-gray-400 hover:text-white"
              >
                <Link href="#pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
