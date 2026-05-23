/**
 * Skills Materializer — DB → Filesystem for SDK skillDirectories
 *
 * The Copilot SDK's native skills feature requires on-disk skill folders
 * (each skill = directory with SKILL.md + optional companion files). Doable
 * stores skills in `context_skills` (+ `context_skill_files`). This module
 * writes the relevant skills to a per-(workspace, project, user) cache dir
 * and returns the resulting paths to be passed as `skillDirectories` to the
 * SDK session.
 *
 * Layout under $DOABLE_SKILLS_DIR (default: $DOABLE_PROJECTS_DIR/.skills-cache
 * or process.cwd()/.skills-cache):
 *
 *   <workspaceId>/
 *     workspace/<slug>/SKILL.md, ...
 *     project/<projectId>/<slug>/...
 *     user/<userId>/<slug>/...
 *
 * The three roots (workspace/, project/<pid>/, user/<uid>/) are returned as
 * the three `skillDirectories` entries; the SDK recursively discovers each
 * `<slug>/SKILL.md` inside them.
 *
 * Caching: a `.manifest-hash` file at each root tracks the hash of the
 * skills it was built from. If the hash hasn't changed since the last
 * materialization for that scope, we skip rewriting files.
 *
 * Cleanup: callers wire `cleanup()` to the SDK's `hooks.onSessionEnd` to
 * remove the cache dir for the session — but in practice the per-engine
 * pool reuses the cache across resumes, so cleanup is a tear-down hook only.
 */

import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { skillsQueries, type SkillWithFiles } from "@doable/db";
import { sql } from "../db/index.js";
import { getSystemSkillDirs } from "./system-skills.js";

const PROJECTS_ROOT = process.env.DOABLE_PROJECTS_DIR ?? join(process.cwd(), "projects");
const SKILLS_ROOT =
  process.env.DOABLE_SKILLS_DIR ?? join(PROJECTS_ROOT, ".skills-cache");

const skillsDb = skillsQueries(sql);

// ── Slug helper ───────────────────────────────────────────
function slugify(name: string): string {
  // SDK skill folder name: lowercase, alphanumeric + dash, max 64.
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "skill";
}

// ── Frontmatter ───────────────────────────────────────────
function hasFrontmatter(md: string): boolean {
  return /^---\s*\n[\s\S]*?\n---\s*\n/.test(md);
}

/** Ensures SKILL.md starts with `---\nname: …\ndescription: …\n---\n…` so the SDK recognizes it. */
function ensureFrontmatter(md: string, name: string, description: string): string {
  if (hasFrontmatter(md)) return md;
  const safeName = name.replace(/"/g, '\\"');
  const safeDesc = description.replace(/\n/g, " ").replace(/"/g, '\\"');
  return `---\nname: "${safeName}"\ndescription: "${safeDesc}"\n---\n\n${md}`;
}

// ── Hashing ───────────────────────────────────────────────
function hashSkills(skills: SkillWithFiles[]): string {
  const h = createHash("sha256");
  // Sort for stability.
  const sorted = [...skills].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of sorted) {
    h.update(s.id);
    h.update("\0");
    h.update(s.skill_name);
    h.update("\0");
    h.update(s.description ?? "");
    h.update("\0");
    h.update(s.skill_content ?? "");
    h.update("\0");
    const sortedFiles = [...s.files].sort((a, b) => a.file_path.localeCompare(b.file_path));
    for (const f of sortedFiles) {
      h.update(f.file_path);
      h.update("\0");
      h.update(f.content);
      h.update("\0");
    }
    h.update("\x01");
  }
  return h.digest("hex");
}

// ── Path safety ───────────────────────────────────────────
function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith("/") || p.startsWith("\\")) return false;
  if (p.includes("..")) return false;
  if (p.length > 512) return false;
  return true;
}

// ── Write one skill folder ────────────────────────────────
async function writeSkillFolder(rootDir: string, skill: SkillWithFiles): Promise<void> {
  const slug = slugify(skill.skill_name);
  const folder = join(rootDir, slug);
  await mkdir(folder, { recursive: true });

  const skillMd = ensureFrontmatter(
    skill.skill_content ?? "",
    skill.skill_name,
    skill.description ?? "",
  );
  await writeFile(join(folder, "SKILL.md"), skillMd, "utf-8");

  for (const f of skill.files) {
    if (!isSafeRelativePath(f.file_path)) {
      console.warn(`[skills] Skipping unsafe file path "${f.file_path}" on skill ${skill.id}`);
      continue;
    }
    if (f.file_path === "SKILL.md") continue; // reserved
    const target = join(folder, f.file_path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.content, "utf-8");
  }
}

async function writeScopeRoot(
  rootDir: string,
  skills: SkillWithFiles[],
): Promise<void> {
  const hash = hashSkills(skills);
  const hashFile = join(rootDir, ".manifest-hash");
  try {
    const existing = await readFile(hashFile, "utf-8");
    if (existing.trim() === hash && skills.length > 0) {
      // Up-to-date.
      return;
    }
  } catch {
    /* missing or unreadable — fall through */
  }

  // Wipe and rewrite.
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });

  for (const s of skills) {
    try {
      await writeSkillFolder(rootDir, s);
    } catch (err) {
      console.warn(
        `[skills] Failed to materialize "${s.skill_name}" (${s.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  await writeFile(hashFile, hash, "utf-8");
}

// ── Public API ────────────────────────────────────────────
export interface MaterializedSkills {
  /** Absolute paths to pass to SDK as `skillDirectories`. May be empty if no skills exist. */
  skillDirectories: string[];
  /** Number of skills materialized across all scopes (for logging). */
  skillCount: number;
  /** Tear-down — only call when the workspace/project/user cache is no longer needed. */
  cleanup: () => Promise<void>;
}

/**
 * Build skill folders on disk for this (workspace, project, user) tuple
 * and return the directory roots to hand to the SDK.
 */
export async function materializeSkillsForSession(opts: {
  workspaceId: string;
  projectId: string;
  userId: string;
}): Promise<MaterializedSkills> {
  const { workspaceId, projectId, userId } = opts;
  const systemDirs = getSystemSkillDirs();
  const all = await skillsDb.listSkillsForSession(workspaceId, projectId, userId);
  if (all.length === 0) {
    return {
      skillDirectories: systemDirs,
      skillCount: 0,
      cleanup: async () => {},
    };
  }

  const wsRoot = join(SKILLS_ROOT, workspaceId, "workspace");
  const projRoot = join(SKILLS_ROOT, workspaceId, "project", projectId);
  const userRoot = join(SKILLS_ROOT, workspaceId, "user", userId);

  const wsSkills = all.filter((s) => s.scope === "workspace");
  const projSkills = all.filter((s) => s.scope === "project" && s.project_id === projectId);
  const userSkills = all.filter((s) => s.scope === "user" && s.user_id === userId);

  await Promise.all([
    writeScopeRoot(wsRoot, wsSkills),
    writeScopeRoot(projRoot, projSkills),
    writeScopeRoot(userRoot, userSkills),
  ]);

  const skillDirectories: string[] = [...systemDirs];
  if (wsSkills.length > 0) skillDirectories.push(wsRoot);
  if (projSkills.length > 0) skillDirectories.push(projRoot);
  if (userSkills.length > 0) skillDirectories.push(userRoot);

  console.log(
    `[skills] Materialized ${all.length} skill(s) for ws=${workspaceId.slice(0, 8)} ` +
      `project=${projectId.slice(0, 8)} user=${userId.slice(0, 8)} ` +
      `(${wsSkills.length}w/${projSkills.length}p/${userSkills.length}u)`,
  );

  return {
    skillDirectories,
    skillCount: all.length,
    cleanup: async () => {
      // Targeted cleanup of just this user's per-session scope. Workspace
      // and project caches are intentionally retained for reuse.
      await rm(userRoot, { recursive: true, force: true }).catch(() => {});
    },
  };
}
