import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "./types.js";
import { finalizeLeadingResponse } from "./final-response.js";

const answer = "这是一个空白 React 项目。可以添加业务页面。没有修改文件。";

test("final answer after read-only tools becomes persisted content", () => {
  const state = createInitialState();
  state.hadToolCalls = true;
  state.assistantThinking = "Earlier tool planning.\n" + answer;
  state.leadingTextBuffer = answer;
  assert.equal(finalizeLeadingResponse(state), answer);
  assert.equal(state.assistantContent, answer);
  assert.equal(state.assistantThinking, "Earlier tool planning.\n");
  assert.equal(state.leadingTextBuffer, "");
  assert.equal(
    finalizeLeadingResponse(state),
    "",
    "finalization is idempotent",
  );
});

test("direct answers still work without tools", () => {
  const state = createInitialState();
  state.assistantThinking = state.leadingTextBuffer = answer;
  assert.equal(finalizeLeadingResponse(state), answer);
  assert.equal(state.assistantThinking, "");
});

test("explicit reasoning without a plain-text final segment stays private", () => {
  const state = createInitialState();
  state.hadToolCalls = true;
  state.assistantThinking = "Native reasoning only";
  assert.equal(finalizeLeadingResponse(state), "");
  assert.equal(state.assistantContent, "");
  assert.equal(state.assistantThinking, "Native reasoning only");
});

test("a deferred stream error does not promote an unfinished segment", () => {
  const state = createInitialState();
  state.assistantThinking = state.leadingTextBuffer = "I still need to inspect";
  state.deferredError = "Request timed out";
  assert.equal(finalizeLeadingResponse(state), "");
  assert.equal(state.assistantContent, "");
  assert.equal(state.assistantThinking, "I still need to inspect");
});

test("later native reasoning is preserved rather than removed as a suffix", () => {
  const state = createInitialState();
  state.hadToolCalls = true;
  state.leadingTextBuffer = answer;
  state.assistantThinking =
    "Earlier reasoning. " + answer + " Later reasoning.";
  assert.equal(finalizeLeadingResponse(state), answer);
  assert.equal(state.assistantThinking, "Earlier reasoning.  Later reasoning.");
});

test("previous visible content is retained", () => {
  const state = createInitialState();
  state.assistantContent = "Existing answer. ";
  state.assistantThinking = state.leadingTextBuffer = answer;
  assert.equal(finalizeLeadingResponse(state), answer);
  assert.equal(state.assistantContent, "Existing answer. " + answer);
});

test("unmatched/interleaved reasoning is conservatively left untouched", () => {
  const state = createInitialState();
  state.leadingTextBuffer = "Hello world";
  state.assistantThinking = "Hello native reasoning world";
  assert.equal(finalizeLeadingResponse(state), "");
  assert.equal(state.assistantContent, "");
});
