import type postgres from "postgres";
import type { MarketplaceReviewRow, MarketplaceReviewWithUser, ProjectEnvironmentRow, EnvironmentBundle } from "./marketplace-types.js";
import type { EnvironmentRow, EnvironmentWithItems } from "./environments-types.js";

export function marketplaceExtraQueries(sql: postgres.Sql) {
  return {
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
          description: (s as { description?: string }).description ?? "",
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
      const envDb = environmentQueries(sql);
      const skillDb = skillsQueries(sql);

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
          description: skill.description ?? "",
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

      // 5. Import knowledge files — directly into environment_knowledge
      for (const kf of bundle.knowledgeFiles) {
        await envDb.upsertKnowledge(env.id, kf.filename, kf.content);
      }

      return env;
    },
  };
}