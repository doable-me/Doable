import { test } from "node:test";
import assert from "node:assert/strict";
import { isCorruptNodeModulesCrash } from "../dev-server-start.js";

// The real crash that motivated the recovery path: vite@6 ESM-imports
// tinyglobby, whose installed copy was left without index.mjs by an
// interrupted npm install.
const REAL_TINYGLOBBY_CRASH = `node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/services/api/projects/d19171d4/node_modules/tinyglobby/dist/index.mjs' imported from /app/services/api/projects/d19171d4/node_modules/vite/dist/node/cli.js
Did you mean to import "tinyglobby/dist/index.cjs"?
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)`;

test("detects the corrupt-node_modules crash signature (tinyglobby missing .mjs)", () => {
  assert.equal(isCorruptNodeModulesCrash(REAL_TINYGLOBBY_CRASH), true);
});

test("detects a Windows-style node_modules path", () => {
  const win = `Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\\\\app\\\\projects\\\\p1\\\\node_modules\\\\vite\\\\dist\\\\x.mjs' imported from ...`;
  assert.equal(isCorruptNodeModulesCrash(win), true);
});

test("does NOT match a user missing-import (Vite overlay, not a node_modules path)", () => {
  const userImport = `Failed to resolve import "./MissingComponent" from "src/App.tsx". Does the file exist?`;
  assert.equal(isCorruptNodeModulesCrash(userImport), false);
});

test("does NOT match esbuild Could-not-resolve (handled by the peer-dep installer)", () => {
  const esbuild = `X [ERROR] Could not resolve "lodash"\n  src/App.tsx:2:19`;
  assert.equal(isCorruptNodeModulesCrash(esbuild), false);
});

test("does NOT match ERR_MODULE_NOT_FOUND for a path OUTSIDE node_modules (user ESM file)", () => {
  const userEsm = `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/projects/p1/src/utils/missing.js' imported from /app/projects/p1/src/App.tsx`;
  assert.equal(isCorruptNodeModulesCrash(userEsm), false);
});

test("returns false on empty / unrelated output", () => {
  assert.equal(isCorruptNodeModulesCrash(""), false);
  assert.equal(isCorruptNodeModulesCrash("VITE v6.4.2 ready in 312 ms"), false);
});
