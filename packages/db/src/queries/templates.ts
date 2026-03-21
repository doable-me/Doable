import type postgres from "postgres";
import type { TemplateRow } from "../types.js";

export function templateQueries(sql: postgres.Sql) {
  return {
    /**
     * List all templates, optionally filtered by category.
     */
    async listTemplates(opts?: {
      category?: string;
      page?: number;
      pageSize?: number;
      officialOnly?: boolean;
    }): Promise<{ rows: TemplateRow[]; total: number }> {
      const page = opts?.page ?? 1;
      const pageSize = opts?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const categoryFilter = opts?.category
        ? sql`AND category = ${opts.category}`
        : sql``;

      const officialFilter = opts?.officialOnly
        ? sql`AND is_official = true`
        : sql``;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM templates
        WHERE 1=1
          ${categoryFilter}
          ${officialFilter}
      `;

      const rows = await sql<TemplateRow[]>`
        SELECT * FROM templates
        WHERE 1=1
          ${categoryFilter}
          ${officialFilter}
        ORDER BY usage_count DESC, created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    /**
     * Get a single template by ID.
     */
    async getTemplate(id: string): Promise<TemplateRow | undefined> {
      const [template] = await sql<TemplateRow[]>`
        SELECT * FROM templates WHERE id = ${id}
      `;
      return template;
    },

    /**
     * Increment the usage count for a template.
     */
    async incrementUsageCount(id: string): Promise<void> {
      await sql`
        UPDATE templates
        SET usage_count = usage_count + 1
        WHERE id = ${id}
      `;
    },

    /**
     * Create a new template (for user-submitted templates).
     */
    async createTemplate(data: {
      name: string;
      description?: string;
      category?: string;
      codeFiles?: Record<string, unknown>;
      doableContext?: Record<string, unknown>;
      previewImageUrl?: string;
      createdBy: string;
    }): Promise<TemplateRow> {
      const [template] = await sql<TemplateRow[]>`
        INSERT INTO templates (
          name, description, category, code_files,
          doable_context, preview_image_url, is_official, created_by
        )
        VALUES (
          ${data.name},
          ${data.description ?? null},
          ${data.category ?? null},
          ${data.codeFiles ? sql.json(data.codeFiles as postgres.JSONValue) : null},
          ${data.doableContext ? sql.json(data.doableContext as postgres.JSONValue) : null},
          ${data.previewImageUrl ?? null},
          false,
          ${data.createdBy}
        )
        RETURNING *
      `;
      return template!;
    },

    /**
     * List unique template categories.
     */
    async listCategories(): Promise<string[]> {
      const rows = await sql<{ category: string }[]>`
        SELECT DISTINCT category FROM templates
        WHERE category IS NOT NULL
        ORDER BY category ASC
      `;
      return rows.map((r) => r.category);
    },
  };
}
