import type postgres from "postgres";
import type { CustomDomainRow } from "../types.js";

export function customDomainQueries(sql: postgres.Sql) {
  return {
    /** Find a custom domain by its ID */
    async findById(id: string): Promise<CustomDomainRow | undefined> {
      const [row] = await sql<CustomDomainRow[]>`
        SELECT * FROM custom_domains WHERE id = ${id}
      `;
      return row;
    },

    /** Find a custom domain by its domain string (globally unique) */
    async findByDomain(domain: string): Promise<CustomDomainRow | undefined> {
      const [row] = await sql<CustomDomainRow[]>`
        SELECT * FROM custom_domains WHERE domain = ${domain}
      `;
      return row;
    },

    /** List all custom domains for a project */
    async listByProject(projectId: string): Promise<CustomDomainRow[]> {
      return sql<CustomDomainRow[]>`
        SELECT * FROM custom_domains
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      `;
    },

    /** Create a new custom domain */
    async create(data: {
      projectId: string;
      domain: string;
      cnameTarget?: string;
      createdBy: string;
    }): Promise<CustomDomainRow> {
      const [row] = await sql<CustomDomainRow[]>`
        INSERT INTO custom_domains (project_id, domain, cname_target, created_by)
        VALUES (
          ${data.projectId},
          ${data.domain},
          ${data.cnameTarget ?? "custom.doable.me"},
          ${data.createdBy}
        )
        RETURNING *
      `;
      return row!;
    },

    /** Update domain status and Cloudflare metadata */
    async updateStatus(
      id: string,
      data: {
        status?: CustomDomainRow["status"];
        cloudflareHostnameId?: string | null;
        sslStatus?: string | null;
        verificationTxtName?: string | null;
        verificationTxtValue?: string | null;
        verificationErrors?: string | null;
        lastCheckedAt?: Date;
      }
    ): Promise<CustomDomainRow | undefined> {
      const values: Record<string, unknown> = {};

      if (data.status !== undefined) values.status = data.status;
      if (data.cloudflareHostnameId !== undefined)
        values.cloudflare_hostname_id = data.cloudflareHostnameId;
      if (data.sslStatus !== undefined) values.ssl_status = data.sslStatus;
      if (data.verificationTxtName !== undefined)
        values.verification_txt_name = data.verificationTxtName;
      if (data.verificationTxtValue !== undefined)
        values.verification_txt_value = data.verificationTxtValue;
      if (data.verificationErrors !== undefined)
        values.verification_errors = data.verificationErrors;
      if (data.lastCheckedAt !== undefined)
        values.last_checked_at = data.lastCheckedAt;

      if (Object.keys(values).length === 0) return this.findById(id);

      const [row] = await sql<CustomDomainRow[]>`
        UPDATE custom_domains
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE id = ${id}
        RETURNING *
      `;
      return row;
    },

    /** Delete a custom domain */
    async deleteById(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM custom_domains WHERE id = ${id}
      `;
      return result.count > 0;
    },

    /** Find all domains needing verification polling */
    async listPending(): Promise<CustomDomainRow[]> {
      return sql<CustomDomainRow[]>`
        SELECT * FROM custom_domains
        WHERE status IN ('pending', 'verifying', 'ssl_pending')
        ORDER BY last_checked_at ASC NULLS FIRST
        LIMIT 50
      `;
    },

    /** Count domains for a project (for plan limit enforcement) */
    async countByProject(projectId: string): Promise<number> {
      const [result] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM custom_domains
        WHERE project_id = ${projectId}
      `;
      return parseInt(result!.count, 10);
    },
  };
}
