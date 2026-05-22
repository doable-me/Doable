import type postgres from "postgres";

/**
 * Persistent bundle artifacts for marketplace listings. Each artifact is the
 * exact bytes that an installer would receive — keyed by (listing, version,
 * format) so we can serve any historical version/format combination.
 *
 * Artifacts are large blobs and live in their own table to keep the hot path
 * (browse / detail / list-my-listings) cheap.
 */
export interface MarketplaceBundleArtifactRow {
  id: string;
  listing_id: string;
  version: string;
  format: "doable.json.v1" | "standards.zip.v1";
  contents: Uint8Array;
  byte_size: number;
  sha256: string;
  created_at: Date;
}

export interface ManifestSummary {
  skills: number;
  rules: number;
  knowledge: number;
  connectors: number;
  permissions: string[];
  requiresReview: boolean;
  reviewReason?: string;
}

export function marketplaceBundleQueries(sql: postgres.Sql) {
  return {
    async insertArtifact(data: {
      listingId: string;
      version: string;
      format: "doable.json.v1" | "standards.zip.v1";
      contents: Buffer | Uint8Array;
      byteSize: number;
      sha256: string;
    }): Promise<MarketplaceBundleArtifactRow> {
      const [row] = await sql<MarketplaceBundleArtifactRow[]>`
        INSERT INTO marketplace_bundle_artifacts
          (listing_id, version, format, contents, byte_size, sha256)
        VALUES (
          ${data.listingId},
          ${data.version},
          ${data.format},
          ${data.contents as Buffer},
          ${data.byteSize},
          ${data.sha256}
        )
        ON CONFLICT (listing_id, version, format)
          DO UPDATE SET
            contents = excluded.contents,
            byte_size = excluded.byte_size,
            sha256 = excluded.sha256,
            created_at = now()
        RETURNING *
      `;
      return row!;
    },

    async getArtifact(
      listingId: string,
      version: string,
      format: "doable.json.v1" | "standards.zip.v1",
    ): Promise<MarketplaceBundleArtifactRow | null> {
      const [row] = await sql<MarketplaceBundleArtifactRow[]>`
        SELECT * FROM marketplace_bundle_artifacts
        WHERE listing_id = ${listingId}
          AND version = ${version}
          AND format = ${format}
      `;
      return row ?? null;
    },

    async getLatestArtifactByFormat(
      listingId: string,
      format: "doable.json.v1" | "standards.zip.v1",
    ): Promise<MarketplaceBundleArtifactRow | null> {
      const [row] = await sql<MarketplaceBundleArtifactRow[]>`
        SELECT * FROM marketplace_bundle_artifacts
        WHERE listing_id = ${listingId}
          AND format = ${format}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return row ?? null;
    },

    /**
     * Stamps the listing row with the canonical bundle metadata + a JSON
     * permission/composition summary. Cheap to read on the browse path so we
     * never have to crack the artifact open just to render a card.
     */
    async setBundleSummary(
      listingId: string,
      data: {
        bundleFormat: "doable.json.v1" | "standards.zip.v1";
        bundleSize: number;
        bundleSha256: string;
        manifestSummary: ManifestSummary;
        requiresReviewReason?: string | null;
      },
    ): Promise<void> {
      await sql`
        UPDATE marketplace_listings SET
          bundle_format    = ${data.bundleFormat},
          bundle_size      = ${data.bundleSize},
          bundle_sha256    = ${data.bundleSha256},
          manifest_summary = ${sql.json(data.manifestSummary as unknown as postgres.JSONValue)},
          requires_review_reason = ${data.requiresReviewReason ?? null},
          updated_at = now()
        WHERE id = ${listingId}
      `;
    },
  };
}
