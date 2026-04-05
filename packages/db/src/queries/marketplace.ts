import type postgres from "postgres";
import type { EnvironmentRow, EnvironmentWithItems } from "./environments.js";
import type { ContextSkillRow, ContextRuleRow } from "./skills.js";
import type { WorkspaceContextFileRow } from "./context.js";

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
}

export interface MarketplaceListingWithPublisher extends MarketplaceListingRow {
  publisher_name: string;
  publisher_avatar: string | null;
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
  skills: { name: string; content: string; scope: string }[];
  rules: { name: string; content: string; filePatterns: string[] }[];
  instructions: { filename: string; content: string }[];
  // Knowledge and connectors are referenced by name (not ID) for portability
  knowledgeFiles: { filename: string; content: string }[];
}

// ─── Queries ──────────────────────────────────────────────

export function marketplaceQueries(sql: postgres.Sql) {
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

    // ── Reviews ──

    async listReviews(listingId: string): Promise<MarketplaceReviewWithUser[]> {
      return sql<MarketplaceReviewWithUser[]>`
        SELECT r.*, u.display_name AS user_name, u.avatar_url AS user_avatar
        FROM marketplace_reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.listing_id = ${listingId}
        ORDER BY r.created_at DESC
      `;
    },

    async addReview(data: {
      listingId: string;
      userId: string;
      rating: number;
      title?: string;
      body?: string;
    }): Promise<MarketplaceReviewRow> {
      const [row] = await sql<MarketplaceReviewRow[]>`
        INSERT INTO marketplace_reviews (listing_id, user_id, rating, title, body)
        VALUES (${data.listingId}, ${data.userId}, ${data.rating}, ${data.title ?? ""}, ${data.body ?? ""})
        ON CONFLICT (listing_id, user_id) DO UPDATE SET
          rating = excluded.rating,
          title = excluded.title,
          body = excluded.body,
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async deleteReview(listingId: string, userId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM marketplace_reviews
        WHERE listing_id = ${listingId} AND user_id = ${userId}
      `;
      return result.count > 0;
    },

    // ── Per-Project Environments ──

    async getProjectEnvironment(projectId: string): Promise<ProjectEnvironmentRow | null> {
      const [row] = await sql<ProjectEnvironmentRow[]>`
        SELECT * FROM project_environments WHERE project_id = ${projectId}
      `;
      return row ?? null;
    },

    async setProjectEnvironment(projectId: string, environmentId: string): Promise<ProjectEnvironmentRow> {
      const [row] = await sql<ProjectEnvironmentRow[]>`
        INSERT INTO project_environments (project_id, environment_id)
        VALUES (${projectId}, ${environmentId})
        ON CONFLICT (project_id) DO UPDATE SET
          environment_id = excluded.environment_id,
          created_at = now()
        RETURNING *
      `;
      return row!;
    },

    async clearProjectEnvironment(projectId: string): Promise<boolean> {
      const result = await sql`DELETE FROM project_environments WHERE project_id = ${projectId}`;
      return result.count > 0;
    },

    // ── Effective Environment Resolution ──
    // Priority: project env > workspace default env > virtual default (all items)

    async resolveEffectiveEnvironment(
      workspaceId: string,
      projectId?: string,
    ): Promise<{ environment: EnvironmentWithItems | null; source: "project" | "workspace" | "default" }> {
      // Import the environments query module — needed for getById / getDefaultItems
      // This is called at runtime, so lazy resolution works without circular deps.
      const { environmentQueries } = await import("./environments.js");
      const envDb = environmentQueries(sql);

      // 1. Check project-level override
      if (projectId) {
        const projEnv = await this.getProjectEnvironment(projectId);
        if (projEnv) {
          const env = await envDb.getById(projEnv.environment_id);
          if (env) return { environment: env, source: "project" };
        }
      }

      // 2. Check workspace default
      const wsDefault = await envDb.getDefault(workspaceId);
      if (wsDefault) {
        const env = await envDb.getById(wsDefault.id);
        if (env) return { environment: env, source: "workspace" };
      }

      // 3. Virtual default — null environment, caller uses all workspace items
      return { environment: null, source: "default" };
    },

    // ── Export / Import ──

    async buildExportBundle(environmentId: string): Promise<EnvironmentBundle | null> {
      const { environmentQueries } = await import("./environments.js");
      const envDb = environmentQueries(sql);
      const env = await envDb.getById(environmentId);
      if (!env) return null;

      return {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        environment: {
          name: env.name,
          description: env.description,
          icon: env.icon,
          color: env.color,
        },
        skills: env.skills.map((s) => ({
          name: s.skill_name,
          content: s.skill_content,
          scope: s.scope ?? "workspace",
        })),
        rules: env.rules.map((r) => ({
          name: r.rule_name,
          content: r.content,
          filePatterns: r.file_patterns ?? [],
        })),
        instructions: env.instructions.map((i) => ({
          filename: i.filename,
          content: i.content,
        })),
        knowledgeFiles: env.knowledge.map((k) => ({
          filename: k.filename,
          content: k.content,
        })),
      };
    },

    async importBundle(
      workspaceId: string,
      userId: string,
      bundle: EnvironmentBundle,
    ): Promise<EnvironmentRow> {
      const { environmentQueries } = await import("./environments.js");
      const { skillsQueries } = await import("./skills.js");
      const { contextQueries } = await import("./context.js");
      const envDb = environmentQueries(sql);
      const skillDb = skillsQueries(sql);
      const ctxDb = contextQueries(sql);

      // 1. Create the environment
      const env = await envDb.create({
        workspaceId,
        createdBy: userId,
        name: bundle.environment.name,
        description: bundle.environment.description,
        icon: bundle.environment.icon,
        color: bundle.environment.color,
      });

      // 2. Import skills — create workspace-scoped skills and ref them
      for (const skill of bundle.skills) {
        const created = await skillDb.createSkill({
          workspaceId,
          scope: "workspace",
          skillName: skill.name,
          skillContent: skill.content,
        });
        await envDb.addSkillRef(env.id, created.id);
      }

      // 3. Import rules — create workspace-scoped rules and ref them
      for (const rule of bundle.rules) {
        const created = await skillDb.createRule({
          workspaceId,
          scope: "workspace",
          ruleName: rule.name,
          content: rule.content,
          filePatterns: rule.filePatterns,
        });
        await envDb.addRuleRef(env.id, created.id);
      }

      // 4. Import instructions (snapshot — direct copy)
      for (const instr of bundle.instructions) {
        await envDb.addInstruction(env.id, instr.filename, instr.content);
      }

      // 5. Import knowledge files — upsert workspace_context_files and ref them
      for (const kf of bundle.knowledgeFiles) {
        const existing = await ctxDb.getWorkspaceContextFile(workspaceId, kf.filename);
        if (existing) {
          await envDb.addContextRef(env.id, existing.id);
        } else {
          const created = await ctxDb.upsertWorkspaceContext(workspaceId, kf.filename, kf.content);
          await envDb.addContextRef(env.id, created.id);
        }
      }

      return env;
    },
  };
}
