import type postgres from "postgres";

/**
 * Moderation surface for the marketplace. Three streams live here:
 *
 *  - queue items (one per listing/version awaiting review)
 *  - user reports (community-filed concerns about a listing)
 *  - admin action log (append-only audit trail)
 *
 * Pattern-wise we mirror the rest of the marketplace queries module so
 * that consumers can `marketplaceQueries(sql)` and get everything.
 */

export type ModerationStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ReportReason = "spam" | "malware" | "broken" | "inappropriate" | "copyright" | "other";
export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";
export type AdminAction =
  | "approve"
  | "reject"
  | "unpublish"
  | "restore"
  | "verify_publisher"
  | "unverify_publisher";

export interface ModerationQueueRow {
  id: string;
  listing_id: string;
  version: string;
  reason: string;
  manifest_summary: Record<string, unknown> | null;
  status: ModerationStatus;
  submitted_by: string;
  submitted_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface ModerationQueueRowEnriched extends ModerationQueueRow {
  listing_title: string;
  listing_slug: string;
  publisher_name: string;
}

export interface MarketplaceReportRow {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
}

export interface MarketplaceReportRowEnriched extends MarketplaceReportRow {
  listing_title: string;
  listing_slug: string;
  reporter_name: string;
}

export interface AdminActionRow {
  id: string;
  listing_id: string;
  admin_id: string;
  action: AdminAction;
  note: string | null;
  created_at: Date;
}

export function marketplaceModerationQueries(sql: postgres.Sql) {
  return {
    // ── Queue ──

    async enqueueReview(data: {
      listingId: string;
      version: string;
      reason: string;
      manifestSummary?: Record<string, unknown>;
      submittedBy: string;
    }): Promise<ModerationQueueRow> {
      const [row] = await sql<ModerationQueueRow[]>`
        INSERT INTO marketplace_moderation_queue
          (listing_id, version, reason, manifest_summary, submitted_by)
        VALUES (
          ${data.listingId},
          ${data.version},
          ${data.reason},
          ${data.manifestSummary ? sql.json(data.manifestSummary as unknown as postgres.JSONValue) : null},
          ${data.submittedBy}
        )
        ON CONFLICT (listing_id, version) DO UPDATE SET
          reason = excluded.reason,
          manifest_summary = excluded.manifest_summary,
          status = 'pending',
          submitted_by = excluded.submitted_by,
          submitted_at = now(),
          resolved_at = NULL,
          resolved_by = NULL,
          resolution_note = NULL
        RETURNING *
      `;
      return row!;
    },

    async listQueue(opts?: {
      status?: ModerationStatus;
      limit?: number;
      offset?: number;
    }): Promise<{ data: ModerationQueueRowEnriched[]; total: number }> {
      const limit = Math.min(opts?.limit ?? 50, 200);
      const offset = opts?.offset ?? 0;
      const status = opts?.status ?? "pending";

      const rows = await sql<ModerationQueueRowEnriched[]>`
        SELECT q.*,
               l.title AS listing_title,
               l.slug AS listing_slug,
               u.display_name AS publisher_name
        FROM marketplace_moderation_queue q
        JOIN marketplace_listings l ON l.id = q.listing_id
        JOIN users u ON u.id = l.publisher_id
        WHERE q.status = ${status}
        ORDER BY q.submitted_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ count }] = await sql<[{ count: string }]>`
        SELECT COUNT(*) AS count
        FROM marketplace_moderation_queue
        WHERE status = ${status}
      `;
      return { data: rows, total: parseInt(count, 10) };
    },

    async getQueueItem(id: string): Promise<ModerationQueueRow | null> {
      const [row] = await sql<ModerationQueueRow[]>`
        SELECT * FROM marketplace_moderation_queue WHERE id = ${id}
      `;
      return row ?? null;
    },

    async resolveQueueItem(
      id: string,
      data: { status: "approved" | "rejected" | "withdrawn"; resolvedBy: string; note?: string },
    ): Promise<ModerationQueueRow | null> {
      const [row] = await sql<ModerationQueueRow[]>`
        UPDATE marketplace_moderation_queue
           SET status = ${data.status},
               resolved_at = now(),
               resolved_by = ${data.resolvedBy},
               resolution_note = ${data.note ?? null}
         WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    // ── Reports ──

    async fileReport(data: {
      listingId: string;
      reporterId: string;
      reason: ReportReason;
      detail?: string;
    }): Promise<MarketplaceReportRow> {
      const [row] = await sql<MarketplaceReportRow[]>`
        INSERT INTO marketplace_reports (listing_id, reporter_id, reason, detail)
        VALUES (${data.listingId}, ${data.reporterId}, ${data.reason}, ${data.detail ?? null})
        ON CONFLICT (listing_id, reporter_id, reason) DO UPDATE SET
          detail = excluded.detail,
          status = 'open',
          created_at = now()
        RETURNING *
      `;
      return row!;
    },

    async listReports(opts?: {
      status?: ReportStatus;
      limit?: number;
      offset?: number;
    }): Promise<{ data: MarketplaceReportRowEnriched[]; total: number }> {
      const limit = Math.min(opts?.limit ?? 50, 200);
      const offset = opts?.offset ?? 0;
      const status = opts?.status ?? "open";

      const rows = await sql<MarketplaceReportRowEnriched[]>`
        SELECT r.*,
               l.title AS listing_title,
               l.slug AS listing_slug,
               u.display_name AS reporter_name
        FROM marketplace_reports r
        JOIN marketplace_listings l ON l.id = r.listing_id
        JOIN users u ON u.id = r.reporter_id
        WHERE r.status = ${status}
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ count }] = await sql<[{ count: string }]>`
        SELECT COUNT(*) AS count FROM marketplace_reports WHERE status = ${status}
      `;
      return { data: rows, total: parseInt(count, 10) };
    },

    async resolveReport(
      id: string,
      data: { status: "actioned" | "dismissed"; resolvedBy: string },
    ): Promise<MarketplaceReportRow | null> {
      const [row] = await sql<MarketplaceReportRow[]>`
        UPDATE marketplace_reports
           SET status = ${data.status}, resolved_at = now(), resolved_by = ${data.resolvedBy}
         WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    // ── Admin actions / audit log ──

    async logAdminAction(data: {
      listingId: string;
      adminId: string;
      action: AdminAction;
      note?: string;
    }): Promise<AdminActionRow> {
      const [row] = await sql<AdminActionRow[]>`
        INSERT INTO marketplace_admin_actions (listing_id, admin_id, action, note)
        VALUES (${data.listingId}, ${data.adminId}, ${data.action}, ${data.note ?? null})
        RETURNING *
      `;
      return row!;
    },

    async listAdminActions(listingId: string): Promise<AdminActionRow[]> {
      return sql<AdminActionRow[]>`
        SELECT * FROM marketplace_admin_actions
        WHERE listing_id = ${listingId}
        ORDER BY created_at DESC
      `;
    },

    // ── Verified publisher ──

    async setPublisherVerified(userId: string, verified: boolean): Promise<void> {
      await sql`
        UPDATE users
           SET is_verified_publisher = ${verified},
               verified_publisher_at = CASE WHEN ${verified} THEN now() ELSE NULL END
         WHERE id = ${userId}
      `;
    },

    async isPublisherVerified(userId: string): Promise<boolean> {
      const [row] = await sql<{ is_verified_publisher: boolean }[]>`
        SELECT is_verified_publisher FROM users WHERE id = ${userId}
      `;
      return row?.is_verified_publisher ?? false;
    },
  };
}
