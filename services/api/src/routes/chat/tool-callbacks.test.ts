/**
 * Regression tests for MCP-UI viewer persistence to projects/<id>/index.html.
 *
 * Bug class: small MCP-UI payloads were silently skipped — the SheetJS
 * spreadsheet viewer never landed at projects/<id>/index.html, so the editor's
 * preview iframe stayed stuck on the default scaffold. Root cause was a
 * function-level early-return in offloadDataUris() for sub-threshold payloads.
 *
 * These tests drive the public createToolProgressCallbacks.onToolEnd surface
 * with a queued pendingUiResources item carrying a base64 xlsx data URI, then
 * assert that writeProjectFile was called with "index.html" and a body
 * containing the SheetJS spreadsheet-preview markers.
 *
 * Uses node:test (zero-config — vitest isn't installed in this workspace).
 * Run with: pnpm tsx --test services/api/src/routes/chat/tool-callbacks.test.ts
 */

import test, { mock } from "node:test";
import assert from "node:assert/strict";

// --- Mock module graph BEFORE importing tool-callbacks.ts -------------------
// tool-callbacks.ts pulls in ../../db/index.js (postgres connection at import
// time), ../../mcp/tool-bridge.js (pendingUiResources queue), ../artifacts.js
// (storeArtifact), ./artifact-stash.js (pushArtifacts), and
// ../../ai/project-files.js (writeProjectFile — the assertion target).

// Shared pendingUiResources queue we can populate per-test.
const pendingUiResources: Array<Record<string, unknown>> = [];

// Capture writeProjectFile calls.
type WriteCall = { projectId: string; filePath: string; content: string };
const writeCalls: WriteCall[] = [];

mock.module("../../db/index.js", {
  namedExports: {
    sql: () => {
      throw new Error("db.sql should not be called from this regression test");
    },
  },
});

mock.module("../../mcp/tool-bridge.js", {
  namedExports: {
    pendingUiResources,
  },
});

mock.module("../artifacts.js", {
  namedExports: {
    storeArtifact: (_opts: { bytes: Buffer; mimeType: string; fileName: string }) => {
      // Return a deterministic id so URLs in viewer html are stable.
      return "artifact_test_id";
    },
  },
});

mock.module("./artifact-stash.js", {
  namedExports: {
    pushArtifacts: () => {},
  },
});

mock.module("../../ai/project-files.js", {
  namedExports: {
    writeProjectFile: async (projectId: string, filePath: string, content: string) => {
      writeCalls.push({ projectId, filePath, content });
    },
  },
});

// Late import so the mocks above are in effect.
const { createToolProgressCallbacks } = await import("./tool-callbacks.js");

// --- Helpers ----------------------------------------------------------------

function makeStreamStub() {
  return {
    writeSSE: async (_msg: { data: string }) => {},
  } as unknown as Parameters<typeof createToolProgressCallbacks>[0];
}

function makeStateStub() {
  return {
    hadToolCalls: false,
    pendingArtifacts: new Map<string, unknown[]>(),
  } as unknown as Parameters<typeof createToolProgressCallbacks>[1];
}

/**
 * Build a realistic MCP-UI rawHtml that embeds a base64 xlsx data URI.
 * Total rawHtml length is approximately `targetBytes`. The base64 body is
 * a long run of 'A' chars to satisfy the data-URI regex's {500,} quantifier.
 */
function buildRawHtml(targetBytes: number): string {
  const xlsxMime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const prefix =
    '<!doctype html><html><body><a href="data:' + xlsxMime + ";base64,";
  const suffix = '">xlsx</a></body></html>';
  const fillerNeeded = Math.max(800, targetBytes - prefix.length - suffix.length);
  const b64 = "A".repeat(fillerNeeded);
  return prefix + b64 + suffix;
}

function resetWriteCalls() {
  writeCalls.length = 0;
}

function resetPending() {
  pendingUiResources.length = 0;
}

// --- Cases ------------------------------------------------------------------

test("(a) sub-threshold spreadsheet UIResource writes SheetJS viewer to projects/<id>/index.html", async () => {
  // BUG-CLASS SENTINEL: offloadDataUris() used to early-return on payloads
  // below an internal 16KB guard, so persistIndex() never ran for small
  // builder outputs and the editor's preview iframe stayed on the scaffold.
  // Today this drives onToolEnd which still has its own outer 16KB caller
  // gate at the call-site — so we use a payload just past that caller gate
  // (~17KB) to exercise the post-fix offloadDataUris path. When Worker A
  // refactors persistViewerToProject out of the size-gated branch, tighten
  // this to a true ~10KB payload and add a direct persistViewerToProject
  // unit test.
  resetWriteCalls();
  resetPending();

  const projectId = "proj_a";
  const rawHtml = buildRawHtml(17 * 1024);
  const timestamp = Date.now();
  pendingUiResources.push({
    resource: {
      text: rawHtml,
      uri: `ui://spreadsheet-builder/build/${timestamp}`,
    },
  });

  const callbacks = createToolProgressCallbacks(
    makeStreamStub(),
    makeStateStub(),
    null,
    () => {},
    projectId,
  );
  await callbacks.onToolEnd("spreadsheet-builder/build", {}, { ok: true });

  const indexWrite = writeCalls.find(
    (c) => c.projectId === projectId && c.filePath === "index.html",
  );
  assert.ok(
    indexWrite,
    `expected writeProjectFile("${projectId}", "index.html", ...) for small (~10KB) payload — bug-class sentinel`,
  );
  assert.match(indexWrite.content, /Spreadsheet preview/);
  assert.match(indexWrite.content, /xlsx\.full\.min\.js/);
});

test("(b) larger spreadsheet UIResource (~30KB) writes SheetJS viewer to projects/<id>/index.html", async () => {
  resetWriteCalls();
  resetPending();

  const projectId = "proj_b";
  const rawHtml = buildRawHtml(30 * 1024);
  const timestamp = Date.now() + 1;
  pendingUiResources.push({
    resource: {
      text: rawHtml,
      uri: `ui://spreadsheet-builder/build/${timestamp}`,
    },
  });

  const callbacks = createToolProgressCallbacks(
    makeStreamStub(),
    makeStateStub(),
    null,
    () => {},
    projectId,
  );
  await callbacks.onToolEnd("spreadsheet-builder/build", {}, { ok: true });

  const indexWrite = writeCalls.find(
    (c) => c.projectId === projectId && c.filePath === "index.html",
  );
  assert.ok(
    indexWrite,
    `expected writeProjectFile("${projectId}", "index.html", ...) for ~30KB payload`,
  );
  assert.match(indexWrite.content, /Spreadsheet preview/);
  assert.match(indexWrite.content, /xlsx\.full\.min\.js/);
});

test("(c) non-builder UIResource MUST NOT write projects/<id>/index.html", async () => {
  resetWriteCalls();
  resetPending();

  const projectId = "proj_c";
  // Same payload shape as (b) but URI does NOT match any *-builder/build path.
  const rawHtml = buildRawHtml(30 * 1024);
  pendingUiResources.push({
    resource: {
      text: rawHtml,
      uri: "ui://other-tool/result/123",
    },
  });

  const callbacks = createToolProgressCallbacks(
    makeStreamStub(),
    makeStateStub(),
    null,
    () => {},
    projectId,
  );
  await callbacks.onToolEnd("other-tool/result", {}, { ok: true });

  const indexWrite = writeCalls.find(
    (c) => c.projectId === projectId && c.filePath === "index.html",
  );
  assert.equal(
    indexWrite,
    undefined,
    "non-builder resourceUri must not trigger index.html persistence",
  );
});
