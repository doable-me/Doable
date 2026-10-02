import assert from "node:assert/strict";
import test from "node:test";
import {
  evictProjectSessions, projectSessionModes, projectSessionPrompts,
  projectSessionProviders, projectSessions,
} from "./session-state.js";

test("context invalidation clears prompt fingerprints for all project modes only", () => {
  const keys = ["context-project", "context-project:visual-edit", "unrelated-project"];
  const maps = [projectSessions, projectSessionModes, projectSessionProviders, projectSessionPrompts];
  try {
    for (const map of maps) for (const key of keys) map.set(key, "value");
    assert.equal(evictProjectSessions("context-project"), 2);
    for (const map of maps) {
      assert.equal(map.has("context-project"), false);
      assert.equal(map.has("context-project:visual-edit"), false);
      assert.equal(map.get("unrelated-project"), "value");
    }
  } finally {
    for (const map of maps) for (const key of keys) map.delete(key);
  }
});
