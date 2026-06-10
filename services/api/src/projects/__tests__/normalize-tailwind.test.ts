import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cssTextUsesTailwindV4,
  parseMajor,
  rewritePostcssContent,
  canonicalPostcssConfig,
} from "../normalize-tailwind.js";

// ── v4 CSS detection ──────────────────────────────────────
test("detects Tailwind v4 single-import syntax", () => {
  assert.equal(cssTextUsesTailwindV4(`@import "tailwindcss";`), true);
  assert.equal(cssTextUsesTailwindV4(`@import 'tailwindcss';`), true);
});

test("detects v4 @theme / @custom-variant / @plugin directives", () => {
  assert.equal(cssTextUsesTailwindV4(`@theme {\n  --color-primary: red;\n}`), true);
  assert.equal(cssTextUsesTailwindV4(`@custom-variant dark (&:is(.dark *));`), true);
  assert.equal(cssTextUsesTailwindV4(`@plugin "@tailwindcss/typography";`), true);
});

test("does NOT flag classic Tailwind v3 directive CSS", () => {
  const v3 = `@tailwind base;\n@tailwind components;\n@tailwind utilities;`;
  assert.equal(cssTextUsesTailwindV4(v3), false);
});

test("does NOT flag plain CSS", () => {
  assert.equal(cssTextUsesTailwindV4(`body { margin: 0; }`), false);
  assert.equal(cssTextUsesTailwindV4(""), false);
});

// ── version parsing ───────────────────────────────────────
test("parseMajor handles common semver ranges", () => {
  assert.equal(parseMajor("^4.0.0"), 4);
  assert.equal(parseMajor("~3.4.19"), 3);
  assert.equal(parseMajor(">=4"), 4);
  assert.equal(parseMajor("4.3.0"), 4);
  assert.equal(parseMajor(undefined), null);
  assert.equal(parseMajor("latest"), null);
});

// ── PostCSS config rewrite ────────────────────────────────
test("rewrites the standard Lovable v3 ESM postcss config to v4 wholesale", () => {
  const v3 = `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
  const out = rewritePostcssContent(v3);
  assert.match(out, /@tailwindcss\/postcss/);
  assert.doesNotMatch(out, /^\s*tailwindcss:\s*\{\}/m); // bare tailwindcss key gone
  assert.match(out, /export default/); // module style preserved
});

test("rewrites the standard CJS postcss config preserving module.exports", () => {
  const v3 = `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
  const out = rewritePostcssContent(v3);
  assert.match(out, /@tailwindcss\/postcss/);
  assert.match(out, /module\.exports/);
});

test("is a no-op when already on @tailwindcss/postcss", () => {
  const v4 = `export default { plugins: { "@tailwindcss/postcss": {} } };\n`;
  assert.equal(rewritePostcssContent(v4), v4);
});

test("preserves non-default plugins via targeted swap", () => {
  const custom = `export default {\n  plugins: {\n    tailwindcss: {},\n    "postcss-nesting": {},\n    autoprefixer: {},\n  },\n};\n`;
  const out = rewritePostcssContent(custom);
  assert.match(out, /@tailwindcss\/postcss/);
  assert.match(out, /postcss-nesting/); // user plugin kept
});

test("canonicalPostcssConfig emits the right module style", () => {
  assert.match(canonicalPostcssConfig(true), /export default/);
  assert.match(canonicalPostcssConfig(false), /module\.exports/);
  assert.match(canonicalPostcssConfig(true), /@tailwindcss\/postcss/);
});
