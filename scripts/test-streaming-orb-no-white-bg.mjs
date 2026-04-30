#!/usr/bin/env node
// Regression test: the "Live Streaming Glowing Orb" card shown during
// presentation creation (and other tool-streaming flows) must NOT use
// `bg-foreground/30`. In dark mode `--foreground` is near-white, which
// produced an ugly translucent white overlay on top of the dark chat.
//
// This static-source test guards against regressions of the fix that
// swapped the class to a theme-adaptive `bg-card/70 backdrop-blur-md`.
//
// Run: node scripts/test-streaming-orb-no-white-bg.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const target = resolve(root, "apps/web/src/app/editor/[projectId]/page.tsx");

const src = readFileSync(target, "utf8");

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

console.log("\n[test] streaming orb card — no white background regression\n");

// 1. The streaming orb card must exist and carry the testid.
const cardRe = /data-testid="streaming-orb-card"[^>]*className="([^"]+)"/;
const m = src.match(cardRe);
assert(!!m, "streaming-orb-card element exists with data-testid");

if (m) {
  const cls = m[1];
  assert(
    !/\bbg-foreground\/\d+/.test(cls),
    "card does not use bg-foreground/* (white-in-dark-mode antipattern)",
  );
  assert(
    /\bbg-card\b|\bbg-background\b|\bbg-muted\b/.test(cls),
    "card uses a theme-token background (bg-card / bg-background / bg-muted)",
  );
  assert(
    /\bborder-border\b/.test(cls),
    "card uses --border token for the border (theme-adaptive)",
  );
}

// 2. The headline inside the card must use a theme token, not text-white.
const headlineRe = /<h3 className="([^"]+)">\s*\{msg\.isStreaming/;
const h = src.match(headlineRe);
assert(!!h, "card headline <h3> exists");
if (h) {
  const cls = h[1];
  assert(
    !/\btext-white\b/.test(cls),
    "card headline does not hardcode text-white",
  );
  assert(
    /\btext-foreground\b/.test(cls),
    "card headline uses text-foreground (theme-adaptive)",
  );
}

console.log(failures === 0 ? "\nPASS\n" : `\nFAIL — ${failures} assertion(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
