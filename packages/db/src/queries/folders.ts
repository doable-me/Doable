import type postgres from "postgres";
import type { FolderRow } from "../types.js";

export function folderQueries(sql: postgres.Sql) {
  return {
    async findById(id: string): Promise<FolderRow | undefined> {
      const [folder] = await sql<FolderRow[]>`
        SELECT * FROM folders WHERE id = ${id}
      `;
      return folder;
    },

    async listByWorkspace(workspaceId: string): Promise<FolderRow[]> {
      return sql<FolderRow[]>`
        SELECT * FROM folders
        WHERE workspace_id = ${workspaceId}
        ORDER BY position ASC, name ASC
      `;
    },

    async listChildren(parentId: string): Promise<FolderRow[]> {
      return sql<FolderRow[]>`
        SELECT * FROM folders
        WHERE parent_id = ${parentId}
        ORDER BY position ASC, name ASC
      `;
    },

    async create(data: {
      workspaceId: string;
      name: string;
      parentId?: string;
      position?: number;
    }): Promise<FolderRow> {
      const [folder] = await sql<FolderRow[]>`
        INSERT INTO folders (workspace_id, name, parent_id, position)
        VALUES (
          ${data.workspaceId},
          ${data.name},
          ${data.parentId ?? null},
          ${data.position ?? 0}
        )
        RETURNING *
      `;
      return folder!;
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        parentId: string | null;
        position: number;
      }>
    ): Promise<FolderRow | undefined> {
      const values: Record<string, unknown> = {};

      if (data.name !== undefined) values.name = data.name;
      if (data.parentId !== undefined) values.parent_id = data.parentId;
      if (data.position !== undefined) values.position = data.position;

      if (Object.keys(values).length === 0) return this.findById(id);

      const [folder] = await sql<FolderRow[]>`
        UPDATE folders
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE id = ${id}
        RETURNING *
      `;
      return folder;
    },

    async delete(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM folders WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
