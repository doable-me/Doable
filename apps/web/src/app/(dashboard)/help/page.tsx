import { getUiText } from "@/i18n/server";

import { useUiText } from "@/i18n/use-ui-text";
import { translateUiData } from "@/i18n/text";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

export async function generateMetadata() {
  const ui = await getUiText();
  return translateUiData(
    {
      title: "Help Center — Doable",
      description:
        "Guides and articles to help you get the most out of Doable.",
    },
    ui,
  );
}

const articles = [
  {
    href: "/help/discover-vs-marketplace",
    title: "Discover vs Marketplace",
    description:
      "Understand the difference between Discover, Marketplace, and Deploy — and when to use each.",
  },
];

export default function HelpIndexPage() {
  const ui = useUiText();
  const i18n_articles = translateUiData(articles, ui);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            {ui("Help")}
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {ui("Help Center")}
          </h1>
          <p className="text-muted-foreground">
            {" "}
            {ui(
              "Guides and articles to help you get the most out of Doable.",
            )}{" "}
          </p>
        </div>

        <div className="space-y-3">
          {i18n_articles.map((article) => (
            <Link
              key={article.href}
              href={article.href}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-5 hover:bg-accent transition-colors group"
            >
              <div className="mt-0.5 p-1.5 bg-blue-500/15 rounded-md shrink-0">
                <BookOpen className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground group-hover:text-foreground">
                  {article.title}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {article.description}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
