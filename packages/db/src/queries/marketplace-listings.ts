import type postgres from "postgres";
import type { MarketplaceCategoryRow, MarketplaceListingRow, MarketplaceListingWithPublisher, MarketplaceInstallRow } from "./marketplace-types.js";

export function marketplaceListingQueries(sql: postgres.Sql) {
  return {
    // ── Categories ──

    async listCategories(): Promise<MarketplaceCategoryRow[]> {
      return sql<MarketplaceCategoryRow[]>`
        SELECT * FROM marketplace_categories ORDER BY sort_order, name
      `;
    },

    // ── Listings: Browse / Search ──

    async browseListings(opts?: {
      categorySlug?: string;
      search?: string;
      tags?: string[];
      featured?: boolean;
      sort?: "popular" | "newest" | "rating";
      limit?: number;
      offset?: number;
    }): Promise<{ data: MarketplaceListingWithPublisher[]; total: number }> {
      const limit = Math.min(opts?.limit ?? 24, 100);
      const offset = opts?.offset ?? 0;

      // Build dynamic WHERE clauses
      const whereFragments: postgres.PendingQuery<postgres.Row[]>[] = [
        sql`ml.status = 'published'`,
      ];

      if (opts?.categorySlug) {
        whereFragments.push(sql`mc.slug = ${opts.categorySlug}`);
      }
      if (opts?.featured) {
        whereFragments.push(sql`ml.featured = true`);
      }
      if (opts?.tags?.length) {
        whereFragments.push(sql`ml.tags && ${opts.tags}`);
      }
      if (opts?.search) {
        const q = `%${opts.search}%`;
        whereFragments.push(
          sql`(ml.title ILIKE ${q} OR ml.short_desc ILIKE ${q} OR ml.long_desc ILIKE ${q})`,
        );
      }

      const where = whereFragments.reduce((a, b) => sql`${a} AND ${b}`);

      const orderBy =
        opts?.sort === "newest"
          ? sql`ml.published_at DESC NULLS LAST`
          : opts?.sort === "rating"
            ? sql`ml.avg_rating DESC, ml.review_count DESC`
            : sql`ml.install_count DESC, ml.avg_rating DESC`;

      const rows = await sql<MarketplaceListingWithPublisher[]>`
        SELECT
          ml.*,
          u.display_name AS publisher_name,
          u.avatar_url   AS publisher_avatar,
          COALESCE(u.is_verified_publisher, false) AS publisher_verified,
          mc.name        AS category_name,
          mc.slug        AS category_slug,
          mc.icon        AS category_icon,
          COALESCE(sc.skill_count, 0)::int       AS skill_count,
          COALESCE(rc.rule_count, 0)::int         AS rule_count,
          COALESCE(kc.knowledge_count, 0)::int    AS knowledge_count,
          COALESCE(cc.connector_count, 0)::int    AS connector_count
        FROM marketplace_listings ml
        JOIN users u ON u.id = ml.publisher_id
        LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS skill_count FROM environment_skill_refs WHERE environment_id = ml.environment_id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS rule_count FROM environment_rule_refs WHERE environment_id = ml.environment_id
        ) rc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS knowledge_count FROM environment_context_refs WHERE environment_id = ml.environment_id
        ) kc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS connector_count FROM environment_connector_refs WHERE environment_id = ml.environment_id
        ) cc ON true
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const [{ count }] = await sql<[{ count: string }]>`
        SELECT COUNT(*) AS count
        FROM marketplace_listings ml
        LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
        WHERE ${where}
      `;

      return { data: rows, total: parseInt(count, 10) };
    },

    async getListingBySlug(slug: string): Promise<MarketplaceListingWithPublisher | null> {
      const [row] = await sql<MarketplaceListingWithPublisher[]>`
        SELECT
          ml.*,
          u.display_name AS publisher_name,
          u.avatar_url   AS publisher_avatar,
          COALESCE(u.is_verified_publisher, false) AS publisher_verified,
          mc.name        AS category_name,
          mc.slug        AS category_slug,
          mc.icon        AS category_icon,
          COALESCE(sc.skill_count, 0)::int       AS skill_count,
          COALESCE(rc.rule_count, 0)::int         AS rule_count,
          COALESCE(kc.knowledge_count, 0)::int    AS knowledge_count,
          COALESCE(cc.connector_count, 0)::int    AS connector_count
        FROM marketplace_listings ml
        JOIN users u ON u.id = ml.publisher_id
        LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS skill_count FROM environment_skill_refs WHERE environment_id = ml.environment_id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS rule_count FROM environment_rule_refs WHERE environment_id = ml.environment_id
        ) rc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS knowledge_count FROM environment_context_refs WHERE environment_id = ml.environment_id
        ) kc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS connector_count FROM environment_connector_refs WHERE environment_id = ml.environment_id
        ) cc ON true
        WHERE ml.slug = ${slug}
      `;
      return row ?? null;
    },

    async getListingById(id: string): Promise<MarketplaceListingWithPublisher | null> {
      const [row] = await sql<MarketplaceListingWithPublisher[]>`
        SELECT
          ml.*,
          u.display_name AS publisher_name,
          u.avatar_url   AS publisher_avatar,
          COALESCE(u.is_verified_publisher, false) AS publisher_verified,
          mc.name        AS category_name,
          mc.slug        AS category_slug,
          mc.icon        AS category_icon,
          COALESCE(sc.skill_count, 0)::int       AS skill_count,
          COALESCE(rc.rule_count, 0)::int         AS rule_count,
          COALESCE(kc.knowledge_count, 0)::int    AS knowledge_count,
          COALESCE(cc.connector_count, 0)::int    AS connector_count
        FROM marketplace_listings ml
        JOIN users u ON u.id = ml.publisher_id
        LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS skill_count FROM environment_skill_refs WHERE environment_id = ml.environment_id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS rule_count FROM environment_rule_refs WHERE environment_id = ml.environment_id
        ) rc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS knowledge_count FROM environment_context_refs WHERE environment_id = ml.environment_id
        ) kc ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS connector_count FROM environment_connector_refs WHERE environment_id = ml.environment_id
        ) cc ON true
        WHERE ml.id = ${id}
      `;
      return row ?? null;
    },

    // ── Listings: Publish / Manage ──

    async createListing(data: {
      environmentId: string;
      publisherId: string;
      categoryId?: string;
      title: string;
      slug: string;
      shortDesc?: string;
      longDesc?: string;
      tags?: string[];
      version?: string;
    }): Promise<MarketplaceListingRow> {
      const [row] = await sql<MarketplaceListingRow[]>`
        INSERT INTO marketplace_listings
          (environment_id, publisher_id, category_id, title, slug, short_desc, long_desc, tags, version)
        VALUES (
          ${data.environmentId},
          ${data.publisherId},
          ${data.categoryId ?? null},
          ${data.title},
          ${data.slug},
          ${data.shortDesc ?? ""},
          ${data.longDesc ?? ""},
          ${data.tags ?? []},
          ${data.version ?? "1.0.0"}
        )
        RETURNING *
      `;
      return row!;
    },

    async updateListing(
      id: string,
      data: {
        categoryId?: string | null;
        title?: string;
        shortDesc?: string;
        longDesc?: string;
        tags?: string[];
        version?: string;
        changelog?: string;
        status?: MarketplaceListingRow["status"];
        featured?: boolean;
      },
    ): Promise<MarketplaceListingRow | null> {
      const [row] = await sql<MarketplaceListingRow[]>`
        UPDATE marketplace_listings SET
          category_id = COALESCE(${data.categoryId ?? null}, category_id),
          title       = COALESCE(${data.title ?? null}, title),
          short_desc  = COALESCE(${data.shortDesc ?? null}, short_desc),
          long_desc   = COALESCE(${data.longDesc ?? null}, long_desc),
          tags        = COALESCE(${data.tags ?? null}, tags),
          version     = COALESCE(${data.version ?? null}, version),
          changelog   = COALESCE(${data.changelog ?? null}, changelog),
          status      = COALESCE(${data.status ?? null}, status),
          featured    = COALESCE(${data.featured ?? null}, featured),
          published_at = CASE
            WHEN ${data.status ?? null} = 'published' AND published_at IS NULL THEN now()
            ELSE published_at
          END,
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async deleteListing(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM marketplace_listings WHERE id = ${id}`;
      return result.count > 0;
    },

    async listMyListings(publisherId: string): Promise<MarketplaceListingRow[]> {
      return sql<MarketplaceListingRow[]>`
        SELECT * FROM marketplace_listings
        WHERE publisher_id = ${publisherId}
        ORDER BY updated_at DESC
      `;
    },

    // ── Installs ──

    async installListing(data: {
      listingId: string;
      userId: string;
      workspaceId: string;
      environmentId: string;
      version: string;
    }): Promise<MarketplaceInstallRow> {
      const [row] = await sql<MarketplaceInstallRow[]>`
        INSERT INTO marketplace_installs (listing_id, user_id, workspace_id, environment_id, version)
        VALUES (${data.listingId}, ${data.userId}, ${data.workspaceId}, ${data.environmentId}, ${data.version})
        ON CONFLICT (listing_id, workspace_id) DO UPDATE SET
          environment_id = excluded.environment_id,
          version = excluded.version,
          installed_at = now(),
          is_modified = false
        RETURNING *
      `;
      // Bump install count
      await sql`
        UPDATE marketplace_listings
        SET install_count = install_count + 1
        WHERE id = ${data.listingId}
      `;
      return row!;
    },

    async uninstall(listingId: string, workspaceId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM marketplace_installs
        WHERE listing_id = ${listingId} AND workspace_id = ${workspaceId}
      `;
      return result.count > 0;
    },

    async getInstall(listingId: string, workspaceId: string): Promise<MarketplaceInstallRow | null> {
      const [row] = await sql<MarketplaceInstallRow[]>`
        SELECT * FROM marketplace_installs
        WHERE listing_id = ${listingId} AND workspace_id = ${workspaceId}
      `;
      return row ?? null;
    },

    async listInstallsForWorkspace(workspaceId: string): Promise<(MarketplaceInstallRow & { listing_title: string })[]> {
      return sql<(MarketplaceInstallRow & { listing_title: string })[]>`
        SELECT mi.*, ml.title AS listing_title
        FROM marketplace_installs mi
        JOIN marketplace_listings ml ON ml.id = mi.listing_id
        WHERE mi.workspace_id = ${workspaceId}
        ORDER BY mi.installed_at DESC
      `;
    },
  };
}