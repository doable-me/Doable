import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "./types.js";
import {
  startTool,
  finishTool,
  cycleFingerprint,
  runOutcome,
} from "./execution-state.js";
import {
  handleAutoContinue,
  handleEmptyResponseRetry,
} from "./stream-recovery.js";
import { recordToolEventForTrace } from "./tool-event-bookkeeping.js";
import {
  extractPlanFromResponse,
  parsePlanSteps,
} from "../../ai/plan-parser.js";
import { classifyProviderError } from "../../ai/provider-error.js";
import { buildToolActionsFromCalls } from "../../ai/tool-messages.js";
const stream = () => {
  const events: any[] = [];
  return {
    events,
    async writeSSE(e: any) {
      events.push(JSON.parse(e.data));
    },
  };
};
function report(
  s: ReturnType<typeof createInitialState>,
  status: string,
  intent = "change",
) {
  startTool(s, "report_task_status", { intent, status });
  finishTool(s, "report_task_status", { intent, status }, { success: true });
}
function read(
  s: ReturnType<typeof createInitialState>,
  path: string,
  result = "same",
) {
  startTool(s, "read_file", { path });
  finishTool(s, "read_file", { path }, { success: true, content: result });
}
test("distinct invocations, arguments, cycles and results cannot collapse into tool names", () => {
  const s = createInitialState();
  read(s, "a");
  const first = cycleFingerprint(s, 0);
  s.recoveryCycle = 1;
  read(s, "b");
  assert.notEqual(first, cycleFingerprint(s, 1));
  s.recoveryCycle = 2;
  read(s, "a", "changed");
  assert.notEqual(first, cycleFingerprint(s, 2));
  assert.equal(s.assistantToolCalls.length, 3);
});
test("SDK IDs deduplicate mirrored starts and correlate nameless ends", () => {
  const s = createInitialState();
  const event = {
    type: "tool.execution_start",
    data: {
      toolCallId: "one",
      toolName: "read_file",
      arguments: { path: "a" },
    },
  };
  recordToolEventForTrace(s, event, () => {});
  recordToolEventForTrace(s, event, () => {});
  recordToolEventForTrace(
    s,
    {
      type: "tool.execution_complete",
      data: { toolCallId: "one", success: false, result: { error: "bad" } },
    },
    () => {},
  );
  assert.equal(s.assistantToolCalls.length, 1);
  assert.equal(s.assistantToolCalls[0].status, "failed");
});
test("Chinese, English, negations and filenames never determine recovery policy", async () => {
  for (const text of [
    "继续",
    "Continue",
    "开始构建！以下是已确认的计划",
    "Do not build; only explain",
    "Read src/build.ts",
  ]) {
    const s = createInitialState();
    read(s, "a");
    report(s, "completed", "read_only");
    let calls = 0;
    await handleAutoContinue(
      stream() as any,
      s,
      {
        async sendMessage() {
          calls++;
        },
      } as any,
      "s",
      "p",
      "agent",
      () => {},
      text,
    );
    assert.equal(calls, 0, text);
  }
});
test("Chinese unfinished request continues over 21 distinct paths and ends on explicit report", async () => {
  const s = createInitialState();
  for (let i = 0; i < 20; i++) read(s, `part${i}`);
  report(s, "in_progress");
  let calls = 0;
  await handleAutoContinue(
    stream() as any,
    s,
    {
      async sendMessage() {
        calls++;
        read(s, "new");
        report(s, "completed");
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
    "继续",
  );
  assert.equal(calls, 1);
  assert.equal(runOutcome(s), "completed");
});
test("failed file write never suppresses unfinished-task recovery; database completion never forces file writes", async () => {
  const s = createInitialState();
  startTool(s, "edit_file", { path: "a" });
  finishTool(s, "edit_file", { path: "a" }, { success: false });
  report(s, "in_progress");
  let calls = 0;
  await handleAutoContinue(
    stream() as any,
    s,
    {
      async sendMessage() {
        calls++;
        report(s, "completed");
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
  );
  assert.equal(calls, 1);
  const d = createInitialState();
  startTool(d, "data_migrate", {});
  finishTool(d, "data_migrate", {}, { success: true });
  report(d, "completed");
  await handleAutoContinue(
    stream() as any,
    d,
    {
      async sendMessage() {
        assert.fail("unwanted mutation nudge");
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
  );
});
test("same observations stop after bounded repetitions; changed results are progress", async () => {
  const s = createInitialState();
  read(s, "a");
  report(s, "in_progress");
  let calls = 0;
  await handleAutoContinue(
    stream() as any,
    s,
    {
      async sendMessage() {
        calls++;
        read(s, "a");
        report(s, "in_progress");
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
  );
  assert.equal(calls, 2);
  assert.equal(runOutcome(s), "stalled");
});
test("waiting, provider failure and missing status remain distinct terminal outcomes", async () => {
  for (const kind of ["waiting", "error", "missing"]) {
    const s = createInitialState();
    read(s, "a");
    report(s, "in_progress");
    await handleAutoContinue(
      stream() as any,
      s,
      {
        async sendMessage() {
          if (kind === "error") throw Error("offline");
          if (kind === "waiting") report(s, "waiting_for_input");
        },
      } as any,
      "s",
      "p",
      "agent",
      () => {},
    );
    assert.equal(runOutcome(s), kind === "missing" ? "stalled" : kind);
  }
});
test("provider codes precede translated text; Chinese rate limits do not retry", async () => {
  assert.equal(
    classifyProviderError({ statusCode: 503, message: "rate limit" }),
    "SERVER",
  );
  assert.equal(
    classifyProviderError({ statusCode: 429, message: "错误" }),
    "RATE_LIMIT",
  );
  assert.equal(classifyProviderError("请求超时"), "TIMEOUT");
  for (const message of ["请求过于频繁", "余额不足", "rate limit exceeded"]) {
    const s = createInitialState();
    s.deferredError = message;
    await handleEmptyResponseRetry(
      stream() as any,
      s,
      {
        async sendMessage() {
          assert.fail("retry must be suppressed");
        },
      } as any,
      "s",
      "p",
      "x",
      [],
    );
    assert.equal(runOutcome(s), "error");
  }
});
test("plan extraction is language independent; prose sections are not steps", () => {
  for (const p of [
    "# 计划\n## 步骤一：新增页面",
    "# Plan\n## Step 1: Add page",
  ]) {
    assert.ok(extractPlanFromResponse(p));
    assert.equal(parsePlanSteps(p).length, 1);
  }
  assert.deepEqual(parsePlanSteps("## 背景\n## 验收标准"), []);
  assert.equal(extractPlanFromResponse("x".repeat(300)), null);
});
test("history never invents completion and names plan operations correctly", () => {
  const r = buildToolActionsFromCalls(
    [
      { name: "create_plan" },
      { name: "edit_file", status: "failed" },
      { name: "edit_file", status: "completed" },
    ],
    "m",
  );
  assert.equal(r[0]!.description, "Creating plan");
  assert.equal(r[0]!.status, "unknown");
  assert.equal(r[1]!.status, "failed");
  assert.equal(r[2]!.status, "completed");
});

test("recovery displays complete-only SDK messages and preserves split reasoning channels", async () => {
  const s = createInitialState();
  read(s, "a");
  report(s, "in_progress");
  await handleAutoContinue(
    stream() as any,
    s,
    {
      async sendMessage(_id: any, _msg: any, _files: any, cb: any) {
        cb({ type: "assistant.message", data: { content: "完成了" } });
        report(s, "completed");
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
  );
  assert.equal(s.assistantContent, "完成了");
});
test("partial failed retries enter error, record tools, and cannot overwrite cancellation", async () => {
  const s = createInitialState();
  await handleEmptyResponseRetry(
    stream() as any,
    s,
    {
      async sendMessage(_id: any, _msg: any, _files: any, cb: any) {
        cb({
          type: "assistant.message_delta",
          data: { deltaContent: "读取中" },
        });
        cb({
          type: "tool.execution_start",
          data: {
            toolName: "read_file",
            toolCallId: "one",
            arguments: { path: "a" },
          },
        });
        cb({
          type: "tool.execution_complete",
          data: {
            toolName: "read_file",
            toolCallId: "one",
            success: false,
            result: { error: "Denied" },
          },
        });
        cb({ type: "session.error", data: { message: "连接断开" } });
      },
    } as any,
    "s",
    "p",
    "继续",
    [],
  );
  assert.equal(runOutcome(s), "error");
  assert.equal(s.assistantToolCalls[0].status, "failed");
  const cancelled = createInitialState();
  read(cancelled, "a");
  report(cancelled, "in_progress");
  await handleAutoContinue(
    stream() as any,
    cancelled,
    {
      async sendMessage(_id: any, _msg: any, _files: any, cb: any) {
        cancelled.runOutcome = "aborted";
        cb({ type: "session.error", data: { message: "Request aborted" } });
      },
    } as any,
    "s",
    "p",
    "agent",
    () => {},
  );
  assert.equal(runOutcome(cancelled), "aborted");
});
test("inner MCP failure agrees in live SSE and history; incomplete mirrors cannot erase it", async () => {
  const { mapEventToSSE } = await import("../../ai/sse-mapper.js");
  const s = createInitialState();
  startTool(s, "edit_file", { path: "a" }, "id");
  const e = {
    type: "tool.execution_complete",
    data: {
      toolName: "edit_file",
      toolCallId: "id",
      success: true,
      result: { textResultForLlm: '{"success":false,"error":"Denied"}' },
    },
  };
  recordToolEventForTrace(s, e, () => {});
  assert.equal(s.assistantToolCalls[0].status, "failed");
  assert.equal((mapEventToSSE(e)?.data as any).success, false);
  finishTool(s, "edit_file", undefined, undefined, true, "id");
  assert.equal(s.assistantToolCalls[0].status, "failed");
});

test("automatic preview repair requires change intent and stops for waiting or cancellation", async () => {
  const { mayAutoRepair } = await import("./execution-state.js");
  const s = createInitialState();
  report(s, "completed", "read_only");
  assert.equal(mayAutoRepair(s), false);
  report(s, "completed", "change");
  assert.equal(mayAutoRepair(s), true);
  s.awaitingIntegrationConnect = true;
  assert.equal(mayAutoRepair(s), false);
  s.awaitingIntegrationConnect = false;
  s.runOutcome = "aborted";
  assert.equal(mayAutoRepair(s), false);
});

test("history projections replace old fabricated card status without modifying stored rows",async()=>{
 const {projectHistoryToolActions}=await import("../../ai/tool-messages.js");
 const row={id:"legacy",tool_calls:[{name:"create_plan"}],tool_actions:[{status:"completed",description:"Creating file"}]};
 const view=projectHistoryToolActions(row);assert.equal(view.tool_actions[0]!.status,"unknown");assert.equal(view.tool_actions[0]!.description,"Creating plan");assert.equal(row.tool_actions[0]!.status,"completed");
});
