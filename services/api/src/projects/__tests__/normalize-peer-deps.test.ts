import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePackageEntry,
  peerInstallSpec,
  parseMajor,
} from "../normalize-peer-deps.js";

// ── resolvePackageEntry: corruption detection (the empty/garbage stub) ──

test("resolvePackageEntry returns null for a corrupt/empty manifest", () => {
  assert.equal(resolvePackageEntry(""), null); // empty file (the hand-stub bug)
  assert.equal(resolvePackageEntry("{ not json"), null);
  assert.equal(resolvePackageEntry("null"), null);
  assert.equal(resolvePackageEntry(JSON.stringify({ version: "19.0.0" })), null); // no name
});

test("resolvePackageEntry resolves main/module/exports, falling back to index.js", () => {
  assert.equal(resolvePackageEntry(JSON.stringify({ name: "x", main: "lib/x.js" })), "lib/x.js");
  assert.equal(resolvePackageEntry(JSON.stringify({ name: "x", module: "esm/x.js" })), "esm/x.js");
  assert.equal(resolvePackageEntry(JSON.stringify({ name: "x" })), "index.js");
  assert.equal(
    resolvePackageEntry(JSON.stringify({ name: "x", exports: "./e.js" })),
    "./e.js",
  );
  assert.equal(
    resolvePackageEntry(JSON.stringify({ name: "x", exports: { ".": { import: "./i.js", require: "./r.js" } } })),
    "./i.js",
  );
});

// ── peerInstallSpec: react-is must match React's major ──

test("peerInstallSpec pins react-is to the project's React major", () => {
  assert.equal(peerInstallSpec("react-is", { react: "^19.0.0" }), "react-is@^19");
  assert.equal(peerInstallSpec("react-is", { "react-dom": "~18.3.1" }), "react-is@^18");
  // unknown react → latest (don't guess a wrong major)
  assert.equal(peerInstallSpec("react-is", {}), "react-is@latest");
});

test("peerInstallSpec installs other peers at latest", () => {
  assert.equal(peerInstallSpec("some-lib", { react: "^19" }), "some-lib@latest");
});

test("parseMajor extracts the leading major from a semver range", () => {
  assert.equal(parseMajor("^19.0.0"), 19);
  assert.equal(parseMajor("~18.3.1"), 18);
  assert.equal(parseMajor(">=17"), 17);
  assert.equal(parseMajor(undefined), null);
});
