import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";

export const landingPageTemplate: TemplateDefinition = {
  id: "landing-page",
  name: "Landing Page",
  description: "Marketing landing page with hero, features grid, pricing table, testimonials, and footer. Conversion-optimized.",
  category: "marketing",
  tags: ["react", "landing-page", "marketing", "hero", "pricing", "conversion"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "vite-react",

  codeFiles: {
    // Inherit config from blank
    "package.json": blankTemplate.codeFiles["package.json"]!,
    "vite.config.ts": blankTemplate.codeFiles["vite.config.ts"]!,
    "tsconfig.json": blankTemplate.codeFiles["tsconfig.json"]!,
    "index.html": blankTemplate.codeFiles["index.html"]!,
    "src/main.tsx": blankTemplate.codeFiles["src/main.tsx"]!,
    "src/index.css": blankTemplate.codeFiles["src/index.css"]!,
    "src/lib/utils.ts": blankTemplate.codeFiles["src/lib/utils.ts"]!,

    "src/App.tsx": `import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import { Testimonials } from "@/components/testimonials";
import { Footer } from "@/components/footer";

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Features />
      <Pricing />
      <Testimonials />
      <Footer />
    </div>
  );
}
`,

    "src/components/navbar.tsx": `export const Navbar = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <span className="text-xl font-bold">Brand</span>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
        </nav>
        <div className="flex items-center gap-3">
          <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </button>
          <button className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
};
`,

    "src/components/hero.tsx": `export const Hero = () => {
  return (
    <section className="container mx-auto max-w-6xl px-4 py-24 md:py-32 text-center">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Now in public beta
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Build something{" "}
          <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
            remarkable
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          The modern platform that helps you ship faster. Stop wrestling with infrastructure
          and start building what matters.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <button className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Start Free Trial
          </button>
          <button className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
};
`,

    "src/components/features.tsx": `import { Zap, Shield, Globe, Layers, Code, Sparkles } from "lucide-react";

const FEATURES = [
  { icon: Zap, title: "Lightning Fast", description: "Optimized for speed. Sub-100ms response times." },
  { icon: Shield, title: "Secure by Default", description: "Enterprise-grade security with SOC2 compliance." },
  { icon: Globe, title: "Global Scale", description: "Deploy to 30+ regions with automatic failover." },
  { icon: Layers, title: "Full Stack", description: "Frontend, backend, database, and hosting in one." },
  { icon: Code, title: "Developer First", description: "CLI tools, APIs, and Git integration built in." },
  { icon: Sparkles, title: "AI Powered", description: "Intelligent suggestions from your codebase." },
];

export const Features = () => (
  <section id="features" className="container mx-auto max-w-6xl px-4 py-24">
    <div className="text-center mb-16">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to ship</h2>
      <p className="mt-4 text-lg text-muted-foreground">Powerful features that grow with your team.</p>
    </div>
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.title} className="rounded-lg border bg-card p-6 space-y-3">
          <f.icon className="h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold">{f.title}</h3>
          <p className="text-sm text-muted-foreground">{f.description}</p>
        </div>
      ))}
    </div>
  </section>
);
`,

    "src/components/pricing.tsx": `import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  { name: "Starter", price: "$0", period: "forever", description: "Perfect for side projects", features: ["3 projects", "1 team member", "Community support", "1GB storage"], cta: "Start Free", highlighted: false },
  { name: "Pro", price: "$29", period: "/month", description: "For growing teams", features: ["Unlimited projects", "10 team members", "Priority support", "50GB storage", "Custom domains", "Analytics"], cta: "Start Trial", highlighted: true },
  { name: "Enterprise", price: "Custom", period: "", description: "For large organizations", features: ["Everything in Pro", "Unlimited members", "SSO & SAML", "99.99% SLA", "Dedicated support", "On-premise option"], cta: "Contact Sales", highlighted: false },
];

export const Pricing = () => {
  return (
    <section id="pricing" className="container mx-auto max-w-6xl px-4 py-24">
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          No hidden fees. Upgrade or downgrade at any time.
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "rounded-lg border bg-card p-8 space-y-6",
              plan.highlighted && "border-primary shadow-lg ring-1 ring-primary"
            )}
          >
            <div>
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">{plan.price}</span>
              <span className="text-muted-foreground">{plan.period}</span>
            </div>
            <ul className="space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              className={cn(
                "flex w-full h-10 items-center justify-center rounded-md text-sm font-medium transition-colors",
                plan.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
`,

    "src/components/testimonials.tsx": `const TESTIMONIALS = [
  { quote: "This platform cut our development time in half. We shipped our MVP in two weeks.", author: "Sarah Chen", role: "CTO, TechStart" },
  { quote: "The developer experience is unmatched. Everything just works.", author: "Marcus Johnson", role: "Lead Engineer, ScaleUp" },
  { quote: "We migrated from three different tools to this single platform.", author: "Priya Patel", role: "VP Engineering, GrowthCo" },
];

export const Testimonials = () => (
  <section id="testimonials" className="container mx-auto max-w-6xl px-4 py-24">
    <div className="text-center mb-16">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Loved by developers</h2>
      <p className="mt-4 text-lg text-muted-foreground">Join thousands of teams building with us.</p>
    </div>
    <div className="grid gap-8 md:grid-cols-3">
      {TESTIMONIALS.map((t) => (
        <div key={t.author} className="rounded-lg border bg-card p-6 space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
          <div>
            <p className="text-sm font-semibold">{t.author}</p>
            <p className="text-xs text-muted-foreground">{t.role}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);
`,

    "src/components/footer.tsx": `const LINKS = {
  Product: [["Features", "#features"], ["Pricing", "#pricing"], ["Changelog", "#"]],
  Company: [["About", "#"], ["Blog", "#"], ["Careers", "#"]],
  Legal: [["Privacy", "#"], ["Terms", "#"]],
};

export const Footer = () => (
  <footer className="border-t">
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-8 md:grid-cols-4">
        <div className="space-y-3">
          <span className="text-lg font-bold">Brand</span>
          <p className="text-sm text-muted-foreground">The modern platform for building and shipping software.</p>
        </div>
        {Object.entries(LINKS).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <h4 className="text-sm font-semibold">{title}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {items.map(([label, href]) => (
                <li key={label}><a href={href} className="hover:text-foreground transition-colors">{label}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Brand. All rights reserved.
      </div>
    </div>
  </footer>
);
`,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
Landing Page

## Purpose
A marketing landing page designed to convert visitors into users. Clear value proposition, social proof, and a smooth path to sign-up.

## Personality & Tone
- Confident but not pushy
- Benefit-driven copy over feature lists
- Clean, spacious design that lets the content breathe
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3
- Icons: Lucide React

## Architecture
- Single-page structure with anchor-link navigation
- \`src/components/\` — Section components (hero, features, pricing, etc.)
- Each section is self-contained with its own data

## Patterns
- Sticky navbar with backdrop blur
- Feature grid (2x3 on desktop)
- Pricing cards with highlighted "recommended" plan
- Testimonial cards with attribution
- 4-column footer with link groups
`,
    "soul.md": `# Soul

## Design Philosophy
- Conversion-focused: every section drives toward the CTA
- White space is a feature, not wasted space
- Visual hierarchy: headline > subhead > body > CTA
- Gradient accents for the primary headline focal point

## Color & Typography
- Neutral backgrounds, bold primary buttons, highlighted pricing card with ring
- Large bold headlines (text-4xl to text-6xl), muted body text, generous line height
`,
  },
};
