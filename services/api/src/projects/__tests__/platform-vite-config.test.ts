import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlatformViteConfig } from "../vite-plugin-source-annotations.js";

// Regression guard for the async-config plugin-stripping bug.
//
// @lovable.dev/vite-tanstack-config (TanStack Start) default-exports
// `(env) => Promise<UserConfig>`. The old wrapper did
// `const base = unwrap(userConfig)` where unwrap only handled SYNC functions,
// so it spread an unawaited Promise (`{ ...promise }` === `{}`) and dropped
// every plugin (tanstackStart, react, tailwind) → blank preview. The wrapper
// must now resolve function/Promise/async configs by awaiting them.

for (const [label, opts] of [
  ["local/dev branch", {}],
  ["public-domain branch", { domain: "zantaz.doable.me" }],
] as const) {
  test(`platform config (${label}) is an async resolver that awaits the user config`, () => {
    const code = generatePlatformViteConfig("proj-123", opts);
    // Emits an async default export so Vite awaits the resolved config.
    assert.match(code, /export default async \(env\) =>/);
    // Calls the user config as a function with env, then awaits the result —
    // covering plain object, sync fn, async fn, and Promise shapes.
    assert.match(code, /if \(typeof cfg === "function"\) cfg = cfg\(env\);/);
    assert.match(code, /cfg = await cfg;/);
    assert.match(code, /const base = await resolveUserConfig\(env\)/);
    // The broken sync pattern must be gone.
    assert.doesNotMatch(code, /const base = unwrap\(/);
  });
}

test("public-domain branch still pins the relay HMR transport + base plugins survive merge", () => {
  const code = generatePlatformViteConfig("proj-xyz", { domain: "zantaz.doable.me" });
  // Platform HMR override is applied on top of the awaited base.
  assert.match(code, /protocol: "wss"/);
  assert.match(code, /clientPort: 443/);
  assert.match(code, /path: "\/preview\/proj-xyz\/__hmr"/);
  assert.match(code, /allowedHosts: true/);
  // base is spread FIRST so user plugins are preserved, then server/optimizeDeps overridden.
  assert.match(code, /\.\.\.base,/);
  assert.match(code, /exclude: \[\.\.\.\(base\.optimizeDeps\?\.exclude \?\? \[\]\), "@doable\/sdk", "@doable\/data"\]/);
});

test("public-domain branch does NOT pin hmr.host — falls back to the preview's own location.hostname", () => {
  // Regression for the cross-host HMR bug: hard-coding host to DOABLE_DOMAIN
  // (the publish apex) broke HMR on every install whose preview host differs
  // (subdomain / custom-domain). The generated config must NOT emit a `host:`
  // key in the hmr block, so Vite's client uses location.hostname (the exact
  // host that served the preview iframe) for the websocket — generic everywhere.
  const code = generatePlatformViteConfig("proj-xyz", { domain: "zantaz.doable.me" });
  assert.doesNotMatch(code, /host: "zantaz\.doable\.me"/);
  // No `host:` property inside the hmr transport block at all.
  const hmrBlock = code.slice(code.indexOf("hmr: {"), code.indexOf("path:", code.indexOf("hmr: {")) + 40);
  assert.doesNotMatch(hmrBlock, /\bhost:/);
  // Also true for the apex install — host is never pinned regardless of domain.
  const apex = generatePlatformViteConfig("proj-xyz", { domain: "doable.me" });
  assert.doesNotMatch(apex, /host: "doable\.me"/);
});
