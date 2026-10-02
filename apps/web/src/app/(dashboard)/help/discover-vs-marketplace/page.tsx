import { translateUiData } from "@/i18n/text";
import { getUiText } from "@/i18n/server";

import { useUiText } from "@/i18n/use-ui-text";
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

export async function generateMetadata() {
  const ui = await getUiText();
  return translateUiData(
    {
      title: "Discover vs Marketplace — Doable",
      description:
        "Understand the difference between Discover, Marketplace, and Deploy.",
    },
    ui,
  );
}

export default function DiscoverVsMarketplacePage() {
  const ui = useUiText();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            {ui("Help")}
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {" "}
            {ui("Discover vs Marketplace")}{" "}
          </h1>
          <p className="text-muted-foreground">
            {" "}
            {ui(
              "Doable has three places to share things with the world. Here's how they're different.",
            )}{" "}
          </p>
        </div>

        {/* Three-column comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-500/15 rounded-md">
                <Rocket className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="font-semibold text-foreground">{ui("Deploy")}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {" "}
              {ui("Ships your project to a public URL.")}{" "}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>{ui("• Sets the live URL anyone can visit")}</li>
              <li>{ui("• Stays under your account")}</li>
              <li>
                {ui("• Other users")} <em>{ui("cannot")}</em>{" "}
                {ui("remix or install it")}
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-emerald-500/15 rounded-md">
                <Compass className="w-4 h-4 text-emerald-400" />
              </div>
              <h2 className="font-semibold text-foreground">
                {ui("Share to Discover")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {" "}
              {ui("Lists your")} <strong>{ui("whole project")}</strong>{" "}
              {ui("in the community feed.")}{" "}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>{ui("• Other users can browse and remix")}</li>
              <li>{ui("• Remixes copy your code into their workspace")}</li>
              <li>{ui("• Free, no review needed")}</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-violet-500/15 rounded-md">
                <Store className="w-4 h-4 text-violet-400" />
              </div>
              <h2 className="font-semibold text-foreground">
                {ui("List on Marketplace")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {" "}
              {ui("Packages an")} <strong>{ui("AI environment")}</strong>{" "}
              {ui("as an installable bundle.")}{" "}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>{ui("• Skills + rules + knowledge + MCP connectors")}</li>
              <li>{ui("• Installs into anyone's workspace")}</li>
              <li>{ui("• Connector bundles need a quick review")}</li>
            </ul>
          </div>
        </div>

        {/* Decision flow */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {ui("Which should I use?")}
          </h2>
          <div className="space-y-3">
            <DecisionRow
              icon={<Rocket className="w-4 h-4 text-blue-400" />}
              q={ui("I want to send my friend a working app.")}
              a="Deploy → share the URL."
            />
            <DecisionRow
              icon={<Share2 className="w-4 h-4 text-emerald-400" />}
              q={ui("I want others to fork my project as a starting point.")}
              a={ui("Share to Discover.")}
            />
            <DecisionRow
              icon={<Download className="w-4 h-4 text-violet-400" />}
              q={ui(
                "I built a useful set of skills + rules and want others to install them.",
              )}
              a={ui("List on Marketplace.")}
            />
            <DecisionRow
              icon={<Users className="w-4 h-4 text-amber-400" />}
              q={ui("I want to charge for an AI environment I built.")}
              a={ui(
                "List on Marketplace with a price (Stripe Connect required).",
              )}
            />
          </div>
        </section>

        {/* Glossary */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {ui("Glossary")}
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">{ui("Project")}</dt>
              <dd className="text-muted-foreground mt-1">
                {" "}
                {ui(
                  "A whole app or site you build in the editor — code, pages, components.",
                )}{" "}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">
                {ui("Environment")}
              </dt>
              <dd className="text-muted-foreground mt-1">
                {" "}
                {ui(
                  "A bundle of AI configuration that augments your editor: skills (instructions), rules (always-on context), knowledge files, and MCP connectors.",
                )}{" "}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">{ui("Remix")}</dt>
              <dd className="text-muted-foreground mt-1">
                {" "}
                {ui(
                  "Copy of someone else's project into your account. You own the copy and can change anything.",
                )}{" "}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">{ui("Install")}</dt>
              <dd className="text-muted-foreground mt-1">
                {" "}
                {ui(
                  "Add a Marketplace environment to one of your workspaces. Installs are versioned, you can update or uninstall any time.",
                )}{" "}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium text-foreground">
                {ui("MCP connector")}
              </dt>
              <dd className="text-muted-foreground mt-1">
                {" "}
                {ui(
                  "A bridge that lets the AI use a third-party service (Slack, GitHub, your database, etc.) via the Model Context Protocol standard.",
                )}{" "}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {ui("Standards we follow")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {" "}
            {ui(
              "Marketplace bundles are interoperable. The same bundle installs in Doable and works in tools that follow these standards.",
            )}{" "}
          </p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>
              <span className="text-foreground font-medium">
                {ui("Anthropic Agent Skills")}
              </span>{" "}
              —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                SKILL.md
              </code>{" "}
              {ui("with frontmatter.")}{" "}
            </li>
            <li>
              <span className="text-foreground font-medium">
                {ui("Model Context Protocol (MCP)")}
              </span>{" "}
              —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                mcp.json
              </code>{" "}
              {ui(
                "server config compatible with Claude Desktop and Cursor.",
              )}{" "}
            </li>
            <li>
              <span className="text-foreground font-medium">
                {ui("Cursor Rules")}
              </span>{" "}
              —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                .mdc
              </code>{" "}
              {ui("rule files.")}{" "}
            </li>
            <li>
              <span className="text-foreground font-medium">
                {ui("Claude Code Plugins")}
              </span>{" "}
              —
              <code className="mx-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                plugin.json
              </code>{" "}
              {ui("manifest layout.")}{" "}
            </li>
          </ul>
        </section>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-md bg-secondary border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Compass className="w-4 h-4" /> {ui("Browse Discover")}{" "}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-md bg-secondary border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Store className="w-4 h-4" /> {ui("Browse Marketplace")}{" "}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/marketplace/new"
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> {ui("List your environment")}{" "}
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
