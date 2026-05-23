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
 */

import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The _system folder lives alongside this file in src/ai/_system/ (dev) or
// dist/ai/_system/ (compiled). In Docker the entire src tree is copied to
// /app/src so the relative path still holds.
const SYSTEM_SKILLS_DIR = join(__dirname, "skills", "_system");

/**
 * Returns absolute paths to each system skill directory (one per skill) that
 * exist on disk. Returns an empty array when the _system folder is absent
 * (e.g. in test environments that omit the asset tree).
 *
 * Each returned path is a directory that contains a SKILL.md — the SDK
 * discovers skills by scanning these directories.
 */
export function getSystemSkillDirs(): string[] {
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
