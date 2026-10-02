import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintSystemPrompt, reuseSessionWithPrompt, systemMessageConfig } from "./session-prompt.js";

test("replacement preserves Chinese instructions and machine contracts verbatim", () => {
  const prompt = "You are Doable's assistant. 默认中文；继续已批准计划。\n" +
    "report_task_status: read_only | change; waiting_for_input\n" +
    "import { db } from '@doable/data'; .doable/plan.md";
  assert.deepEqual(systemMessageConfig(prompt), {
    systemMessage: { mode: "replace", content: prompt },
  });
  assert.notEqual(fingerprintSystemPrompt(prompt), fingerprintSystemPrompt(prompt.replace("默认中文", "English")));
  assert.equal(fingerprintSystemPrompt(prompt), fingerprintSystemPrompt(prompt));
});

test("omitted prompt keeps SDK defaults; explicit empty prompt clears old instructions", () => {
  assert.deepEqual(systemMessageConfig(undefined), {});
  assert.deepEqual(systemMessageConfig(""), {
    systemMessage: { mode: "replace", content: "" },
  });
});

test("unchanged cached prompt only binds callbacks for the current turn", async () => {
  let bindings = 0;
  const fingerprint = fingerprintSystemPrompt("Answer in the user's language.");
  const id = await reuseSessionWithPrompt({
    sessionId: "existing-history",
    previousFingerprint: fingerprint,
    nextFingerprint: fingerprint,
    bindCurrentTurn: () => { bindings++; return true; },
    resumeCurrentPrompt: async () => { assert.fail("unchanged prompt must not reconnect"); },
  });
  assert.equal(id, "existing-history");
  assert.equal(bindings, 1);
});

test("changed instructions resume the existing history with the new prompt", async () => {
  const history = ["Build a staff directory", "Created src/App.tsx", "继续"];
  const sessions = new Map([["existing-history", history]]);
  const next = "Use Simplified Chinese. Do not change existing data.";
  let observedPrompt = "";
  const id = await reuseSessionWithPrompt({
    sessionId: "existing-history",
    previousFingerprint: fingerprintSystemPrompt("Use English."),
    nextFingerprint: fingerprintSystemPrompt(next),
    bindCurrentTurn: () => { assert.fail("stale instructions must not be reused"); },
    resumeCurrentPrompt: async (sessionId) => {
      assert.equal(sessions.get(sessionId), history);
      observedPrompt = systemMessageConfig(next).systemMessage!.content;
      return sessionId;
    },
  });
  assert.equal(id, "existing-history");
  assert.equal(observedPrompt, next);
  assert.deepEqual(sessions.get(id!), history);
});

test("file-list/context changes refresh the same session instead of discarding its history", async () => {
  const seen: string[] = [];
  let previous = "Current project files:\nsrc/App.tsx";
  for (const file of ["src/components/Employee.tsx", "src/components/Payroll.tsx"]) {
    const next = `${previous}\n${file}`;
    const id = await reuseSessionWithPrompt({
      sessionId: "existing-history",
      previousFingerprint: fingerprintSystemPrompt(previous),
      nextFingerprint: fingerprintSystemPrompt(next),
      bindCurrentTurn: () => { assert.fail("new project context needs refresh"); },
      resumeCurrentPrompt: async (sessionId) => { seen.push(sessionId); return sessionId; },
    });
    assert.equal(id, "existing-history");
    previous = next;
  }
  assert.deepEqual(seen, ["existing-history", "existing-history"]);
});

test("a cached session without a recorded prompt is refreshed once", async () => {
  let refreshed = false;
  assert.equal(await reuseSessionWithPrompt({
    sessionId: "legacy-history",
    previousFingerprint: undefined,
    nextFingerprint: fingerprintSystemPrompt("Current instructions"),
    bindCurrentTurn: () => { assert.fail("unknown prompt must not be trusted"); },
    resumeCurrentPrompt: async (id) => { refreshed = true; return id; },
  }), "legacy-history");
  assert.equal(refreshed, true);
});

test("refresh failure propagates without sending under stale instructions", async () => {
  const failure = new Error("provider unavailable");
  await assert.rejects(reuseSessionWithPrompt({
    sessionId: "existing-history",
    previousFingerprint: fingerprintSystemPrompt("Old instructions"),
    nextFingerprint: fingerprintSystemPrompt("Current instructions"),
    bindCurrentTurn: () => { assert.fail("must not bind stale session"); },
    resumeCurrentPrompt: async () => { throw failure; },
  }), (error) => error === failure);
});

test("a recycled engine with unchanged instructions falls through to persisted-session recovery", async () => {
  assert.equal(await reuseSessionWithPrompt({
    sessionId: "existing-history",
    previousFingerprint: "same",
    nextFingerprint: "same",
    bindCurrentTurn: () => false,
    resumeCurrentPrompt: async () => { assert.fail("normal engine-loss recovery owns this path"); },
  }), undefined);
});
