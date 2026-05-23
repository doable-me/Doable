import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { getSystemSkillDirs } from "../system-skills.js";

/** Asserts a SKILL.md string opens with a `--- … ---` block carrying name + description. */
function assertNameDescriptionFrontmatter(content: string, label: string): void {
  assert.ok(content.startsWith("---"), `${label} must start with ---`);
  const end = content.indexOf("\n---", 3);
  assert.ok(end > 0, `${label} frontmatter closing --- not found`);
  const frontmatter = content.slice(3, end);
  assert.ok(/name\s*:/.test(frontmatter), `${label} frontmatter must contain "name:"`);
  assert.ok(/description\s*:/.test(frontmatter), `${label} frontmatter must contain "description:"`);
}

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
    assertNameDescriptionFrontmatter(readFileSync(SKILL_MD_PATH, "utf-8"), "inbuilt-database SKILL.md");
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

// Master skills shipped from DoableSkills — every install/workspace gets these
// by default. The slug must match the _system/<slug>/ folder name.
const SHIPPED_SKILL_SLUGS = [
  "business-card-maker",
  "ecommerce-website",
  "greeting-card",
  "magazine-flipbook",
  "resume-cv",
] as const;

describe("shipped master skills", () => {
  it(`getSystemSkillDirs() returns at least ${SHIPPED_SKILL_SLUGS.length + 1} dirs (6 shipped + inbuilt-database)`, () => {
    const dirs = getSystemSkillDirs();
    assert.ok(
      dirs.length >= SHIPPED_SKILL_SLUGS.length + 1,
      `Expected >= ${SHIPPED_SKILL_SLUGS.length + 1} system skill dirs, got ${dirs.length}: ${dirs.join(", ")}`,
    );
  });

  for (const slug of SHIPPED_SKILL_SLUGS) {
    it(`discovers the "${slug}" skill directory`, () => {
      const dirs = getSystemSkillDirs();
      const found = dirs.some((d) => d.replace(/\\/g, "/").endsWith(`/_system/${slug}`));
      assert.ok(found, `"${slug}" not found in: ${dirs.join(", ")}`);
    });

    it(`"${slug}" SKILL.md has frontmatter with name and description`, () => {
      const md = join(__dirname, "..", "skills", "_system", slug, "SKILL.md");
      assert.ok(existsSync(md), `SKILL.md missing for ${slug} at ${md}`);
      assertNameDescriptionFrontmatter(readFileSync(md, "utf-8"), `${slug} SKILL.md`);
    });
  }
});
