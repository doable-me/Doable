import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractMcpToolCall, runMcpAgent, type ChatMessage } from "./index.js";

describe("extractMcpToolCall", () => {
  it("parses a single tool-call object", () => {
    const r = extractMcpToolCall('{"tool":"mcp_x_list","args":{"a":1}}');
    assert.deepEqual(r, { tool: "mcp_x_list", args: { a: 1 } });
  });

  it("returns the FIRST valid object when the model emits MULTIPLE (greedy-regex killer)", () => {
    const text =
      'I will do both.\n{"tool":"mcp_x_list_cases","args":{}}\n{"tool":"mcp_x_query_holds","args":{"type":"summary"}}';
    const r = extractMcpToolCall(text);
    assert.deepEqual(r, { tool: "mcp_x_list_cases", args: {} });
  });

  it("strips [TOOL_CALL] wrappers and surrounding prose", () => {
    const r = extractMcpToolCall(
      'Sure! [TOOL_CALL]{"tool":"mcp_x_get","args":{"id":"7"}}[/TOOL_CALL] done',
    );
    assert.deepEqual(r, { tool: "mcp_x_get", args: { id: "7" } });
  });

  it("ignores braces inside string literals", () => {
    const r = extractMcpToolCall('{"tool":"mcp_x_q","args":{"q":"a } b { c"}}');
    assert.deepEqual(r, { tool: "mcp_x_q", args: { q: "a } b { c" } });
  });

  it("returns null when there is no tool-call object", () => {
    assert.equal(extractMcpToolCall("You have 54 cases. {not: 'a tool'}"), null);
    assert.equal(extractMcpToolCall("just prose, no json"), null);
  });

  it("defaults missing/!object args to {}", () => {
    assert.deepEqual(extractMcpToolCall('{"tool":"mcp_x_ping"}'), {
      tool: "mcp_x_ping",
      args: {},
    });
  });
});

describe("runMcpAgent", () => {
  // Fake AI client: scripted replies per call. First emits a tool call, then a
  // final prose answer composed from the TOOL_RESULT it was fed.
  function makeClient(replies: string[]) {
    let i = 0;
    const seen: ChatMessage[][] = [];
    return {
      client: {
        async chatSync(messages: ChatMessage[]) {
          seen.push(messages.map((m) => ({ ...m })));
          const content = replies[Math.min(i, replies.length - 1)];
          i++;
          return { content, elapsed_ms: 0 };
        },
      },
      seen,
    };
  }

  it("runs the loop: tool call -> real result -> final answer", async () => {
    const calls: Array<{ tool: string; args: unknown }> = [];
    const mcp = {
      async list() {
        return {
          success: true,
          data: [
            { fullName: "mcp_disc_list_cases", description: "list cases" },
          ],
          error: null,
        };
      },
      async call(tool: string, args?: Record<string, unknown>) {
        calls.push({ tool, args });
        return { success: true, data: { count: 54, cases: ["A", "B"] }, error: null };
      },
    };
    const { client, seen } = makeClient([
      '{"tool":"mcp_disc_list_cases","args":{}}',
      "You have **54 cases**.",
    ]);

    const toolEvents: string[] = [];
    const res = await runMcpAgent({
      mcp: mcp as never,
      prompt: "how many cases?",
      client: client as never,
      onToolCall: (e) => toolEvents.push(e.tool),
    });

    assert.equal(res.answer, "You have **54 cases**.");
    assert.deepEqual(res.toolsUsed, ["mcp_disc_list_cases"]);
    assert.deepEqual(calls, [{ tool: "mcp_disc_list_cases", args: {} }]);
    assert.deepEqual(toolEvents, ["mcp_disc_list_cases"]);
    // The real tool data must have been fed back to the model before the final answer.
    const lastTurnToModel = seen[1];
    const fedResult = lastTurnToModel.some(
      (m) => m.role === "user" && m.content.includes("TOOL_RESULT") && m.content.includes('"count":54'),
    );
    assert.ok(fedResult, "real tool result must be fed back to the model");
    // System prompt must contain the discovered tool catalogue.
    assert.ok(seen[0][0].content.includes("mcp_disc_list_cases"));
    assert.equal(res.authRequired, false);
  });

  it("answers directly when the model makes no tool call", async () => {
    const mcp = {
      async list() {
        return { success: true, data: [{ fullName: "mcp_x_t" }], error: null };
      },
      async call() {
        throw new Error("should not be called");
      },
    };
    const { client } = makeClient(["Hello! How can I help?"]);
    const res = await runMcpAgent({ mcp: mcp as never, prompt: "hi", client: client as never });
    assert.equal(res.answer, "Hello! How can I help?");
    assert.deepEqual(res.toolsUsed, []);
  });

  it("surfaces auth-required from a tool error (loginUrl) and recovers to a final answer", async () => {
    const mcp = {
      async list() {
        return { success: true, data: [{ fullName: "mcp_x_secure" }], error: null };
      },
      async call() {
        return {
          success: false,
          data: null,
          error: { code: "AUTH_REQUIRED", message: "login first", loginUrl: "https://login.example" },
        };
      },
    };
    const { client } = makeClient([
      '{"tool":"mcp_x_secure","args":{}}',
      "It looks like the MCP server needs you to sign in.",
    ]);
    const res = await runMcpAgent({ mcp: mcp as never, prompt: "secure thing", client: client as never });
    assert.equal(res.authRequired, true);
    assert.equal(res.loginUrl, "https://login.example");
    assert.equal(res.answer, "It looks like the MCP server needs you to sign in.");
  });
});
