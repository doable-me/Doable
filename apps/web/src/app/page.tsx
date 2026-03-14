import Link from "next/link";
import {
  MessageSquare,
  Code2,
  Rocket,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  Globe,
  Twitter,
  Github,
  Linkedin,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* ─── Nav Bar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1">
            <span className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
              Doable
            </span>
            <span className="inline-block h-2 w-2 rounded-full bg-[hsl(263,70%,50%)]" />
          </Link>

          {/* Center Links */}
          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              Solutions
            </Link>
            <Link
              href="#templates"
              className="text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              Resources
            </Link>
            <Link
              href="#cta"
              className="text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              Pricing
            </Link>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] sm:inline-block"
            >
              Log in
            </Link>
            <Button
              asChild
              className="rounded-full bg-[hsl(263,70%,50%)] px-5 text-white hover:bg-[hsl(263,70%,45%)]"
            >
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-float-slow absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-purple-400/15 blur-3xl" />
          <div className="animate-float-medium absolute -bottom-32 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-400/10 blur-3xl" />
          <div className="animate-float-fast absolute left-1/2 top-1/3 h-[300px] w-[300px] rounded-full bg-fuchsia-400/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28 lg:px-8 lg:pt-36">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
              <Sparkles className="h-4 w-4" />
              Now in public beta
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl lg:text-7xl">
              Build something{" "}
              <span className="text-gradient">Doable</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-xl">
              Create apps and websites by chatting with AI. Go from idea to
              deployed app in minutes, not months.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-[hsl(263,70%,50%)] px-8 text-base font-semibold text-white shadow-lg shadow-purple-500/25 hover:bg-[hsl(263,70%,45%)] hover:shadow-xl hover:shadow-purple-500/30"
              >
                <Link href="/signup">
                  Start building for free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-12 rounded-full px-8 text-base font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <Link href="#features">
                  Watch demo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Proof Bar ────────────────────────────────── */}
      <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Trusted by developers and teams worldwide
          </p>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {[
              { value: "50,000+", label: "Apps built" },
              { value: "10,000+", label: "Developers" },
              { value: "99.9%", label: "Uptime" },
              { value: "150+", label: "Countries" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-[hsl(var(--foreground))] sm:text-3xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Section ────────────────────────────────── */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(263,70%,50%)]">
              How it works
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
              From idea to app in three steps
            </h2>
            <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))]">
              No complex setup. No steep learning curve. Just describe what you
              want and watch it come to life.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                title: "Describe your app",
                description:
                  "Tell Doable what you want to build in plain English. Describe features, design preferences, and functionality.",
                step: "01",
              },
              {
                icon: Code2,
                title: "AI builds it",
                description:
                  "Watch as AI generates production-ready code in real time. Full-stack, responsive, and ready to customize.",
                step: "02",
              },
              {
                icon: Rocket,
                title: "Deploy instantly",
                description:
                  "One click to publish your app to the web. Custom domains, SSL, and global CDN included.",
                step: "03",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 transition-all hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/5 dark:hover:border-purple-800"
              >
                <div className="mb-4 text-xs font-bold uppercase tracking-widest text-[hsl(263,70%,50%)]">
                  Step {feature.step}
                </div>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-[hsl(263,70%,50%)] dark:bg-purple-950/50">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Extra Features Row ──────────────────────────────── */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
              Everything you need to ship fast
            </h2>
            <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))]">
              Built-in tools and integrations so you can focus on building, not
              configuring.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Zap,
                title: "Lightning fast",
                desc: "Optimized builds and edge deployment for sub-second load times.",
              },
              {
                icon: Shield,
                title: "Secure by default",
                desc: "Enterprise-grade security with automatic SSL and DDoS protection.",
              },
              {
                icon: Globe,
                title: "Global CDN",
                desc: "Your app served from 200+ edge locations worldwide.",
              },
              {
                icon: Code2,
                title: "Full code access",
                desc: "Export your code anytime. No lock-in, ever.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl p-6">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-[hsl(263,70%,50%)] dark:bg-purple-950/50">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold text-[hsl(var(--foreground))]">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Template Gallery Section ────────────────────────── */}
      <section id="templates" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(263,70%,50%)]">
              Templates
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
              Start from a template
            </h2>
            <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))]">
              Jumpstart your project with pre-built templates. Customize
              everything to match your vision.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "SaaS Dashboard",
                desc: "Analytics, user management, billing",
                gradient: "from-purple-500 to-blue-500",
              },
              {
                title: "Landing Page",
                desc: "Hero, features, testimonials, CTA",
                gradient: "from-pink-500 to-purple-500",
              },
              {
                title: "E-commerce",
                desc: "Products, cart, checkout, payments",
                gradient: "from-orange-400 to-pink-500",
              },
              {
                title: "Portfolio",
                desc: "Projects, blog, contact form",
                gradient: "from-emerald-400 to-cyan-500",
              },
            ].map((template) => (
              <div
                key={template.title}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/5 dark:hover:border-purple-800"
              >
                {/* Gradient preview */}
                <div
                  className={`h-40 bg-gradient-to-br ${template.gradient} opacity-80 transition-opacity group-hover:opacity-100`}
                />
                <div className="p-5">
                  <h3 className="font-semibold text-[hsl(var(--foreground))]">
                    {template.title}
                  </h3>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    {template.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─────────────────────────────────────── */}
      <section
        id="cta"
        className="relative overflow-hidden bg-[hsl(240,10%,6%)] py-24 sm:py-32"
      >
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-purple-600/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to build?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            Join thousands of developers building their next project with
            Doable. Start for free, no credit card required.
          </p>

          <div className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="Enter your email"
              className="h-12 flex-1 rounded-full border border-gray-700 bg-gray-800/50 px-5 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
            <Button className="h-12 rounded-full bg-[hsl(263,70%,50%)] px-8 text-sm font-semibold text-white hover:bg-[hsl(263,70%,45%)]">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Free forever for personal projects. No credit card required.
          </p>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {/* Brand column */}
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-1">
                <span className="text-lg font-bold text-[hsl(var(--foreground))]">
                  Doable
                </span>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(263,70%,50%)]" />
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                Build apps and websites by chatting with AI. From idea to
                deployed app in minutes.
              </p>
              <div className="mt-4 flex gap-4">
                <a
                  href="#"
                  className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                  aria-label="Twitter"
                >
                  <Twitter className="h-5 w-5" />
                </a>
                <a
                  href="#"
                  className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                  aria-label="GitHub"
                >
                  <Github className="h-5 w-5" />
                </a>
                <a
                  href="#"
                  className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-5 w-5" />
                </a>
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
                <h4 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                  {col.title}
                </h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-[hsl(var(--border))] pt-6">
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
              &copy; {new Date().getFullYear()} Doable. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
