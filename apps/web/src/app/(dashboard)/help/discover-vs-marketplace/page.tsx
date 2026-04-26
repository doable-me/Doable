import Link from "next/link";
import {
  Compass,
  Store,
  Rocket,
  Share2,
  Download,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Discover vs Marketplace — Doable",
  description: "Understand the difference between Discover, Marketplace, and Deploy.",
};

export default function DiscoverVsMarketplacePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Help</p>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Discover vs Marketplace
          </h1>
          <p className="text-muted-foreground">
            Doable has three places to share things with the world. Here's how they're different.
          </p>
        </div>

        {/* Three-column comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-500/15 rounded-md">
                <Rocket className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="font-semibold text-foreground">Deploy</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Ships your project to a public URL.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>• Sets the live URL anyone can visit</li>
              <li>• Stays under your account</li>
              <li>• Other users <em>cannot</em> remix or install it</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-emerald-500/15 rounded-md">
                <Compass className="w-4 h-4 text-emerald-400" />
              </div>
              <h2 className="font-semibold text-foreground">Share to Discover</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Lists your <strong>whole project</strong> in the community feed.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>• Other users can browse and remix</li>
              <li>• Remixes copy your code into their workspace</li>
              <li>• Free, no review needed</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-violet-500/15 rounded-md">
                <Store className="w-4 h-4 text-violet-400" />
              </div>
              <h2 className="font-semibold text-foreground">List on Marketplace</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Packages an <strong>AI environment</strong> as an installable bundle.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>• Skills + rules + knowledge + MCP connectors</li>
              <li>• Installs into anyone's workspace</li>
              <li>• Connector bundles need a quick review</li>
            </ul>
          </div>
        </div>

        {/* Decision flow */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Which should I use?</h2>
          <div className="space-y-3">
            <DecisionRow
              icon={<Rocket className="w-4 h-4 text-blue-400" />}
              q="I want to send my friend a working app."
              a="Deploy → share the URL."
            />
            <DecisionRow
              icon={<Share2 className="w-4 h-4 text-emerald-400" />}
              q="I want others to fork my project as a starting point."
              a="Share to Discover."
            />
            <DecisionRow
              icon={<Download className="w-4 h-4 text-violet-400" />}
              q="I built a useful set of skills + rules and want others to install them."
              a="List on Marketplace."
            />
            <DecisionRow
              icon={<Users className="w-4 h-4 text-amber-400" />}
              q="I want to charge for an AI environment I built."
              a="List on Marketplace with a price (Stripe Connect required)."
            />
          </div>
        </section>

        {/* Glossary */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Glossary</h2>
          <dl className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">Project</dt>
              <dd className="text-muted-foreground mt-1">
                A whole app or site you build in the editor — code, pages, components.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">Environment</dt>
              <dd className="text-muted-foreground mt-1">
                A bundle of AI configuration that augments your editor: skills (instructions),
                rules (always-on context), knowledge files, and MCP connectors.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">Remix</dt>
              <dd className="text-muted-foreground mt-1">
                Copy of someone else's project into your account. You own the copy and can change anything.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">Install</dt>
              <dd className="text-muted-foreground mt-1">
                Add a Marketplace environment to one of your workspaces. Installs are versioned,
                you can update or uninstall any time.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">MCP connector</dt>
              <dd className="text-muted-foreground mt-1">
                A bridge that lets the AI use a third-party service (Slack, GitHub, your database, etc.)
                via the Model Context Protocol standard.
              </dd>
            </div>
          </dl>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Standards we follow</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Marketplace bundles are interoperable. The same bundle installs in Doable and works
            in tools that follow these standards.
          </p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>
              <span className="text-foreground font-medium">Anthropic Agent Skills</span> —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">SKILL.md</code> with frontmatter.
            </li>
            <li>
              <span className="text-foreground font-medium">Model Context Protocol (MCP)</span> —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">mcp.json</code> server config compatible with Claude Desktop and Cursor.
            </li>
            <li>
              <span className="text-foreground font-medium">Cursor Rules</span> —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">.mdc</code> rule files.
            </li>
            <li>
              <span className="text-foreground font-medium">Claude Code Plugins</span> —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">plugin.json</code> manifest layout.
            </li>
          </ul>
        </section>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-md bg-secondary border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Compass className="w-4 h-4" /> Browse Discover
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-md bg-secondary border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Store className="w-4 h-4" /> Browse Marketplace
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/marketplace/new"
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> List your environment
          </Link>
        </div>
      </div>
    </div>
  );
}

function DecisionRow({
  icon,
  q,
  a,
}: {
  icon: React.ReactNode;
  q: string;
  a: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-foreground">{q}</p>
        <p className="text-sm text-muted-foreground mt-1">→ {a}</p>
      </div>
    </div>
  );
}
