/**
 * Regression tests for the MCP output-shape capture (cache-warmer).
 *
 * Bug class this guards against: generated MCP-connected apps showed 0 data
 * despite the connector-proxy returning HTTP 200 with real data, because the
 * generator GUESSED response key names (read `data.cases` when the real key was
 * `openCases`; read `h.status` when the real field was `statusId`/`isActive`).
 *
 * The platform fix captures a REAL output shape per read-only tool at probe time
 * and injects it into the generation prompt. These tests lock in the three pure
 * helpers that make that generic + safe across ANY MCP server:
 *   - summarizeShape: compact, key-accurate, _meta-stripped shape summary
 *   - deriveSafeArgs: minimal args so required-param read tools can be sampled
 *   - isLikelyReadOnly: never sample a tool that looks like a mutation
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeShape,
  deriveSafeArgs,
  isLikelyReadOnly,
} from "../cache-warmer.js";
import type { McpToolDefinition } from "../types.js";

// Real HPCA Discovery `list_cases_and_folders` response (trimmed to structure).
const LIST_CASES_DATA = {
  _meta: { _instructions: "MANDATORY OUTPUT FORMAT — LEGAL INVESTIGATOR BRIEFING …" },
  pagination: { start: 0, limit: 50, totalCount: 54 },
  summary: { totalCases: 54 },
  openCases: [
    { name: "Case A", path: "/a", itemCount: 10, sizeLabel: "1 MB", status: "open", holdCount: 2, holdNames: ["h1"], _ref: {} },
  ],
  closedCases: [],
  folders: [],
};

// Real HPCA `query_holds` response (trimmed).
const QUERY_HOLDS_DATA = {
  queryType: "summary",
  _pagination: { totalCount: 50 },
  _summary: { totalHoldsInSystem: 50, activeHolds: 12 },
  holds: [
    { holdName: "Hold 1", description: "d", caseName: "Case A", statusId: 1, isActive: true, itemCount: 5, custodians: [], _ref: {} },
  ],
  nextSteps: ["a", "b", "c"],
  _meta: { _instructions: "…" },
};

test("summarizeShape surfaces the REAL container keys (openCases, not cases)", () => {
  const shape = summarizeShape(LIST_CASES_DATA);
  assert.match(shape, /openCases: array\[1\]/);
  assert.match(shape, /closedCases: array\[0\]/);
  assert.match(shape, /folders: array\[0\]/);
  // The bug: the generator guessed `cases`. There is NO top-level `cases` key.
  assert.doesNotMatch(shape, /(^|[^n])\bcases:/); // no bare `cases:` (openCases/closedCases ok)
  // _meta is LLM-only noise — must be stripped so it never pollutes the prompt.
  assert.doesNotMatch(shape, /_meta/);
});

test("summarizeShape descends into array items and keeps per-row field names", () => {
  const shape = summarizeShape(LIST_CASES_DATA);
  // openCases[0] field names must appear so the UI binds c.holdCount, not c.openHolds.
  assert.match(shape, /name: string/);
  assert.match(shape, /itemCount: number/);
  assert.match(shape, /holdCount: number/);
});

test("summarizeShape captures holds item fields (statusId/isActive, not status)", () => {
  const shape = summarizeShape(QUERY_HOLDS_DATA);
  assert.match(shape, /holds: array\[1\]/);
  assert.match(shape, /statusId: number/);
  assert.match(shape, /isActive: boolean/);
  assert.doesNotMatch(shape, /_meta/);
});

test("summarizeShape handles primitives, null, and empty objects", () => {
  assert.equal(summarizeShape(null), "null");
  assert.equal(summarizeShape(42), "number");
  assert.equal(summarizeShape("hi"), "string");
  assert.equal(summarizeShape(true), "boolean");
  assert.equal(summarizeShape([]), "array[0] of any");
  assert.equal(summarizeShape({}), "object");
});

test("deriveSafeArgs satisfies required enum params (query_holds.type → summary)", () => {
  const schema: McpToolDefinition["inputSchema"] = {
    type: "object",
    properties: {
      type: { type: "string", enum: ["summary", "links", "items"] },
      limit: { type: "number" },
    },
    required: ["type"],
  };
  const args = deriveSafeArgs(schema);
  assert.equal(args.type, "summary");
  assert.equal("limit" in args, false); // optional params omitted
});

test("deriveSafeArgs returns {} when nothing is required (list_cases_and_folders)", () => {
  const schema: McpToolDefinition["inputSchema"] = { type: "object", properties: {} };
  assert.deepEqual(deriveSafeArgs(schema), {});
});

test("deriveSafeArgs fills required scalars/default by type", () => {
  const schema: McpToolDefinition["inputSchema"] = {
    type: "object",
    properties: {
      n: { type: "number" },
      b: { type: "boolean" },
      s: { type: "string" },
      d: { type: "string", default: "X" },
    },
    required: ["n", "b", "s", "d"],
  };
  const args = deriveSafeArgs(schema);
  assert.equal(args.n, 1);
  assert.equal(args.b, false);
  assert.equal(args.s, "");
  assert.equal(args.d, "X");
});

function tool(name: string, annotations?: { readOnlyHint?: boolean }): McpToolDefinition {
  return { name, inputSchema: { type: "object" }, ...(annotations ? { annotations } : {}) } as McpToolDefinition;
}

test("isLikelyReadOnly samples reads, never mutations", () => {
  for (const n of ["list_cases_and_folders", "query_holds", "get_case_or_folder_details", "search_documents", "fetch_report", "count_items"]) {
    assert.equal(isLikelyReadOnly(tool(n)), true, `${n} should be sampled`);
  }
  for (const n of ["create_hold", "delete_case", "update_custodian", "release_hold", "send_email", "execute_query", "provision_db"]) {
    assert.equal(isLikelyReadOnly(tool(n)), false, `${n} must NOT be sampled`);
  }
});

test("isLikelyReadOnly respects explicit readOnlyHint annotation over the name", () => {
  // A read-named tool flagged as a write must NOT be sampled.
  assert.equal(isLikelyReadOnly(tool("get_thing", { readOnlyHint: false })), false);
  // A write-named tool explicitly flagged read-only MAY be sampled.
  assert.equal(isLikelyReadOnly(tool("run_report", { readOnlyHint: true })), true);
});
