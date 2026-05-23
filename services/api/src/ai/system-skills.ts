/**
 * System Skills Loader
 *
 * Returns absolute paths to the built-in "_system" skill directories that
 * ship with the platform. These are prepended to every SDK session's
 * `skillDirectories` regardless of the DB-backed context_skills for the
 * workspace/project/user.
 *
 * Resolution strategy: walk up from this module's directory (works both in
 * dev where __dirname is services/api/src/ai and in Docker where the compiled
 * JS lands at /app/dist/ai). We look for the _system folder relative to this
 * file's directory, then fall back to probing candidate paths.
 *
 * Drop-in absorption: a raw `*.md` pasted directly into the _system/ folder
 * (the "drop-in" workflow) is auto-converted into a proper `<slug>/SKILL.md`
 * skill on the next load — synthesizing name+description frontmatter when the
 * raw file lacks it. No restart and no manual folder wrapping required.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The _system folder lives alongside this file in src/ai/_system/ (dev) or
// dist/ai/_system/ (compiled). In Docker the entire src tree is copied to
// /app/src so the relative path still holds.
const SYSTEM_SKILLS_DIR = join(__dirname, "skills", "_system");

// ── Drop-in absorption helpers ────────────────────────────

/** True when the markdown already opens with a `--- … ---` frontmatter block. */
function hasFrontmatter(md: string): boolean {
  return /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/.test(md);
}

/** Skill folder slug from a dropped file name: lowercase, alphanumeric + dash. */
function slugFromFileName(fileName: string): string {
  const base = fileName.replace(/\.md$/i, "");
  const s = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "skill";
}

/**
 * Best-effort `name` + `description` frontmatter for a raw skill that has none.
 * The description drives SDK skill-matching, so we seed it from the H1 + first
 * paragraph and append slug/title keywords. It is intentionally a starting
 * point — operators should refine it for sharper triggering.
 */
function synthesizeFrontmatter(raw: string, slug: string): string {
  const h1 = raw.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  const title = h1 || slug.replace(/-/g, " ");

  let gist = "";
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("---") || t.startsWith("```")) continue;
    gist = t.replace(/[`*_>#[\]]/g, "").trim();
    break;
  }

  const keywords = Array.from(
    new Set([...slug.split("-"), ...title.toLowerCase().split(/\s+/)]),
  )
    .filter(Boolean)
    .join(", ");

  let desc = gist ? `${title}. ${gist}` : title;
  desc = desc.replace(/\s+/g, " ").slice(0, 280).replace(/"/g, "'");
  desc = `${desc} Triggers on: ${keywords}.`;

  return `---\nname: ${slug}\ndescription: "${desc}"\n---\n\n`;
}

/**
 * Absorb raw drop-in skills: any flat `*.md` placed directly in `baseDir`
 * (other than README.md) is converted in place into `<slug>/SKILL.md`,
 * synthesizing frontmatter when absent. Idempotent — the flat file is consumed
 * by the conversion. Never clobbers an existing `<slug>/SKILL.md` (skips + warns
 * so a hand-authored skill is always safe). Failures are logged, never thrown.
 */
export function absorbDropinSkills(baseDir: string): void {
  if (!existsSync(baseDir)) return;

  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".md") || lower === "readme.md") continue;

    const slug = slugFromFileName(entry.name);
    const skillDir = join(baseDir, slug);
    const skillMd = join(skillDir, "SKILL.md");
    const flatPath = join(baseDir, entry.name);

    try {
      if (existsSync(skillMd)) {
        console.warn(
          `[skills] Drop-in "${entry.name}" skipped — _system/${slug}/SKILL.md already exists; delete one to resolve.`,
        );
        continue;
      }
      const raw = readFileSync(flatPath, "utf-8");
      const hadFrontmatter = hasFrontmatter(raw);
      const content = hadFrontmatter ? raw : synthesizeFrontmatter(raw, slug) + raw;
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillMd, content, "utf-8");
      rmSync(flatPath, { force: true });
      console.log(
        `[skills] Absorbed drop-in "${entry.name}" -> _system/${slug}/SKILL.md` +
          (hadFrontmatter
            ? ""
            : " (synthesized frontmatter — refine the description for sharper triggering)"),
      );
    } catch (err) {
      console.warn(
        `[skills] Failed to absorb drop-in "${entry.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Returns absolute paths to each system skill directory (one per skill) that
 * exist on disk. Returns an empty array when the _system folder is absent
 * (e.g. in test environments that omit the asset tree).
 *
 * Each returned path is a directory that contains a SKILL.md — the SDK
 * discovers skills by scanning these directories. Any raw drop-in `*.md` files
 * are absorbed into proper skill folders first (see absorbDropinSkills).
 */
export function getSystemSkillDirs(): string[] {
  // Convert any freshly-pasted raw drop-in files before scanning, so a skill
  // dropped between sessions is picked up on the next build (no restart).
  absorbDropinSkills(SYSTEM_SKILLS_DIR);

  if (!existsSync(SYSTEM_SKILLS_DIR)) {
    return [];
  }

  try {
    const entries = readdirSync(SYSTEM_SKILLS_DIR, { withFileTypes: true });
    const dirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(SYSTEM_SKILLS_DIR, entry.name);
      const skillMd = join(skillDir, "SKILL.md");
      if (existsSync(skillMd)) {
        dirs.push(skillDir);
      }
    }
    return dirs;
  } catch {
    return [];
  }
}
