import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { getSystemSkillDirs } from "../system-skills.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD_PATH = join(
  __dirname,
  "..",
  "skills",
  "_system",
  "inbuilt-database",
  "SKILL.md",
);

describe("inbuilt-database SKILL.md", () => {
  it("file exists on disk", () => {
    assert.ok(existsSync(SKILL_MD_PATH), `Expected SKILL.md at ${SKILL_MD_PATH}`);
  });

  it("has valid YAML frontmatter with name and description", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    // Frontmatter block: --- ... ---
    assert.ok(content.startsWith("---"), "SKILL.md must start with ---");
    const end = content.indexOf("\n---", 3);
    assert.ok(end > 0, "SKILL.md frontmatter closing --- not found");
    const frontmatter = content.slice(3, end);
    assert.ok(/name\s*:/.test(frontmatter), 'frontmatter must contain "name:"');
    assert.ok(/description\s*:/.test(frontmatter), 'frontmatter must contain "description:"');
  });

  it("body mentions data.migrate", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    assert.ok(content.includes("data.migrate"), 'SKILL.md must mention "data.migrate"');
  });

  it("body mentions @doable/data import", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    assert.ok(content.includes("@doable/data"), 'SKILL.md must mention "@doable/data"');
  });
});

describe("getSystemSkillDirs()", () => {
  it("returns at least one directory", () => {
    const dirs = getSystemSkillDirs();
    assert.ok(dirs.length >= 1, `Expected at least 1 system skill dir, got ${dirs.length}`);
  });

  it("includes the inbuilt-database skill directory", () => {
    const dirs = getSystemSkillDirs();
    const hasInbuilt = dirs.some((d) => d.includes("inbuilt-database"));
    assert.ok(hasInbuilt, `inbuilt-database dir not found in: ${dirs.join(", ")}`);
  });

  it("all returned dirs contain a SKILL.md", () => {
    const dirs = getSystemSkillDirs();
    for (const d of dirs) {
      const md = join(d, "SKILL.md");
      assert.ok(existsSync(md), `SKILL.md missing in ${d}`);
    }
  });
});
