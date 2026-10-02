import assert from "node:assert/strict";
import { test } from "node:test";
import { planToMarkdown, revisedSteps, isStepStatus } from "./plan-state.js";
import { selectModeTools } from "./plan-tool-policy.js";
const old = [
  {
    id: "a",
    order: 1,
    title: "A",
    description: "A",
    status: "completed" as const,
    details: "Verified",
    filePaths: ["src/A.tsx"],
  },
  {
    id: "b",
    order: 2,
    title: "B",
    description: "B",
    status: "in_progress" as const,
  },
];
test("reordering/renaming retains stable identity, checked result and metadata", () => {
  const next = revisedSteps(old, [
    { ...old[1]!, order: 1 },
    { id: "a", order: 2, title: "A revised", description: "A" },
    { id: "c", order: 3, title: "C", description: "C" },
  ]);
  assert.deepEqual(
    next.map((s) => [s.id, s.order, s.status]),
    [
      ["b", 1, "in_progress"],
      ["a", 2, "completed"],
      ["c", 3, "pending"],
    ],
  );
  assert.equal(next[1]?.details, "Verified");
  assert.deepEqual(next[1]?.filePaths, ["src/A.tsx"]);
});
test("duplicate IDs fail before any persistence", () =>
  assert.throws(() => revisedSteps(old, [old[0]!, old[0]!]), /Duplicate/));
test("the model receives stable step IDs, revision and recovery/reporting rules", () => {
  const md = planToMarkdown({
    id: "p",
    projectId: "project",
    summary: "Plan",
    complexity: "simple",
    status: "approved",
    revision: 7,
    createdAt: new Date().toISOString(),
    steps: old,
  });
  assert.match(md, /Plan ID: p/);
  assert.match(md, /Step ID: a/);
  assert.match(md, /Revision: 7/);
  assert.match(md, /get_plan/);
  assert.match(md, /finished chat turn does not complete/);
});
test("execution exposes progress tools; plan mode never exposes progress writes, even with a legacy DB list", () => {
  const tools = [
    "create_plan",
    "ask_clarification",
    "get_plan",
    "mark_step_complete",
    "update_plan",
    "edit_file",
  ].map((name) => ({ name }));
  assert.deepEqual(
    selectModeTools(tools, "agent").map((t) => t.name),
    ["get_plan", "mark_step_complete", "update_plan", "edit_file"],
  );
  assert.deepEqual(
    selectModeTools(tools, "plan", new Set(tools.map((t) => t.name))).map(
      (t) => t.name,
    ),
    ["create_plan", "ask_clarification", "get_plan", "edit_file"],
  );
  assert.deepEqual(
    selectModeTools(tools, "agent", new Set(["edit_file"])).map((t) => t.name),
    ["edit_file"],
  );
});
test("invalid statuses cannot pass the reporting boundary", () => {
  assert.equal(isStepStatus("failed"), true);
  assert.equal(isStepStatus("done"), false);
  assert.equal(isStepStatus(undefined), false);
});
