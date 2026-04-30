import type postgres from "postgres";
import type { EnvironmentRow, EnvironmentWithItems } from "./environments.js";
import type { ContextSkillRow, ContextRuleRow } from "./skills.js";

// ─── Row Types ────────────────────────────────────────────

export interface MarketplaceCategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  created_at: Date;
}

export interface MarketplaceListingRow {
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
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Bundle columns (added by 052_marketplace_bundles.sql)
  bundle_format?: "doable.json.v1" | "standards.zip.v1" | null;
  bundle_size?: number | null;
  bundle_sha256?: string | null;
  manifest_summary?: Record<string, unknown> | null;
  requires_review_reason?: string | null;
}

export interface MarketplaceListingWithPublisher extends MarketplaceListingRow {
  publisher_name: string;
  publisher_avatar: string | null;
  publisher_verified?: boolean;
  category_name: string | null;
  category_slug: string | null;
  category_icon: string | null;
  // Environment summary counts (avoid loading full items for listing cards)
  skill_count: number;
  rule_count: number;
  knowledge_count: number;
  connector_count: number;
}

export interface MarketplaceInstallRow {
  id: string;
  listing_id: string;
  user_id: string;
  workspace_id: string;
  environment_id: string;
  version: string;
  installed_at: Date;
  is_modified: boolean;
}

export interface MarketplaceReviewRow {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface MarketplaceReviewWithUser extends MarketplaceReviewRow {
  user_name: string;
  user_avatar: string | null;
}

export interface ProjectEnvironmentRow {
  id: string;
  project_id: string;
  environment_id: string;
  created_at: Date;
}

// ─── Export Bundle ─────────────────────────────────────────

export interface EnvironmentBundle {
  version: "1.0.0";
  exportedAt: string;
  environment: {
    name: string;
    description: string;
    icon: string;
    color: string;
  };
  skills: { name: string; content: string; scope: string; description?: string }[];
  rules: { name: string; content: string; filePatterns: string[] }[];
  instructions: { filename: string; content: string }[];
  // Knowledge and connectors are referenced by name (not ID) for portability
  knowledgeFiles: { filename: string; content: string }[];
}

