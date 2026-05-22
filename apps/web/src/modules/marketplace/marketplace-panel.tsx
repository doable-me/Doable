"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Store,
  Search,
  Star,
  Download,
  Filter,
  Sparkles,
  BookOpen,
  Shield as ShieldIcon,
  Plug,
  TrendingUp,
  HelpCircle,
  Plus,
  Library,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useMarketplaceBrowse,
  useMarketplaceInstalls,
  type MarketplaceListing,
  type MarketplaceCategory,
} from "./use-marketplace";
import { InstallPermissionDialog } from "./install-permission-dialog";
import { ImportBundleDialog } from "./import-bundle-dialog";

// ─── Sub-Components ─────────────────────────────────────

function CategoryPill({
  cat,
  active,
  onClick,
}: {
  cat: MarketplaceCategory | { slug: string; name: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
          : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span>{cat.icon}</span>
      <span>{cat.name}</span>
    </button>
  );
}

function ListingCard({
  listing,
  installed,
  onInstall,
  onClick,
}: {
  listing: MarketplaceListing;
  installed: boolean;
  onInstall: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group bg-card border border-border rounded-xl p-5 hover:border-border hover:bg-accent/30 transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate group-hover:text-brand-300 transition-colors">
            {listing.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            by {listing.publisher_name}
          </p>
        </div>
        {listing.featured && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full text-xs font-medium">
            <Sparkles className="w-3 h-3" /> Featured
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
        {listing.short_desc || "No description"}
      </p>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        {listing.avg_rating > 0 && (
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {listing.avg_rating.toFixed(1)}
            <span className="text-muted-foreground">({listing.review_count})</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" />
          {listing.install_count}
        </span>
        {listing.category_name && (
          <span className="flex items-center gap-1">
            {listing.category_icon} {listing.category_name}
          </span>
        )}
      </div>

      {/* Composition summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
        {listing.skill_count > 0 && (
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-violet-400" />
            {listing.skill_count} skill{listing.skill_count !== 1 ? "s" : ""}
          </span>
        )}
        {listing.rule_count > 0 && (
          <span className="flex items-center gap-1">
            <ShieldIcon className="w-3 h-3 text-emerald-400" />
            {listing.rule_count} rule{listing.rule_count !== 1 ? "s" : ""}
          </span>
        )}
        {listing.knowledge_count > 0 && (
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-sky-400" />
            {listing.knowledge_count} file{listing.knowledge_count !== 1 ? "s" : ""}
          </span>
        )}
        {listing.connector_count > 0 && (
          <span className="flex items-center gap-1">
            <Plug className="w-3 h-3 text-orange-400" />
            {listing.connector_count}
          </span>
        )}
      </div>

      {/* Tags */}
      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {listing.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">v{listing.version}</span>
        <Button
          size="sm"
          variant={installed ? "outline" : "default"}
          onClick={(e) => {
            e.stopPropagation();
            if (!installed) onInstall();
          }}
          className={installed ? "pointer-events-none opacity-60" : ""}
        >
          {installed ? "Installed" : "Install"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Marketplace Page ──────────────────────────────

export function MarketplacePanel({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "rating">("popular");
  const [pendingListing, setPendingListing] = useState<MarketplaceListing | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { listings, categories, total, loading } = useMarketplaceBrowse({
    category: activeCategory,
    search: search || undefined,
    sort: sortBy,
  });
  const { isInstalled, install } = useMarketplaceInstalls(workspaceId);

  const allCategories = useMemo(
    () => [{ slug: "", name: "All", icon: "🔥" }, ...categories],
    [categories],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-500/15 rounded-lg">
            <Store className="w-6 h-6 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
          <Link
            href="/help/discover-vs-marketplace"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="What's the difference between Discover and Marketplace?"
          >
            <HelpCircle className="h-3 w-3" />
            Discover vs Marketplace
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              title="Import a bundle from JSON, a Standards Zip, or a public GitHub URL"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <Link
              href="/marketplace/my-listings"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              title="Manage listings you've published"
            >
              <Library className="h-3.5 w-3.5" />
              My listings
            </Link>
            <Link
              href="/marketplace/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
              title="Package one of your environments and list it"
            >
              <Plus className="h-3.5 w-3.5" />
              List on Marketplace
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Install AI environments — skills, rules, knowledge, and MCP connectors — created by the community.
        </p>
      </div>

      {/* Search + Sort */}
      <div className="px-8 pb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search environments, skills, tags..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {(["popular", "newest", "rating"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                sortBy === s
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "popular" ? (
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Popular</span>
              ) : (
                s
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Category pills */}
      <div className="px-8 pb-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        {allCategories.map((cat) => (
          <CategoryPill
            key={cat.slug}
            cat={cat}
            active={(activeCategory ?? "") === cat.slug}
            onClick={() => setActiveCategory(cat.slug || undefined)}
          />
        ))}
      </div>

      {/* Results */}
      <div className="px-8 pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-1/3 mb-4" />
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-2/3 mb-4" />
                <div className="h-8 bg-muted rounded w-20 ml-auto" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No listings found</p>
            <p className="text-muted-foreground text-sm mt-1">
              {search ? "Try a different search term" : "Be the first to publish an environment!"}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{total} environment{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  installed={isInstalled(listing.id)}
                  onInstall={() => setPendingListing(listing)}
                  onClick={() => router.push(`/marketplace/${listing.slug}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {pendingListing && (
        <InstallPermissionDialog
          open={!!pendingListing}
          onOpenChange={(o) => { if (!o) setPendingListing(null); }}
          listing={pendingListing}
          onConfirm={async () => { await install(pendingListing.id); }}
        />
      )}

      <ImportBundleDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}
