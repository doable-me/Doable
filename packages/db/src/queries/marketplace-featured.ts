import type postgres from "postgres";
import type { MarketplaceListingWithPublisher } from "./marketplace-types.js";

/**
 * Reads from the materialised views built in 055_search_indexes.sql.
 * These views are denormalised (publisher + category + composition counts
 * pre-joined) so the public landing strips never join at request time.
 *
 * Refresh cadence: every ~5 minutes via {@link refreshMarketplaceFeatured}.
 */

export interface DiscoverFeaturedRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  thumbnail_url: string | null;
  view_count: number;
  remix_count: number;
  featured: boolean;
  published_at: Date | null;
  updated_at: Date | null;
  shared_by: string | null;
  featured_at: Date | null;
  shared_by_name: string | null;
  shared_by_avatar: string | null;
}

export function marketplaceFeaturedQueries(sql: postgres.Sql) {
  return {
    async listFeaturedListings(limit = 12): Promise<MarketplaceListingWithPublisher[]> {
      return sql<MarketplaceListingWithPublisher[]>`
        SELECT * FROM mv_marketplace_featured
        ORDER BY install_count DESC, avg_rating DESC
        LIMIT ${Math.min(limit, 50)}
      `;
    },

    async listFeaturedDiscover(limit = 12): Promise<DiscoverFeaturedRow[]> {
      return sql<DiscoverFeaturedRow[]>`
        SELECT * FROM mv_discover_featured
        ORDER BY view_count DESC, remix_count DESC
        LIMIT ${Math.min(limit, 50)}
      `;
    },

    async refreshMarketplaceFeatured(): Promise<void> {
      await sql`SELECT refresh_marketplace_featured()`;
    },

    async refreshDiscoverFeatured(): Promise<void> {
      await sql`SELECT refresh_discover_featured()`;
    },
  };
}
