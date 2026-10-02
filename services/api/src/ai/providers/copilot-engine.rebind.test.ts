import assert from "node:assert/strict";
import test from "node:test";
import { CopilotEngine } from "./copilot-engine.js";
import type { CopilotSessionConfig } from "../engine-types.js";

test("cached session callbacks target the current turn, not its original stream", async () => {
  const engine = new CopilotEngine();
  const calls: string[] = [];
  const config: Partial<CopilotSessionConfig> = {
    toolProgress: { onToolEnd: () => { calls.push("old"); } },
  };
  // Represents the config captured by the SDK hook at create/resume time.
  const hook = () => config.toolProgress?.onToolEnd?.("read_file", {}, {});
  const internals = engine as unknown as {
    sessionConfigs: Map<string, Partial<CopilotSessionConfig>>;
    engines: Map<string, unknown>;
  };
  internals.sessionConfigs.set("cached", config);
  internals.engines.set("cached", {});
  assert.equal(engine.bindToolProgress("missing", {}), false);
  assert.equal(engine.bindToolProgress("cached", {
    onToolEnd: () => { calls.push("current"); },
  }), true);
  await hook();
  assert.deepEqual(calls, ["current"]);
  internals.engines.delete("cached");
  assert.equal(engine.bindToolProgress("cached", {}), false);
});

test("recovery cancellation waits for SDK acknowledgement and propagates failures", async () => {
  const engine = new CopilotEngine();
  const engines = (engine as unknown as { engines: Map<string, unknown> }).engines;
  let acknowledge!: () => void;
  engines.set("busy", {abort: () => new Promise<void>(resolve => { acknowledge = resolve; })});
  let settled = false;
  const pending = engine.quiesceSession("busy").then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  acknowledge(); await pending; assert.equal(settled, true);
  engines.set("failed", {abort: async () => { throw new Error("SDK cancellation failed"); }});
  await assert.rejects(engine.quiesceSession("failed"), /SDK cancellation failed/);
  await assert.rejects(engine.quiesceSession("missing"), /not found/);
});
