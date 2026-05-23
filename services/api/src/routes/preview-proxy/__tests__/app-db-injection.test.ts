/**
 * US-013b: the preview/published bridge delivers the per-app-DB token + a data
 * client to generated apps via the SAME mechanism as the connector bridge (no
 * %%PROJECT_JWT%% static placeholder — this codebase injects the token at
 * serve time through CONNECTOR_BRIDGE_SNIPPET).
 *
 * Run: pnpm exec tsx --test services/api/src/routes/preview-proxy/__tests__/app-db-injection.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONNECTOR_BRIDGE_SNIPPET } from "../injected-scripts.js";

test("bridge sets window.__DOABLE_DATA_TOKEN when the project token arrives", () => {
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /window\.__DOABLE_DATA_TOKEN\s*=\s*t/);
});

test("bridge exposes window.__doable.db with query + schema", () => {
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /window\.__doable\.db\s*=\s*\{/);
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /query:\s*function/);
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /schema:\s*function/);
});

test("data client posts to /__doable/data/* with the data-api header", () => {
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /\/__doable\/data\/" \+ verb/);
  assert.match(CONNECTOR_BRIDGE_SNIPPET, /"x-doable-data-api": "1"/);
});
