import { z } from "zod";

/**
 * Marketplace bundle manifest — the canonical, format-agnostic shape that
 * every codec encodes/decodes to. Both the Doable JSON v1 and Standards
 * Zip v1 codecs return data conforming to this schema.
 *
 * Keep this file dependency-free (no DB, no fs) so it can be imported by
 * the API server, the web client, and edge runtimes alike.
 */

// ─── Item schemas ─────────────────────────────────────────────

export const skillItemSchema = z.object({
  /** Slug-style identifier, e.g. "code-reviewer". */
  name: z.string().min(1).max(100),
  /** Human-friendly display title. Defaults to `name` if omitted. */
  title: z.string().max(120).optional(),
  /** Free-form short description shown in install previews. */
  description: z.string().max(400).optional(),
  /** Markdown body. For Anthropic SKILL.md, this is the file contents minus front-matter. */
  content: z.string(),
  /** "workspace" | "project" — applied at install time. */
  scope: z.enum(["workspace", "project"]).default("workspace"),
  /** Optional version string for the skill itself (independent of bundle version). */
  version: z.string().max(20).optional(),
  /** Optional list of model identifiers the skill explicitly supports. */
  models: z.array(z.string().max(60)).max(20).optional(),
});
export type SkillItem = z.infer<typeof skillItemSchema>;

export const ruleItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(400).optional(),
  content: z.string(),
  /** Glob patterns the rule applies to, e.g. ["*.ts", "src/**"]. */
  filePatterns: z.array(z.string().max(200)).max(50).default([]),
  /** True for rules that should always attach (Cursor "alwaysApply"). */
  alwaysApply: z.boolean().optional(),
});
export type RuleItem = z.infer<typeof ruleItemSchema>;

export const instructionItemSchema = z.object({
  filename: z.string().min(1).max(200),
  content: z.string(),
});
export type InstructionItem = z.infer<typeof instructionItemSchema>;

export const knowledgeItemSchema = z.object({
  filename: z.string().min(1).max(200),
  /**
   * Inline content for small files. Larger payloads (>256 KiB) MUST go in
   * a sidecar file referenced by `path` (Standards Zip codec only).
   */
  content: z.string().optional(),
  path: z.string().optional(),
  mimeType: z.string().max(100).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;

/**
 * MCP connector reference. We do NOT bundle credentials — they're a per-install
 * concern handled by the connector provisioning UI. Bundles only describe
 * what the consumer would need to provide.
 */
export const connectorItemSchema = z.object({
  name: z.string().min(1).max(100),
  /** Stable connector identifier (e.g. "github", "linear", "filesystem"). */
  type: z.string().min(1).max(60),
  description: z.string().max(400).optional(),
  /** MCP transport: "stdio" | "http" | "sse". */
  transport: z.enum(["stdio", "http", "sse"]).default("stdio"),
  /** Public configuration only — never secrets. */
  config: z.record(z.string(), z.unknown()).default({}),
  /** What this connector requires the user to supply (env vars, OAuth, etc.). */
  requires: z
    .array(
      z.object({
        kind: z.enum(["env", "oauth", "apiKey", "url"]),
        key: z.string().max(120),
        label: z.string().max(120).optional(),
        description: z.string().max(400).optional(),
        required: z.boolean().default(true),
      })
    )
    .default([]),
  /** Capabilities the connector advertises (used by permission preview). */
  capabilities: z.array(z.string().max(80)).max(50).default([]),
});
export type ConnectorItem = z.infer<typeof connectorItemSchema>;

// ─── Top-level manifest ───────────────────────────────────────

export const bundleManifestSchema = z.object({
  /** Bundle schema version. Bumped only on breaking changes. */
  schemaVersion: z.literal("1.0.0"),

  /** Format the bundle was emitted in. Useful for cross-codec round-trips. */
  format: z.enum(["doable.json.v1", "standards.zip.v1"]),

  /** ISO-8601 timestamp of when the bundle was built. */
  exportedAt: z.string().datetime(),

  /** Identifier of the publishing user (opaque). Used for verification only. */
  publisherId: z.string().max(64).optional(),

  /** Per-bundle metadata. */
  metadata: z.object({
    name: z.string().min(1).max(120),
    slug: z.string().regex(/^[a-z0-9-]+$/).max(120).optional(),
    description: z.string().max(2000).default(""),
    icon: z.string().max(50).default("box"),
    color: z.string().max(20).default("blue"),
    version: z.string().max(20).default("1.0.0"),
    tags: z.array(z.string().max(40)).max(20).default([]),
    homepage: z.string().url().optional(),
    license: z.string().max(60).optional(),
  }),

  skills: z.array(skillItemSchema).default([]),
  rules: z.array(ruleItemSchema).default([]),
  instructions: z.array(instructionItemSchema).default([]),
  knowledge: z.array(knowledgeItemSchema).default([]),
  connectors: z.array(connectorItemSchema).default([]),
});

export type BundleManifest = z.infer<typeof bundleManifestSchema>;

/** Parse + validate a manifest. Throws ZodError on invalid input. */
export function parseManifest(raw: unknown): BundleManifest {
  return bundleManifestSchema.parse(raw);
}

/** Safe variant — returns success/error tuple. */
export function safeParseManifest(raw: unknown) {
  return bundleManifestSchema.safeParse(raw);
}
