/**
 * Regression tests for the generic missing-package auto-install extractor.
 *
 * Bug class: a generated/edited app imports an npm package that isn't installed
 * (e.g. `import { BrowserRouter } from "react-router-dom"` added by a LIVE file
 * edit after the dev server is already up). Vite answers the failing module
 * request with an HTTP 500 `Failed to resolve import "react-router-dom"` — which
 * the preview-proxy sees and feeds here. The extractor must pull the REAL npm
 * package name out of BOTH Vite diagnostics, for ANY package (not a hardcoded
 * allowlist), while never mistaking a relative import or the link-sdk'd
 * @doable/* scope for an installable dep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractUnresolvedPackages } from "../dev-server-start.js";

test("extracts a bare package from Vite's import-analysis 500", () => {
  const out = `Failed to resolve import "react-router-dom" from "src/App.tsx". Does the file exist?`;
  assert.deepEqual(extractUnresolvedPackages(out), ["react-router-dom"]);
});

test("extracts a package from esbuild's optimizeDeps diagnostic", () => {
  const out = `✘ [ERROR] Could not resolve "axios"`;
  assert.deepEqual(extractUnresolvedPackages(out), ["axios"]);
});

test("extracts from Vite's JSON-escaped HTTP 500 error body (the proxy path)", () => {
  // Vite serves the failing module request as an HTML 500 whose message is a
  // JSON string literal — the quotes around the pkg are backslash-escaped.
  const body =
    `<script type="module">const error = {"message":"Failed to resolve import \\"react-vertical-timeline-component\\" from \\"src/App.tsx\\". Does the file exist?","id":"/work/src/App.tsx"};</script>`;
  assert.deepEqual(extractUnresolvedPackages(body), [
    "react-vertical-timeline-component",
  ]);
});

test("extracts an escaped esbuild 'Could not resolve' too", () => {
  const body = `{"message":"Could not resolve \\"lodash-es\\""}`;
  assert.deepEqual(extractUnresolvedPackages(body), ["lodash-es"]);
});

test("extracts scoped packages and a subpath's package root", () => {
  const out = [
    `Failed to resolve import "@tanstack/react-query" from "src/api.ts".`,
    `Failed to resolve import "lodash/debounce" from "src/util.ts".`,
  ].join("\n");
  const got = extractUnresolvedPackages(out);
  assert.ok(got.includes("@tanstack/react-query"));
  // `lodash/debounce` is a subpath — the capture is the full specifier; npm can
  // install it (it resolves to the lodash package), and NPM_PKG_NAME_RE permits
  // the scoped form only, so a deep path like this is filtered. Either way no
  // relative path leaks through.
  assert.ok(!got.some((p) => p.startsWith(".")));
});

test("is GENERIC — works for an arbitrary package name, not a fixed list", () => {
  const out = `Failed to resolve import "some-obscure-pkg-xyz" from "src/x.ts".`;
  assert.deepEqual(extractUnresolvedPackages(out), ["some-obscure-pkg-xyz"]);
});

test("never treats a relative import as an installable package", () => {
  const out = `Failed to resolve import "./MissingComponent" from "src/App.tsx".`;
  assert.deepEqual(extractUnresolvedPackages(out), []);
});

test("never auto-installs the link-sdk'd @doable/* scope", () => {
  const out = `Failed to resolve import "@doable/data" from "src/db.ts".`;
  assert.deepEqual(extractUnresolvedPackages(out), []);
});

test("dedups when the same package fails in several files", () => {
  const out = [
    `Failed to resolve import "dayjs" from "src/A.tsx".`,
    `Failed to resolve import "dayjs" from "src/B.tsx".`,
    `Could not resolve "dayjs"`,
  ].join("\n");
  assert.deepEqual(extractUnresolvedPackages(out), ["dayjs"]);
});

test("returns [] for clean output", () => {
  assert.deepEqual(extractUnresolvedPackages("ready in 312 ms"), []);
});
