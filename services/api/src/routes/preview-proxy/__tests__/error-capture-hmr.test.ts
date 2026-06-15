import { test } from "node:test";
import assert from "node:assert/strict";
import { ERROR_CAPTURE_SNIPPET } from "../injected-scripts.js";

// Regression for the HMR-error auto-fix loop.
//
// The preview's error-capture forwards uncaught errors to the editor's auto-fix
// loop. Vite's HMR client logs "failed to connect to websocket" whenever its
// live-reload socket can't reach the dev server — pure transport noise, never an
// app-code defect. It used to be suppressed ONLY when the app was mounted
// (`HMR_WS_RE.test(msg) && appMounted()`), so a PERMANENTLY-failing HMR socket
// (e.g. a misrouted relay) leaked through while the preview was briefly unmounted
// — and the model looped "deploy a fresh preview" forever. It must now be dropped
// UNCONDITIONALLY.

test("HMR websocket errors are dropped from the auto-fix loop unconditionally", () => {
  // The drop must NOT be gated on appMounted() anymore.
  assert.doesNotMatch(
    ERROR_CAPTURE_SNIPPET,
    /HMR_WS_RE\.test\(String\(msg\)\)\s*&&\s*appMounted\(\)/,
  );
  // It IS dropped the moment the message matches the HMR transport pattern.
  assert.match(
    ERROR_CAPTURE_SNIPPET,
    /if \(msg && HMR_WS_RE\.test\(String\(msg\)\)\) return;/,
  );
});

test("HMR_WS_RE still covers the canonical Vite transport messages", () => {
  // The regex literal lives inside the injected snippet string; assert the key
  // alternatives are present so the suppression keeps matching real Vite output.
  assert.match(ERROR_CAPTURE_SNIPPET, /failed to connect to websocket/);
  assert.match(ERROR_CAPTURE_SNIPPET, /server connection lost/);
});
