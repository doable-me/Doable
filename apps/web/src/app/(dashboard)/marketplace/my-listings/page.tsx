"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Star,
  Download,
  ExternalLink,
  Trash2,
  Rocket,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyListings, type MarketplaceListing } from "@/modules/marketplace/use-marketplace";

const STATUS_STYLES: Record<MarketplaceListing["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  pending: { label: "In review", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  published: { label: "Live", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  unlisted: { label: "Unlisted", className: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export default function MyListingsPage() {
  const { listings, loading, publishListing, deleteListing, refresh } = useMyListings();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handlePublish(id: string) {
    setBusyId(id);
    try {
      await publishListing(id);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteListing(id);
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Marketplace
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-semibold text-foreground">My listings</h1>
        <Link
          href="/marketplace/new"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New listing
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Rocket className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <h2 className="text-lg font-medium text-foreground">No listings yet</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Package one of your environments and share it with the community. Listings appear in the Marketplace and can be installed in any workspace.
          </p>
          <Link
            href="/marketplace/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create your first listing
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const style = STATUS_STYLES[listing.status];
            return (
              <div
                key={listing.id}
                className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{listing.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.className}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">v{listing.version}</span>
                  </div>
                  {listing.short_desc && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.short_desc}</p>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" /> {listing.install_count} install
                      {listing.install_count !== 1 ? "s" : ""}
                    </span>
                    {listing.review_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {listing.avg_rating.toFixed(1)} ({listing.review_count})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {listing.status === "published" && (
                    <Link
                      href={`/marketplace/${listing.slug}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" /> View
                    </Link>
                  )}
                  {listing.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={() => handlePublish(listing.id)}
                      disabled={busyId === listing.id}
                      className="h-8 px-2.5"
                    >
                      {busyId === listing.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Rocket className="mr-1 h-3 w-3" />
                          Publish
                        </>
                      )}
                    </Button>
                  )}
                  {listing.status === "unlisted" && (
                    <span className="inline-flex h-8 items-center gap-1 px-2 text-xs text-muted-foreground">
                      <EyeOff className="h-3 w-3" /> Hidden
                    </span>
                  )}
                  <button
                    onClick={() => setConfirmDelete(listing.id)}
                    disabled={busyId === listing.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete listing"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Delete this listing?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes it from the Marketplace immediately. Existing installs will keep working — they
                  reference cloned environments, not the listing itself.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete}>
                Cancel
              </Button>
              <Button
                onClick={() => handleDelete(confirmDelete)}
                disabled={busyId === confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                {busyId === confirmDelete ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
