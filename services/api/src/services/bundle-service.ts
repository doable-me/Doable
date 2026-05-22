import { createHash } from "node:crypto";
import {
  type BundleManifest,
  type BundleFormat,
  encodeBundle,
  decodeBundle,
  computePermissions,
  requiresModeration,
  JSON_V1_FORMAT,
  STANDARDS_ZIP_FORMAT,
} from "@doable/marketplace-bundle";
import { sql } from "../db/index.js";
import { environmentQueries } from "@doable/db/queries/environments";
import { skillsQueries } from "@doable/db/queries/skills";
import { marketplaceQueries, type ManifestSummary } from "@doable/db/queries/marketplace";

/**
 * Bundle Service — owns the translation between Doable's internal environment
 * model and portable Marketplace Bundles. The codec lives in
 * @doable/marketplace-bundle (pure / dependency-free); this service is the
 * thin DB-aware wrapper used by HTTP routes.
 *
 * Single source of truth for build/install operations — the routes layer
 * MUST NOT call codecs directly.
 */
export const bundleService = {
  /**
   * Build a portable manifest from a workspace environment. Strips secrets
   * (connectors export only `requires` descriptors, never values).
   */
  async buildManifestFromEnvironment(
    environmentId: string,
    overrides?: Partial<BundleManifest["metadata"]>
  ): Promise<BundleManifest | null> {
    const envs = environmentQueries(sql);
    const env = await envs.getById(environmentId);
    if (!env) return null;

    return {
      schemaVersion: "1.0.0",
      format: JSON_V1_FORMAT,
      exportedAt: new Date().toISOString(),
      metadata: {
        name: overrides?.name ?? env.name,
        slug: overrides?.slug,
        description: overrides?.description ?? env.description ?? "",
        icon: overrides?.icon ?? env.icon ?? "box",
        color: overrides?.color ?? env.color ?? "blue",
        version: overrides?.version ?? "1.0.0",
        tags: overrides?.tags ?? [],
        homepage: overrides?.homepage,
        license: overrides?.license,
      },
      skills: env.skills.map((s) => ({
        name: s.skill_name,
        content: s.skill_content,
        scope: s.scope === "project" ? "project" : "workspace",
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
      knowledge: env.knowledge.map((k) => ({
        filename: k.filename,
        content: k.content,
      })),
      // Connectors are reference-only in the bundle. Per-install credentials
      // are gathered by the install dialog. NEVER include secrets here.
      connectors: [],
    };
  },

  /**
   * Encode a manifest in the requested format.  Returns metadata suitable for
   * direct insertion into marketplace_bundle_artifacts.
   */
  encode(manifest: BundleManifest, format: BundleFormat) {
    const result = encodeBundle(manifest, format);
    const bytes =
      "contents" in result && typeof result.contents === "string"
        ? Buffer.from(result.contents, "utf8")
        : Buffer.from(result.contents);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      format,
      bytes,
      byteLength: bytes.byteLength,
      sha256,
    };
  },

  /**
   * Decode a stored bundle artifact back into a manifest. Used on install.
   */
  decode(input: { format: BundleFormat; contents: Buffer | Uint8Array | string }) {
    const contents =
      typeof input.contents === "string"
        ? input.contents
        : new Uint8Array(input.contents.buffer, input.contents.byteOffset, input.contents.byteLength);
    return decodeBundle({ format: input.format, contents });
  },

  /**
   * Materialise a manifest into the target workspace as a fresh environment.
   * Returns the new environment row.
   */
  async installManifestIntoWorkspace(
    workspaceId: string,
    userId: string,
    manifest: BundleManifest
  ) {
    const envs = environmentQueries(sql);
    const skillDb = skillsQueries(sql);

    const env = await envs.create({
      workspaceId,
      createdBy: userId,
      name: manifest.metadata.name,
      description: manifest.metadata.description,
      icon: manifest.metadata.icon,
      color: manifest.metadata.color,
    });

    for (const skill of manifest.skills) {
      const created = await skillDb.createSkill({
        workspaceId,
        scope: "workspace",
        skillName: skill.name,
        description: skill.description ?? "",
        skillContent: skill.content,
      });
      await envs.addSkillRef(env.id, created.id);
    }

    for (const rule of manifest.rules) {
      const created = await skillDb.createRule({
        workspaceId,
        scope: "workspace",
        ruleName: rule.name,
        content: rule.content,
        filePatterns: rule.filePatterns,
      });
      await envs.addRuleRef(env.id, created.id);
    }

    for (const instr of manifest.instructions) {
      await envs.addInstruction(env.id, instr.filename, instr.content);
    }

    for (const k of manifest.knowledge) {
      if (k.content !== undefined) {
        await envs.upsertKnowledge(env.id, k.filename, k.content);
      }
    }

    // Connectors are intentionally NOT auto-created — the install dialog
    // collects credentials separately and provisions them.

    return env;
  },

  /**
   * Build → encode → persist artifact in one step. Idempotent per
   * (listingId, version, format). Returns a stamp suitable for storing on
   * the listing row.
   */
  async buildAndStoreArtifact(opts: {
    listingId: string;
    environmentId: string;
    format: BundleFormat;
    metadataOverrides?: Partial<BundleManifest["metadata"]>;
  }): Promise<{
    manifest: BundleManifest;
    summary: ManifestSummary;
    sha256: string;
    byteSize: number;
    requiresReview: boolean;
    reviewReason: string | null;
  } | null> {
    const manifest = await this.buildManifestFromEnvironment(
      opts.environmentId,
      opts.metadataOverrides,
    );
    if (!manifest) return null;

    const enc = this.encode(manifest, opts.format);
    const mkt = marketplaceQueries(sql);
    await mkt.insertArtifact({
      listingId: opts.listingId,
      version: manifest.metadata.version,
      format: opts.format,
      contents: enc.bytes,
      byteSize: enc.byteLength,
      sha256: enc.sha256,
    });

    const requiresReview = requiresModeration(manifest);
    const reviewReason = requiresReview
      ? "Includes one or more third-party MCP connectors that need human review."
      : null;
    const permissions = computePermissions(manifest).map((p) => p.label);

    const summary: ManifestSummary = {
      skills: manifest.skills.length,
      rules: manifest.rules.length,
      knowledge: manifest.knowledge.length,
      connectors: manifest.connectors.length,
      permissions,
      requiresReview,
      reviewReason: reviewReason ?? undefined,
    };

    await mkt.setBundleSummary(opts.listingId, {
      bundleFormat: opts.format,
      bundleSize: enc.byteLength,
      bundleSha256: enc.sha256,
      manifestSummary: summary,
      requiresReviewReason: reviewReason,
    });

    return {
      manifest,
      summary,
      sha256: enc.sha256,
      byteSize: enc.byteLength,
      requiresReview,
      reviewReason,
    };
  },

  /**
   * Materialise a stored artifact into a workspace. Single round-trip:
   * fetch → decode → install.
   */
  async installFromArtifact(opts: {
    listingId: string;
    version: string;
    format: BundleFormat;
    workspaceId: string;
    userId: string;
  }) {
    const mkt = marketplaceQueries(sql);
    const artifact =
      (await mkt.getArtifact(opts.listingId, opts.version, opts.format)) ??
      (await mkt.getLatestArtifactByFormat(opts.listingId, opts.format));
    if (!artifact) {
      throw new Error(
        `No bundle artifact found for listing ${opts.listingId} in format ${opts.format}`,
      );
    }
    const manifest = this.decode({
      format: opts.format,
      contents: artifact.contents,
    });
    return this.installManifestIntoWorkspace(opts.workspaceId, opts.userId, manifest);
  },

  /**
   * Pure wrappers — re-exported here so HTTP layer can stay codec-agnostic.
   */
  computePermissions,
  requiresModeration,
  JSON_V1_FORMAT,
  STANDARDS_ZIP_FORMAT,
};
