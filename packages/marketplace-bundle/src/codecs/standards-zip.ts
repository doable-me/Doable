import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  bundleManifestSchema,
  type BundleManifest,
  type SkillItem,
  type RuleItem,
  type ConnectorItem,
  type KnowledgeItem,
} from "../manifest.js";

/**
 * Standards Zip v1 codec — emits a zip that simultaneously satisfies:
 *
 *   - **Anthropic Agent Skills** — `skills/<name>/SKILL.md` with YAML
 *     front-matter (`name`, `description`, optional `model`).
 *   - **Cursor Rules** — `.cursor/rules/<name>.mdc` with YAML front-matter
 *     (`description`, `globs`, `alwaysApply`).
 *   - **Model Context Protocol** — root `mcp.json` describing connectors.
 *   - **Claude Code Plugin** — root `plugin.json` summarising the bundle so
 *     it can be picked up by `claude plugin install ./bundle.zip`.
 *
 * A single zip is therefore both a Doable bundle AND a portable Cursor /
 * Claude / Anthropic skill pack. Round-trips through `decodeStandardsZip`
 * preserve everything required by Doable (extra Doable-specific metadata
 * lives in `doable.manifest.json` at the root).
 *
 * Pure function — no fs, no fetch, runs in Node 18+ and the browser.
 */
export const STANDARDS_ZIP_FORMAT = "standards.zip.v1" as const;

const DOABLE_MANIFEST_FILE = "doable.manifest.json";
const PLUGIN_FILE = "plugin.json";
const MCP_FILE = "mcp.json";
const SKILLS_DIR = "skills/";
const RULES_DIR = ".cursor/rules/";
const KNOWLEDGE_DIR = "knowledge/";
const INSTRUCTIONS_DIR = "instructions/";

export interface StandardsZipEncodeResult {
  format: typeof STANDARDS_ZIP_FORMAT;
  /** Zip file as raw bytes. Stream/upload as application/zip. */
  contents: Uint8Array;
  byteLength: number;
  /** Map of file paths inside the zip → byte sizes (for diagnostics). */
  files: Record<string, number>;
}

export function encodeStandardsZip(manifest: BundleManifest): StandardsZipEncodeResult {
  const stamped: BundleManifest = { ...manifest, format: STANDARDS_ZIP_FORMAT };
  const files: Record<string, Uint8Array> = {};

  files[DOABLE_MANIFEST_FILE] = strToU8(JSON.stringify(stamped, null, 2));
  files[PLUGIN_FILE] = strToU8(JSON.stringify(buildPluginJson(stamped), null, 2));

  for (const skill of stamped.skills) {
    const dir = `${SKILLS_DIR}${safeSlug(skill.name)}/`;
    files[`${dir}SKILL.md`] = strToU8(skillToMarkdown(skill));
  }

  for (const rule of stamped.rules) {
    files[`${RULES_DIR}${safeSlug(rule.name)}.mdc`] = strToU8(ruleToMdc(rule));
  }

  for (const instr of stamped.instructions) {
    files[`${INSTRUCTIONS_DIR}${safeFilename(instr.filename)}`] = strToU8(instr.content);
  }

  for (const k of stamped.knowledge) {
    if (k.content !== undefined) {
      files[`${KNOWLEDGE_DIR}${safeFilename(k.filename)}`] = strToU8(k.content);
    }
  }

  if (stamped.connectors.length > 0) {
    files[MCP_FILE] = strToU8(JSON.stringify(buildMcpJson(stamped), null, 2));
  }

  const zip = zipSync(files, { level: 6 });
  const sizes: Record<string, number> = {};
  for (const [path, bytes] of Object.entries(files)) sizes[path] = bytes.byteLength;

  return {
    format: STANDARDS_ZIP_FORMAT,
    contents: zip,
    byteLength: zip.byteLength,
    files: sizes,
  };
}

export function decodeStandardsZip(zipBytes: Uint8Array): BundleManifest {
  const files = unzipSync(zipBytes);

  // Prefer the Doable manifest if present (lossless round-trip).
  const doableRaw = files[DOABLE_MANIFEST_FILE];
  if (doableRaw) {
    const parsed = JSON.parse(strFromU8(doableRaw));
    return bundleManifestSchema.parse({ ...parsed, format: STANDARDS_ZIP_FORMAT });
  }

  // Fallback: reconstruct manifest from on-disk shape (third-party imports).
  const skills: SkillItem[] = [];
  const rules: RuleItem[] = [];
  const knowledge: KnowledgeItem[] = [];
  const instructions: { filename: string; content: string }[] = [];
  let connectors: ConnectorItem[] = [];

  for (const [path, bytes] of Object.entries(files)) {
    if (path.startsWith(SKILLS_DIR) && path.endsWith("/SKILL.md")) {
      const name = path.slice(SKILLS_DIR.length, -"/SKILL.md".length);
      skills.push(skillFromMarkdown(name, strFromU8(bytes)));
    } else if (path.startsWith(RULES_DIR) && path.endsWith(".mdc")) {
      const name = path.slice(RULES_DIR.length, -".mdc".length);
      rules.push(ruleFromMdc(name, strFromU8(bytes)));
    } else if (path.startsWith(KNOWLEDGE_DIR) && !path.endsWith("/")) {
      knowledge.push({
        filename: path.slice(KNOWLEDGE_DIR.length),
        content: strFromU8(bytes),
      });
    } else if (path.startsWith(INSTRUCTIONS_DIR) && !path.endsWith("/")) {
      instructions.push({
        filename: path.slice(INSTRUCTIONS_DIR.length),
        content: strFromU8(bytes),
      });
    } else if (path === MCP_FILE) {
      connectors = parseMcpJson(strFromU8(bytes));
    }
  }

  // Plugin.json informs metadata when no Doable manifest exists.
  const pluginRaw = files[PLUGIN_FILE];
  const plugin: { name?: string; description?: string; version?: string; tags?: string[] } = pluginRaw
    ? safeJson(strFromU8(pluginRaw))
    : {};

  return bundleManifestSchema.parse({
    schemaVersion: "1.0.0",
    format: STANDARDS_ZIP_FORMAT,
    exportedAt: new Date().toISOString(),
    metadata: {
      name: plugin.name ?? "Imported bundle",
      description: plugin.description ?? "",
      icon: "box",
      color: "blue",
      version: plugin.version ?? "1.0.0",
      tags: plugin.tags ?? [],
    },
    skills,
    rules,
    instructions,
    knowledge,
    connectors,
  });
}

// ─── helpers ─────────────────────────────────────────────────

function safeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function safeFilename(name: string): string {
  // Strip leading slashes and dot-segments; keep path internals for nested files.
  return name.replace(/^[/\\]+/, "").replace(/\.\.+/g, ".").slice(0, 250);
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── Anthropic Agent Skill encoding ──

function skillToMarkdown(skill: SkillItem): string {
  const fm: string[] = [];
  fm.push(`name: ${yamlString(skill.name)}`);
  if (skill.description) fm.push(`description: ${yamlString(skill.description)}`);
  if (skill.title) fm.push(`title: ${yamlString(skill.title)}`);
  if (skill.version) fm.push(`version: ${yamlString(skill.version)}`);
  if (skill.models?.length) fm.push(`model: ${JSON.stringify(skill.models)}`);
  if (skill.scope) fm.push(`scope: ${skill.scope}`);
  return `---\n${fm.join("\n")}\n---\n\n${skill.content}`;
}

function skillFromMarkdown(fallbackName: string, raw: string): SkillItem {
  const { data, body } = parseFrontMatter(raw);
  return {
    name: typeof data.name === "string" ? data.name : fallbackName,
    title: typeof data.title === "string" ? data.title : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    content: body,
    scope: data.scope === "project" ? "project" : "workspace",
    version: typeof data.version === "string" ? data.version : undefined,
    models: Array.isArray(data.model)
      ? (data.model as unknown[]).filter((x): x is string => typeof x === "string")
      : typeof data.model === "string"
        ? [data.model]
        : undefined,
  };
}

// ── Cursor .mdc encoding ──

function ruleToMdc(rule: RuleItem): string {
  const fm: string[] = [];
  if (rule.description) fm.push(`description: ${yamlString(rule.description)}`);
  if (rule.filePatterns.length) fm.push(`globs: ${JSON.stringify(rule.filePatterns)}`);
  if (rule.alwaysApply) fm.push(`alwaysApply: true`);
  const front = fm.length ? `---\n${fm.join("\n")}\n---\n\n` : "";
  return `${front}${rule.content}`;
}

function ruleFromMdc(name: string, raw: string): RuleItem {
  const { data, body } = parseFrontMatter(raw);
  const globs = Array.isArray(data.globs)
    ? (data.globs as unknown[]).filter((x): x is string => typeof x === "string")
    : typeof data.globs === "string"
      ? [data.globs]
      : [];
  return {
    name,
    description: typeof data.description === "string" ? data.description : undefined,
    content: body,
    filePatterns: globs,
    alwaysApply: data.alwaysApply === true,
  };
}

// ── Plugin.json (Claude Code plugin manifest) ──

function buildPluginJson(m: BundleManifest) {
  return {
    name: m.metadata.slug ?? safeSlug(m.metadata.name),
    displayName: m.metadata.name,
    description: m.metadata.description,
    version: m.metadata.version,
    icon: m.metadata.icon,
    license: m.metadata.license,
    homepage: m.metadata.homepage,
    tags: m.metadata.tags,
    skills: m.skills.map((s) => `skills/${safeSlug(s.name)}/SKILL.md`),
    rules: m.rules.map((r) => `${RULES_DIR}${safeSlug(r.name)}.mdc`),
    knowledge: m.knowledge.map((k) => `${KNOWLEDGE_DIR}${safeFilename(k.filename)}`),
    mcp: m.connectors.length ? MCP_FILE : undefined,
  };
}

// ── MCP server config (mcp.json) ──

function buildMcpJson(m: BundleManifest) {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const c of m.connectors) {
    mcpServers[c.name] = {
      type: c.type,
      transport: c.transport,
      // Public config only — credentials are filled in by the install dialog.
      config: c.config,
      requires: c.requires,
      capabilities: c.capabilities,
      description: c.description,
    };
  }
  return { mcpServers };
}

function parseMcpJson(raw: string): ConnectorItem[] {
  const data = safeJson(raw);
  const root = (data.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  const out: ConnectorItem[] = [];
  for (const [name, entry] of Object.entries(root)) {
    if (!entry || typeof entry !== "object") continue;
    const type = typeof entry.type === "string" ? entry.type : "custom";
    const transport =
      entry.transport === "http" || entry.transport === "sse" ? entry.transport : "stdio";
    out.push({
      name,
      type,
      transport,
      description: typeof entry.description === "string" ? entry.description : undefined,
      config:
        typeof entry.config === "object" && entry.config !== null
          ? (entry.config as Record<string, unknown>)
          : {},
      requires: Array.isArray(entry.requires) ? (entry.requires as ConnectorItem["requires"]) : [],
      capabilities: Array.isArray(entry.capabilities)
        ? (entry.capabilities as string[])
        : [],
    });
  }
  return out;
}

// ── Front-matter (YAML-ish, hand-rolled to keep zero deps in browser bundles) ──

function parseFrontMatter(raw: string): { data: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };
  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, "");
  const data: Record<string, unknown> = {};
  for (const line of header.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawVal = line.slice(idx + 1).trim();
    data[key] = parseScalar(rawVal);
  }
  return { data, body };
}

function parseScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "") return null;
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function yamlString(s: string): string {
  // Quote if the string has special YAML chars; otherwise leave bare.
  if (/[:#\n\[\]{},&*!|>'"%@`?]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}
