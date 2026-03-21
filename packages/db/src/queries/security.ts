import type postgres from "postgres";
import type { SecurityScanRow, SecurityFindingRow, PasswordResetTokenRow } from "../types.js";

export function securityQueries(sql: postgres.Sql) {
  return {
    // ─── Security Scans ────────────────────────────────────────

    async createScan(data: {
      projectId: string;
      scanType: string;
    }): Promise<SecurityScanRow> {
      const [scan] = await sql<SecurityScanRow[]>`
        INSERT INTO security_scans (project_id, scan_type, status, started_at)
        VALUES (${data.projectId}, ${data.scanType}, 'running', now())
        RETURNING *
      `;
      return scan!;
    },

    async completeScan(
      scanId: string,
      findingsCount: number
    ): Promise<SecurityScanRow | undefined> {
      const [scan] = await sql<SecurityScanRow[]>`
        UPDATE security_scans
        SET status = 'completed',
            findings_count = ${findingsCount},
            completed_at = now()
        WHERE id = ${scanId}
        RETURNING *
      `;
      return scan;
    },

    async failScan(scanId: string): Promise<SecurityScanRow | undefined> {
      const [scan] = await sql<SecurityScanRow[]>`
        UPDATE security_scans
        SET status = 'failed', completed_at = now()
        WHERE id = ${scanId}
        RETURNING *
      `;
      return scan;
    },

    async getLatestScan(
      projectId: string
    ): Promise<SecurityScanRow | undefined> {
      const [scan] = await sql<SecurityScanRow[]>`
        SELECT * FROM security_scans
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return scan;
    },

    // ─── Security Findings ─────────────────────────────────────

    async createFinding(data: {
      scanId: string;
      severity: string;
      category: string;
      title: string;
      description?: string;
      filePath?: string;
      lineNumber?: number;
      codeSnippet?: string;
      fixSuggestion?: string;
    }): Promise<SecurityFindingRow> {
      const [finding] = await sql<SecurityFindingRow[]>`
        INSERT INTO security_findings (
          scan_id, severity, category, title, description,
          file_path, line_number, code_snippet, fix_suggestion
        )
        VALUES (
          ${data.scanId}, ${data.severity}, ${data.category}, ${data.title},
          ${data.description ?? null}, ${data.filePath ?? null},
          ${data.lineNumber ?? null}, ${data.codeSnippet ?? null},
          ${data.fixSuggestion ?? null}
        )
        RETURNING *
      `;
      return finding!;
    },

    async createFindings(
      findings: Array<{
        scanId: string;
        severity: string;
        category: string;
        title: string;
        description?: string;
        filePath?: string;
        lineNumber?: number;
        codeSnippet?: string;
        fixSuggestion?: string;
      }>
    ): Promise<SecurityFindingRow[]> {
      if (findings.length === 0) return [];
      const rows = findings.map((f) => ({
        scan_id: f.scanId,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description ?? null,
        file_path: f.filePath ?? null,
        line_number: f.lineNumber ?? null,
        code_snippet: f.codeSnippet ?? null,
        fix_suggestion: f.fixSuggestion ?? null,
      }));
      return await sql<SecurityFindingRow[]>`
        INSERT INTO security_findings ${sql(
          rows as readonly Record<string, unknown>[],
          "scan_id",
          "severity",
          "category",
          "title",
          "description",
          "file_path",
          "line_number",
          "code_snippet",
          "fix_suggestion"
        )}
        RETURNING *
      `;
    },

    async getFindingsForScan(scanId: string): Promise<SecurityFindingRow[]> {
      return sql<SecurityFindingRow[]>`
        SELECT * FROM security_findings
        WHERE scan_id = ${scanId}
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
          END,
          created_at ASC
      `;
    },

    async getLatestFindings(projectId: string): Promise<SecurityFindingRow[]> {
      return sql<SecurityFindingRow[]>`
        SELECT f.* FROM security_findings f
        JOIN security_scans s ON s.id = f.scan_id
        WHERE s.project_id = ${projectId}
          AND s.status = 'completed'
        ORDER BY s.created_at DESC,
          CASE f.severity
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
          END,
          f.created_at ASC
        LIMIT 200
      `;
    },

    async dismissFinding(
      findingId: string,
      userId: string
    ): Promise<SecurityFindingRow | undefined> {
      const [finding] = await sql<SecurityFindingRow[]>`
        UPDATE security_findings
        SET dismissed = true, dismissed_by = ${userId}
        WHERE id = ${findingId}
        RETURNING *
      `;
      return finding;
    },

    // ─── Password Reset Tokens ─────────────────────────────────

    async createPasswordResetToken(data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }): Promise<PasswordResetTokenRow> {
      // Invalidate any existing unused tokens for this user
      await sql`
        DELETE FROM password_reset_tokens
        WHERE user_id = ${data.userId} AND used_at IS NULL
      `;
      const [token] = await sql<PasswordResetTokenRow[]>`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (${data.userId}, ${data.tokenHash}, ${data.expiresAt})
        RETURNING *
      `;
      return token!;
    },

    async findValidResetToken(
      tokenHash: string
    ): Promise<PasswordResetTokenRow | undefined> {
      const [token] = await sql<PasswordResetTokenRow[]>`
        SELECT * FROM password_reset_tokens
        WHERE token_hash = ${tokenHash}
          AND expires_at > now()
          AND used_at IS NULL
      `;
      return token;
    },

    async markResetTokenUsed(tokenHash: string): Promise<void> {
      await sql`
        UPDATE password_reset_tokens
        SET used_at = now()
        WHERE token_hash = ${tokenHash}
      `;
    },
  };
}
