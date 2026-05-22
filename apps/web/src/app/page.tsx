"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Plus,
  Mic,
  MonitorSmartphone,
  Gauge,
  Lock,
  Earth,
  Braces,
  Lightbulb,
  Wand2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeFooter } from "./home-footer";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  // Redirect to dashboard if already authenticated
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
    // Already logged in → go directly to dashboard with prompt
    const token = localStorage.getItem("doable_access_token");
    if (token) {
      router.push(`/dashboard?prompt=${encoded}`);
    } else {
      router.push(`/signup?prompt=${encoded}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ─── Nav Bar ─────────────────────────────────────────── */}
      <nav className="relative z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-300">
              <span className="text-sm font-bold text-white self-end mb-1">D</span>
              <span className="h-2 w-2 rounded-full bg-violet-700 self-end mb-2 ml-0.5 shrink-0" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              Doable
            </span>
          </Link>

          {/* Center Links */}
          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="#features"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Solutions
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Resources
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Pricing
            </Link>
            <Link
              href="#community"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Community
            </Link>
          </div>

          {/* Right Actions */}
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

      {/* ─── Hero Section ────────────────────────────────────── */}
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4">
        {/* Gradient background */}
        <div className="pointer-events-none absolute inset-0">
          {/* Top: deep brand glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950 via-[#0a0a0a] to-transparent opacity-80" />
          {/* Center: brand glow */}
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/15 blur-[120px]" />
          {/* Bottom: warm gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-[50vh]">
            <div className="absolute inset-0 bg-gradient-to-t from-brand-400/20 via-brand-300/10 to-transparent" />
            <div className="absolute bottom-0 left-1/4 h-[300px] w-[400px] rounded-full bg-brand-500/15 blur-[100px]" />
            <div className="absolute bottom-0 right-1/4 h-[300px] w-[400px] rounded-full bg-brand-400/15 blur-[100px]" />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 mx-auto w-full max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Dream it. Do it. Done.
          </h1>
          <p className="mb-12 text-base text-gray-400 sm:text-lg">
            Say it. Doable does it.
          </p>

          {/* Prompt Input Box */}
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
            <div className="rounded-2xl border border-gray-800 bg-[#1a1a1a] p-3 shadow-2xl shadow-black/50 transition-colors focus-within:border-gray-600">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What do you want Doable to do?"
                rows={3}
                className="w-full resize-none bg-transparent px-2 pt-1 text-sm text-white placeholder:text-gray-500 focus:outline-none sm:text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              {/* Bottom toolbar */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                    title="Attach file"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                    title="Screenshot"
                  >
                    <MonitorSmartphone className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                    title="Voice input"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                  <button
                    type="submit"
                    className="ml-1 rounded-full bg-gray-700 p-2 text-white transition-colors hover:bg-gray-600 disabled:opacity-40"
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

      {/* ─── Social Proof Bar ────────────────────────────────── */}
      <section className="relative z-10 border-t border-gray-800/50 bg-[#0a0a0a] py-16">
        <p className="mb-8 text-center text-sm text-gray-500">
          Teams who do more, do it with Doable
        </p>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-6 px-4 opacity-40">
          {["Zendesk", "Uber", "Microsoft", "ElevenLabs", "HubSpot"].map(
            (name) => (
              <span
                key={name}
                className="text-lg font-semibold tracking-wide text-gray-300"
              >
                {name}
              </span>
            )
          )}
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            How you Do it with Doable
          </h2>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {[
              {
                icon: Lightbulb,
                title: "Say what you want to do",
                description:
                  "Describe your app, drop in screenshots, or share docs. Doable gets it.",
              },
              {
                icon: Wand2,
                title: "Watch Doable doing it",
                description:
                  "AI writes the code, builds the UI, and sets up the backend while you watch.",
              },
              {
                icon: Send,
                title: "Done. Ship it.",
                description:
                  "One click deploy. Custom domains, SSL, and global CDN all done for you.",
              },
            ].map((step) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800">
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

      {/* ─── Features Grid ───────────────────────────────────── */}
      <section id="features" className="relative z-10 border-t border-gray-800/50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center text-3xl font-bold sm:text-4xl">
            Everything you need to get it done
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-gray-400">
            All the tools built in so you keep doing, not configuring. Doable handles the rest.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Gauge,
                title: "Lightning fast",
                desc: "Optimized builds and edge deployment for sub-second load times.",
              },
              {
                icon: Lock,
                title: "Secure by default",
                desc: "Enterprise-grade security with automatic SSL and DDoS protection.",
              },
              {
                icon: Earth,
                title: "Global CDN",
                desc: "Your app served from 200+ edge locations worldwide.",
              },
              {
                icon: Braces,
                title: "Full code access",
                desc: "Export your code anytime. No lock-in, ever.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-800 bg-[#111] p-6 transition-colors hover:border-gray-700"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
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

      {/* ─── CTA Section ─────────────────────────────────────── */}
      <section id="pricing" className="relative z-10 py-24">
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          {/* Background glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[300px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-[100px]" />
          </div>

          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
              Ready to do this? Doable is.
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-gray-400">
              Thousands of makers are already doing it with Doable.
              Start for free. No credit card required.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                className="h-12 rounded-full bg-white px-8 text-sm font-semibold text-black hover:bg-gray-200"
              >
                <Link href="/signup">Start doing for free</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-12 rounded-full px-8 text-sm text-gray-400 hover:text-white"
              >
                <Link href="#how-it-works">Learn more</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-gray-600">
              Free forever for personal projects. Just do it with Doable.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <HomeFooter />
    </div>
  );
}
