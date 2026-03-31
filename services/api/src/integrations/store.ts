import { sql } from "../db/index.js";

/**
 * PostgreSQL-backed key-value store for integration actions.
 * Implements the Activepieces Store interface required by ActionContext.
 * Uses the integration_store table.
 */
export class PostgresStore {
  constructor(
    private userId: string,
    private workspaceId: string,
  ) {}

  async put<T>(key: string, value: T, scope?: string): Promise<T> {
    const scopeKey = this.buildKey(key, scope);
    await sql`
      INSERT INTO integration_store (scope_key, value, workspace_id, user_id, updated_at)
      VALUES (${scopeKey}, ${JSON.stringify(value)}, ${this.workspaceId}, ${this.userId}, now())
      ON CONFLICT (scope_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
    return value;
  }

  async get<T>(key: string, scope?: string): Promise<T | null> {
    const scopeKey = this.buildKey(key, scope);
    const [row] = await sql`
      SELECT value FROM integration_store WHERE scope_key = ${scopeKey}
    `;
    return row ? (row.value as T) : null;
  }

  async delete(key: string, scope?: string): Promise<void> {
    const scopeKey = this.buildKey(key, scope);
    await sql`DELETE FROM integration_store WHERE scope_key = ${scopeKey}`;
  }

  private buildKey(key: string, scope?: string): string {
    // StoreScope.FLOW = "FLOW", StoreScope.PROJECT = "PROJECT"
    const prefix = scope === "FLOW"
      ? `flow:${this.userId}`
      : `project:${this.workspaceId}`;
    return `${prefix}:${key}`;
  }
}
