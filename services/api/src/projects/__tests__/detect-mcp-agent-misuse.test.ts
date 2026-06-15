import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { handRolledMcpAgentViolation } from "../detect-mcp-agent-misuse.js";

const HANDROLLED_TOOLCALL_MARKERS = `
import { ai } from "@doable/ai";
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();
async function send(text) {
  let reply = "";
  for await (const t of ai.chat([{ role: "user", content: text }])) reply += t;
  if (reply.includes("[TOOL_CALL]")) {
    const m = reply.match(/\\[TOOL_CALL\\]([\\s\\S]*?)\\[\\/TOOL_CALL\\]/);
    const call = JSON.parse(m[1]);
    const res = await doable.mcp.call(call.tool, call.args);
  }
}
`;

const HANDROLLED_REGEX_PARSE = `
import { ai } from "@doable/ai";
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();
async function send(text) {
  const { content: reply } = await ai.chatSync([{ role: "user", content: text }]);
  const jsonMatch = reply.match(/\\{[\\s\\S]*?"tool"[\\s\\S]*?\\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    const r = await doable.mcp.call(parsed.tool, parsed.args);
  }
}
`;

const USES_RUN_MCP_AGENT = `
import { runMcpAgent } from "@doable/ai";
import { createDoableClient } from "@doable/sdk";
const doable = createDoableClient();
async function send(text) {
  const { answer } = await runMcpAgent({ mcp: doable.mcp, prompt: text });
  return answer;
}
`;

const DASHBOARD_DIRECT = `
import { createDoableClient } from "@doable/sdk";
import { useEffect, useState } from "react";
const doable = createDoableClient();
function Cases() {
  const [cases, setCases] = useState([]);
  useEffect(() => {
    doable.mcp.call("mcp_x_list_cases", {}).then(r => { if (r.success) setCases(r.data.cases); });
  }, []);
  return null;
}
`;

const PLAIN_AI_CHAT = `
import { ai } from "@doable/ai";
async function send(text) {
  let reply = "";
  for await (const t of ai.chat([{ role: "user", content: text }])) reply += t;
  // also parses something unrelated
  const m = reply.match(/hello/); if (m) JSON.parse("{}");
  return reply;
}
`;

describe("handRolledMcpAgentViolation", () => {
  it("BLOCKS a hand-rolled loop using [TOOL_CALL] markers", () => {
    const v = handRolledMcpAgentViolation("src/components/ChatInterface.tsx", HANDROLLED_TOOLCALL_MARKERS);
    assert.ok(v && v.includes("runMcpAgent"), "should block and point to runMcpAgent");
  });

  it("BLOCKS a hand-rolled loop using regex + JSON.parse on the reply", () => {
    const v = handRolledMcpAgentViolation("src/components/ChatInterface.tsx", HANDROLLED_REGEX_PARSE);
    assert.ok(v && v.includes("runMcpAgent"));
  });

  it("ALLOWS an app that uses runMcpAgent", () => {
    assert.equal(handRolledMcpAgentViolation("src/components/ChatInterface.tsx", USES_RUN_MCP_AGENT), null);
  });

  it("ALLOWS a dashboard that calls doable.mcp.call directly (no ai.chat)", () => {
    assert.equal(handRolledMcpAgentViolation("src/components/Cases.tsx", DASHBOARD_DIRECT), null);
  });

  it("ALLOWS plain AI chat with no MCP call", () => {
    assert.equal(handRolledMcpAgentViolation("src/components/Chat.tsx", PLAIN_AI_CHAT), null);
  });

  it("ignores non-source files", () => {
    assert.equal(handRolledMcpAgentViolation("README.md", HANDROLLED_TOOLCALL_MARKERS), null);
    assert.equal(handRolledMcpAgentViolation("src/index.css", HANDROLLED_REGEX_PARSE), null);
  });
});
