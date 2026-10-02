import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptPlanSnapshot, planProgressState } from "./plan-state";
import type { Plan } from "@doable/shared/types/ai";
const base: Plan = {
  id: "p",
  projectId: "project",
  summary: "Plan",
  status: "approved",
  complexity: "simple",
  createdAt: "2026-01-01T00:00:00Z",
  revision: 3,
  steps: [
    { id: "a", order: 1, title: "A", description: "A", status: "pending" },
    { id: "b", order: 2, title: "B", description: "B", status: "pending" },
  ],
};
test("approved incomplete plans stop spinning when execution ends, without invented completion", () => {
  assert.equal(planProgressState(base, true).spinning, true);
  const idle = planProgressState(base, false);
  assert.equal(idle.spinning, false);
  assert.equal(idle.percentage, 0);
  assert.equal(idle.label, "Plan paused");
  assert.equal(idle.finished, false);
});
test("late snapshots and unrelated projects cannot reverse or replace current progress", () => {
  assert.equal(
    acceptPlanSnapshot(base, { ...base, revision: 2 }, "project"),
    base,
  );
  assert.equal(
    acceptPlanSnapshot(
      base,
      { ...base, projectId: "other", revision: 9 },
      "project",
    ),
    base,
  );
  assert.equal(
    acceptPlanSnapshot(
      base,
      { ...base, id: "older", createdAt: "2025-01-01T00:00:00Z" },
      "project",
    ),
    base,
  );
  const next = { ...base, revision: 4 };
  assert.equal(acceptPlanSnapshot(base, next, "project"), next);
});
test("out-of-order step completion measures results, never the current step index", () => {
  const p = {
    ...base,
    steps: [
      base.steps[0]!,
      { ...base.steps[1]!, status: "completed" as const },
    ],
  };
  assert.equal(planProgressState(p, true).percentage, 50);
});
test("failed steps remain unresolved; explicit skips and completed results finish a plan", () => {
  assert.equal(
    planProgressState(
      {
        ...base,
        steps: [{ ...base.steps[0]!, status: "failed" }, base.steps[1]!],
      },
      false,
    ).label,
    "Plan needs attention",
  );
  const p = {
    ...base,
    steps: [
      { ...base.steps[0]!, status: "skipped" as const },
      { ...base.steps[1]!, status: "completed" as const },
    ],
  };
  const display = planProgressState(p, true);
  assert.equal(display.finished, true);
  assert.equal(display.spinning, false);
  assert.equal(display.completed, 1);
  assert.equal(display.skipped, 1);
  assert.equal(display.percentage, 100);
});
