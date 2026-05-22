"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Download,
  Sparkles,
  Shield as ShieldIcon,
  BookOpen,
  Plug,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Tag,
  Package,
  BadgeCheck,
  Flag,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import {
  useMarketplaceListing,
  useMarketplaceInstalls,
} from "@/modules/marketplace/use-marketplace";
import { InstallPermissionDialog } from "@/modules/marketplace/install-permission-dialog";
import { ReportListingDialog } from "@/modules/marketplace/report-listing-dialog";

export default function MarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [installError, setInstallError] = useState<string | null>(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { listing, reviews, loading } = useMarketplaceListing(slug);
  const { isInstalled, install } = useMarketplaceInstalls(workspace?.id ?? "");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiListWorkspaces();
        setWorkspaces(res.data);
        // Default to the workspace the sidebar has active. The previous
        // behaviour (`res.data[0]`) caused installs to land in whichever
        // workspace sorted first, which on accounts with multiple ws
        // meant installs went to the wrong place.
        const activeId = typeof window !== "undefined"
          ? localStorage.getItem("doable_active_workspace_id")
          : null;
        const active = activeId ? res.data.find((w) => w.id === activeId) : null;
        setWorkspace(active ?? res.data[0] ?? null);
      } finally {
        setWorkspaceLoading(false);
      }
    })();
  }, []);

  const handleWorkspaceChange = (id: string) => {
    const next = workspaces.find((w) => w.id === id);
    if (next) {
      setWorkspace(next);
      if (typeof window !== "undefined") {
        localStorage.setItem("doable_active_workspace_id", next.id);
      }
    }
  };

  const handleConfirmInstall = async () => {
    if (!listing) return;
    setInstallError(null);
    try {
      await install(listing.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Install failed";
      setInstallError(message);
      throw err;
    }
  };

  if (loading || workspaceLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Package className="w-12 h-12" />
        <p className="font-medium text-foreground">Listing not found</p>
        <p className="text-sm">It may have been removed or unpublished.</p>
        <Link href="/marketplace" className="mt-2">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  const installed = isInstalled(listing.id);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header strip */}
      <div className="border-b border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-8 py-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Marketplace
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-8 pt-8 pb-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {listing.featured && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full text-xs font-medium">
                  <Sparkles className="w-3 h-3" /> Featured
                </span>
              )}
              {listing.category_name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {listing.category_icon} {listing.category_name}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{listing.title}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>by</span>
              <span className="text-foreground font-medium">{listing.publisher_name}</span>
              {listing.publisher_verified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-medium text-sky-300"
                  title="Verified publisher"
                >
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              )}
              <span>· v{listing.version}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {workspace ? (
              <>
                <Button
                  size="lg"
                  onClick={() => setPermissionDialogOpen(true)}
                  disabled={installed}
                  className={installed ? "pointer-events-none opacity-60" : ""}
                >
                  {installed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Installed
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" /> Install
                    </>
                  )}
                </Button>
                {/* Workspace destination — visible BEFORE you click Install
                    so it's never ambiguous where this is going to land. */}
                {workspaces.length > 1 ? (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Install to:</span>
                    <select
                      value={workspace.id}
                      onChange={(e) => handleWorkspaceChange(e.target.value)}
                      disabled={installed}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Installs to <span className="text-foreground font-medium">{workspace.name}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No workspace available</p>
            )}
            {installError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {installError}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground border-y border-border py-3">
          {listing.avg_rating > 0 && (
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-foreground font-medium">{listing.avg_rating.toFixed(1)}</span>
              <span>({listing.review_count} review{listing.review_count !== 1 ? "s" : ""})</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Download className="w-4 h-4" />
            <span className="text-foreground font-medium">{listing.install_count}</span>
            <span>install{listing.install_count !== 1 ? "s" : ""}</span>
          </span>
          {listing.published_at && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>Updated {new Date(listing.updated_at).toLocaleDateString()}</span>
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-8 pb-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Description */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">About</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-muted-foreground">
              {listing.long_desc || listing.short_desc || "No description provided."}
            </div>
          </section>

          {/* Changelog */}
          {listing.changelog && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3">What's new in v{listing.version}</h2>
              <pre className="rounded-lg bg-muted p-4 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {listing.changelog}
              </pre>
            </section>
          )}

          {/* Reviews */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ""}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{review.user_name}</span>
                        <span className="flex items-center gap-0.5 text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-400" : ""}`}
                            />
                          ))}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {review.title && (
                      <p className="font-medium text-sm text-foreground mb-1">{review.title}</p>
                    )}
                    {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Composition card — what's in this bundle */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">What's included</h3>
            <ul className="space-y-2 text-sm">
              {listing.skill_count > 0 && (
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Sparkles className="w-4 h-4 text-violet-400" /> Skills
                  </span>
                  <span className="font-medium text-foreground">{listing.skill_count}</span>
                </li>
              )}
              {listing.rule_count > 0 && (
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <ShieldIcon className="w-4 h-4 text-emerald-400" /> Rules
                  </span>
                  <span className="font-medium text-foreground">{listing.rule_count}</span>
                </li>
              )}
              {listing.knowledge_count > 0 && (
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen className="w-4 h-4 text-sky-400" /> Knowledge files
                  </span>
                  <span className="font-medium text-foreground">{listing.knowledge_count}</span>
                </li>
              )}
              {listing.connector_count > 0 && (
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Plug className="w-4 h-4 text-orange-400" /> MCP connectors
                  </span>
                  <span className="font-medium text-foreground">{listing.connector_count}</span>
                </li>
              )}
              {listing.skill_count + listing.rule_count + listing.knowledge_count + listing.connector_count === 0 && (
                <li className="text-sm text-muted-foreground italic">Empty environment</li>
              )}
            </ul>
          </div>

          {/* Connector warning — high-trust action */}
          {listing.connector_count > 0 && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-orange-300 mb-1">Includes MCP connectors</p>
                  <p>
                    This bundle adds {listing.connector_count} external tool connection
                    {listing.connector_count !== 1 ? "s" : ""}. You'll be asked to authorise
                    each one separately after install.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {listing.tags.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" /> Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => router.push(`/marketplace?search=${encodeURIComponent(tag)}`)}
                    className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs hover:bg-accent transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Help link */}
          <Link
            href="/help/discover-vs-marketplace"
            className="block rounded-lg border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground hover:bg-card transition-colors"
          >
            <p className="font-medium text-foreground mb-1">What is the Marketplace?</p>
            <p>Learn the difference between Discover (whole projects) and the Marketplace (AI environments).</p>
          </Link>

          {/* Report */}
          <button
            onClick={() => setReportOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-2 text-xs text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
          >
            <Flag className="h-3.5 w-3.5" /> Report this listing
          </button>
        </aside>
      </div>

      {workspace && (
        <InstallPermissionDialog
          open={permissionDialogOpen}
          onOpenChange={setPermissionDialogOpen}
          listing={listing}
          onConfirm={handleConfirmInstall}
        />
      )}

      <ReportListingDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        listingId={listing.id}
        listingTitle={listing.title}
      />
    </div>
  );
}
