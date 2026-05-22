"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────

export interface MarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
}

export interface MarketplaceListing {
  id: string;
  environment_id: string;
  publisher_id: string;
  category_id: string | null;
  title: string;
  slug: string;
  short_desc: string;
  long_desc: string;
  tags: string[];
  version: string;
  changelog: string;
  install_count: number;
  avg_rating: number;
  review_count: number;
  status: "draft" | "pending" | "published" | "unlisted" | "rejected";
  featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  publisher_name: string;
  publisher_avatar: string | null;
  publisher_verified?: boolean;
  category_name: string | null;
  category_slug: string | null;
  category_icon: string | null;
  skill_count: number;
  rule_count: number;
  knowledge_count: number;
  connector_count: number;
  // Bundle summary (populated after first build/publish — may be missing
  // on legacy listings).
  bundle_format?: "doable.json.v1" | "standards.zip.v1" | null;
  bundle_size?: number | null;
  bundle_sha256?: string | null;
  manifest_summary?: {
    skills: number;
    rules: number;
    knowledge: number;
    connectors: number;
    permissions: string[];
    requiresReview: boolean;
    reviewReason?: string;
  } | null;
  requires_review_reason?: string | null;
}

export interface MarketplaceInstall {
  id: string;
  listing_id: string;
  user_id: string;
  workspace_id: string;
  environment_id: string;
  version: string;
  installed_at: string;
  is_modified: boolean;
  listing_title?: string;
}

export interface MarketplaceReview {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  user_name: string;
  user_avatar: string | null;
}

// ─── Browse Hook ────────────────────────────────────────

export function useMarketplaceBrowse(opts?: {
  category?: string;
  search?: string;
  sort?: "popular" | "newest" | "rating";
}) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshCategories = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: MarketplaceCategory[] }>("/marketplace/categories");
      setCategories(res.data);
    } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts?.category) params.set("category", opts.category);
      if (opts?.search) params.set("search", opts.search);
      if (opts?.sort) params.set("sort", opts.sort);

      const res = await apiFetch<{ data: MarketplaceListing[]; total: number }>(
        `/marketplace/listings?${params.toString()}`,
      );
      setListings(res.data);
      setTotal(res.total);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [opts?.category, opts?.search, opts?.sort]);

  useEffect(() => { void refreshCategories(); }, [refreshCategories]);
  useEffect(() => { void refresh(); }, [refresh]);

  return { listings, categories, total, loading, refresh };
}

// ─── Listing Detail Hook ────────────────────────────────

export function useMarketplaceListing(slug: string) {
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [listingRes, reviewsRes] = await Promise.all([
        apiFetch<{ data: { listing: MarketplaceListing } }>(`/marketplace/listings/${slug}`),
        apiFetch<{ data: MarketplaceReview[] }>(`/marketplace/listings/${slug}/reviews`),
      ]);
      setListing(listingRes.data.listing);
      setReviews(reviewsRes.data);
    } catch {
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { listing, reviews, loading, refresh };
}

// ─── Install Actions ────────────────────────────────────

export function useMarketplaceInstalls(workspaceId: string) {
  const [installs, setInstalls] = useState<MarketplaceInstall[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await apiFetch<{ data: MarketplaceInstall[] }>(
        `/workspaces/${workspaceId}/marketplace/installs`,
      );
      setInstalls(res.data);
    } catch {
      setInstalls([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const install = useCallback(
    async (listingId: string) => {
      await apiFetch(`/marketplace/listings/${listingId}/install`, {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const uninstall = useCallback(
    async (listingId: string) => {
      await apiFetch(`/marketplace/listings/${listingId}/install?workspaceId=${workspaceId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const isInstalled = useCallback(
    (listingId: string) => installs.some((i) => i.listing_id === listingId),
    [installs],
  );

  return { installs, loading, install, uninstall, isInstalled, refresh };
}

// ─── Publish Actions ────────────────────────────────────

export function useMyListings() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: MarketplaceListing[] }>("/marketplace/my-listings");
      setListings(res.data);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createListing = useCallback(
    async (data: {
      environmentId: string;
      categoryId?: string;
      title: string;
      slug: string;
      shortDesc?: string;
      longDesc?: string;
      tags?: string[];
    }) => {
      // The API wraps the listing inside `data.listing` and also returns a
      // draft `data.bundle` snapshot built at create-time. Callers only need
      // the listing record (its id is what they use to publish), so drill
      // through to it here.
      const res = await apiFetch<{ data: { listing: MarketplaceListing; bundle: unknown } }>(
        "/marketplace/listings",
        { method: "POST", body: JSON.stringify(data) },
      );
      await refresh();
      return res.data.listing;
    },
    [refresh],
  );

  const publishListing = useCallback(
    async (listingId: string) => {
      await apiFetch(`/marketplace/listings/${listingId}/publish`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  const deleteListing = useCallback(
    async (listingId: string) => {
      await apiFetch(`/marketplace/listings/${listingId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { listings, loading, createListing, publishListing, deleteListing, refresh };
}

// ─── Export / Import ────────────────────────────────────

export async function exportEnvironment(workspaceId: string, envId: string) {
  const res = await apiFetch<{ data: unknown }>(
    `/workspaces/${workspaceId}/environments/${envId}/export`,
  );
  return res.data;
}

export async function importEnvironment(workspaceId: string, bundle: unknown) {
  const res = await apiFetch<{ data: unknown }>(
    `/workspaces/${workspaceId}/environments/import`,
    { method: "POST", body: JSON.stringify(bundle) },
  );
  return res.data;
}

// ─── Project Environment ────────────────────────────────

export function useProjectEnvironment(projectId: string | undefined) {
  const [envId, setEnvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiFetch<{ data: { environment_id: string } | null }>(
        `/projects/${projectId}/environment`,
      );
      setEnvId(res.data?.environment_id ?? null);
    } catch {
      setEnvId(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setProjectEnv = useCallback(
    async (environmentId: string) => {
      if (!projectId) return;
      await apiFetch(`/projects/${projectId}/environment`, {
        method: "PUT",
        body: JSON.stringify({ environmentId }),
      });
      setEnvId(environmentId);
    },
    [projectId],
  );

  const clearProjectEnv = useCallback(async () => {
    if (!projectId) return;
    await apiFetch(`/projects/${projectId}/environment`, { method: "DELETE" });
    setEnvId(null);
  }, [projectId]);

  return { envId, loading, setProjectEnv, clearProjectEnv, refresh };
}
