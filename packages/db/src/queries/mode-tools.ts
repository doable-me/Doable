import type postgres from "postgres";

export interface ModeToolConfig {
  mode: string;
  allowed_tools: string[];
  description: string | null;
  updated_by: string | null;
  updated_at: Date;
}

export function modeToolQueries(sql: postgres.Sql) {
  return {
    async list(): Promise<ModeToolConfig[]> {
      return sql<ModeToolConfig[]>`
        SELECT mode, allowed_tools, description, updated_by, updated_at
        FROM mode_tool_config
        ORDER BY mode ASC
      `;
    },

    async get(mode: string): Promise<ModeToolConfig | null> {
      const [row] = await sql<ModeToolConfig[]>`
        SELECT mode, allowed_tools, description, updated_by, updated_at
        FROM mode_tool_config
        WHERE mode = ${mode}
      `;
      return row ?? null;
    },

    async upsert(data: {
      mode: string;
      allowedTools: string[];
      description?: string | null;
      updatedBy: string;
    }): Promise<ModeToolConfig> {
      const [row] = await sql<ModeToolConfig[]>`
        INSERT INTO mode_tool_config (mode, allowed_tools, description, updated_by, updated_at)
        VALUES (${data.mode}, ${data.allowedTools}, ${data.description ?? null}, ${data.updatedBy}, now())
        ON CONFLICT (mode) DO UPDATE SET
          allowed_tools = EXCLUDED.allowed_tools,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async remove(mode: string): Promise<boolean> {
      const result = await sql`DELETE FROM mode_tool_config WHERE mode = ${mode}`;
      return result.count > 0;
    },

    async getAllowedTools(mode: string): Promise<string[] | null> {
      const [row] = await sql<{ allowed_tools: string[] }[]>`
        SELECT allowed_tools FROM mode_tool_config WHERE mode = ${mode}
      `;
      return row?.allowed_tools ?? null;
    },
  };
}
