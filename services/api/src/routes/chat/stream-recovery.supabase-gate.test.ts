/**
 * Regression test for Supabase issue #2: the build auto-continue race.
 *
 * `provision_supabase` only OPENS the Connect-Supabase dialog and returns — the
 * DB connection isn't live until the user completes it. Previously, after the
 * model called provision_supabase and (correctly) ended its turn,
 * handleAutoContinue would nudge "continue building NOW". With Supabase still
 * unconnected, the race-guard blocks @supabase/supabase-js but NOT @doable/data,
 * so the model fell back to the per-app PGlite DB and built the whole app in the
 * wrong database — the first prompt missed Supabase.
 *
 * The fix sets state.awaitingSupabaseProvision = true when provision_supabase
 * runs, and handleAutoContinue returns immediately when that flag is set (same
 * pattern as awaitingMcpWidget). These tests drive handleAutoContinue directly
 * and assert engine.sendMessage is NOT called when the flag is set, and IS
 * called in the otherwise-identical control where it isn't.
 *
 * Uses node:test (vitest isn't installed in this workspace).
 * Run: pnpm tsx --test services/api/src/routes/chat/stream-recovery.supabase-gate.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import { handleAutoContinue } from "./stream-recovery.js";
import { createInitialState } from "./types.js";
import type { ChatStreamState } from "./types.js";

// Minimal stream stub — handleAutoContinue only ever calls writeSSE.
function makeStream() {
  const frames: unknown[] = [];
  return {
    frames,
    stream: {
      writeSSE: async (f: unknown) => {
        frames.push(f);
      },
    } as unknown as import("hono/streaming").SSEStreamingApi,
  };
}

// Engine stub that records whether the auto-continue nudge was sent.
function makeEngine() {
  const calls: string[] = [];
  return {
    calls,
    engine: {
      sendMessage: async (_sessionId: string, prompt: string) => {
        calls.push(prompt);
        // Return without emitting events — the loop will re-evaluate and, since
        // still no file-write tool calls were recorded, would continue. To keep
        // the control test bounded we throw after the first call so the loop's
        // catch breaks out. (The assertion only needs "was it called once".)
        throw new Error("stop-after-first-nudge");
      },
    } as unknown as import("../../ai/providers/copilot.js").CopilotEngine,
  };
}

/** A state that, on its own, WOULD trigger auto-continue: the model called a
 *  non-file-write tool (provision_supabase) on a build-intent prompt. */
function buildIntentStateWithToolCall(): ChatStreamState {
  const state = createInitialState();
  state.hadToolCalls = true;
  state.assistantToolCalls = [{ name: "provision_supabase", arguments: { name: "my-app" } }];
  return state;
}

const BUILD_PROMPT = "Build me a notes app using Supabase to store the notes";

test("auto-continue is SKIPPED while a Supabase provision dialog is pending", async () => {
  const { stream } = makeStream();
  const { engine, calls } = makeEngine();
  const state = buildIntentStateWithToolCall();
  state.awaitingSupabaseProvision = true; // the fix

  await handleAutoContinue(
    stream,
    state,
    engine,
    "session-1",
    "project-deadbeef",
    "build",
    () => {},
    BUILD_PROMPT,
  );

  assert.equal(
    calls.length,
    0,
    "engine.sendMessage must NOT be called — auto-continue must wait for the user to finish the Connect-Supabase dialog",
  );
});

test("control: auto-continue DOES fire for the same state when no provision is pending", async () => {
  const { stream } = makeStream();
  const { engine, calls } = makeEngine();
  const state = buildIntentStateWithToolCall();
  state.awaitingSupabaseProvision = false; // baseline — gate open

  await handleAutoContinue(
    stream,
    state,
    engine,
    "session-2",
    "project-cafebabe",
    "build",
    () => {},
    BUILD_PROMPT,
  );

  assert.equal(
    calls.length,
    1,
    "engine.sendMessage must be called exactly once — proves the skip in the other test is caused by the provision gate, not by unrelated conditions",
  );
  assert.match(
    calls[0] ?? "",
    /continue building/i,
    "the nudge prompt should be the build-continue nudge",
  );
});

test("the awaitingMcpWidget gate still skips auto-continue (unchanged behaviour)", async () => {
  const { stream } = makeStream();
  const { engine, calls } = makeEngine();
  const state = buildIntentStateWithToolCall();
  state.awaitingMcpWidget = true;

  await handleAutoContinue(
    stream,
    state,
    engine,
    "session-3",
    "project-feedface",
    "build",
    () => {},
    BUILD_PROMPT,
  );

  assert.equal(calls.length, 0, "awaitingMcpWidget must still short-circuit auto-continue");
});
