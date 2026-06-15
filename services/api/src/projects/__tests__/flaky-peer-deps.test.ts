import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLAKY_PEER_DEPS,
  FLAKY_PREBUNDLE_TARGETS,
  requiredPeersForDeps,
  presentPrewarmTargets,
} from "../flaky-peer-deps.js";

test("recharts requires react-is (the motivating case)", () => {
  assert.deepEqual(FLAKY_PEER_DEPS.recharts, ["react-is"]);
});

test("FLAKY_PREBUNDLE_TARGETS is the de-duped union of parents + peers", () => {
  // react-is appears via multiple parents but must be listed once.
  const count = FLAKY_PREBUNDLE_TARGETS.filter((t) => t === "react-is").length;
  assert.equal(count, 1);
  assert.ok(FLAKY_PREBUNDLE_TARGETS.includes("recharts"));
  assert.ok(FLAKY_PREBUNDLE_TARGETS.includes("react-is"));
});

test("requiredPeersForDeps only returns peers for parents present in deps", () => {
  assert.deepEqual(requiredPeersForDeps({ recharts: "^2", react: "^19" }), ["react-is"]);
  assert.deepEqual(requiredPeersForDeps({ react: "^19", lodash: "^4" }), []);
  // multiple parents needing the same peer → de-duped
  assert.deepEqual(
    requiredPeersForDeps({ recharts: "^2", "react-redux": "^9" }),
    ["react-is"],
  );
});

test("presentPrewarmTargets intersects the registry with the project's deps", () => {
  assert.deepEqual(
    presentPrewarmTargets({ recharts: "^2", "react-is": "^19", react: "^19" }).sort(),
    ["react-is", "recharts"],
  );
  // never force-include a package the project doesn't have
  assert.deepEqual(presentPrewarmTargets({ react: "^19" }), []);
});
