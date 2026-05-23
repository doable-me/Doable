import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { getSystemSkillDirs, absorbDropinSkills } from "../system-skills.js";

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

describe("absorbDropinSkills() — raw drop-in conversion", () => {
  function withTempDir(fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "skills-absorb-"));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("converts a frontmatter-less flat .md into <slug>/SKILL.md with synthesized frontmatter", () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, "My Cool Skill.md"), "# My Cool Skill\n\nDoes cool things for users.\n", "utf-8");
      absorbDropinSkills(dir);

      const out = join(dir, "my-cool-skill", "SKILL.md");
      assert.ok(existsSync(out), "expected converted SKILL.md");
      assert.ok(!existsSync(join(dir, "My Cool Skill.md")), "flat file should be consumed");

      const content = readFileSync(out, "utf-8");
      assertNameDescriptionFrontmatter(content, "absorbed SKILL.md");
      assert.match(content, /name:\s*my-cool-skill/, "name derived from file slug");
      assert.ok(content.includes("Does cool things for users."), "body preserved");
    });
  });

  it("moves a flat .md that already has frontmatter verbatim into <slug>/SKILL.md", () => {
    withTempDir((dir) => {
      const raw = '---\nname: ready\ndescription: "Already has frontmatter."\n---\n\n# Ready\n\nBody.\n';
      writeFileSync(join(dir, "ready.md"), raw, "utf-8");
      absorbDropinSkills(dir);

      const out = join(dir, "ready", "SKILL.md");
      assert.ok(existsSync(out));
      assert.equal(readFileSync(out, "utf-8"), raw, "content must be byte-identical when frontmatter present");
    });
  });

  it("never clobbers an existing <slug>/SKILL.md (skips + leaves the flat file)", () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, "dup"));
      writeFileSync(join(dir, "dup", "SKILL.md"), '---\nname: dup\ndescription: "x"\n---\nORIGINAL', "utf-8");
      writeFileSync(join(dir, "dup.md"), "# Dup\n\nNew content.\n", "utf-8");
      absorbDropinSkills(dir);

      assert.ok(
        readFileSync(join(dir, "dup", "SKILL.md"), "utf-8").includes("ORIGINAL"),
        "existing skill must not be overwritten",
      );
      assert.ok(existsSync(join(dir, "dup.md")), "flat file left untouched when skipped");
    });
  });

  it("ignores README.md", () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, "README.md"), "# Readme\n", "utf-8");
      absorbDropinSkills(dir);
      assert.ok(existsSync(join(dir, "README.md")), "README.md must not be absorbed");
      assert.ok(!existsSync(join(dir, "readme", "SKILL.md")));
    });
  });
});
