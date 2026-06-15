/**
 * Tests for detectUsedTools — make sure the @doable/ai detection extension
 * doesn't regress the existing @doable/data behaviour, and that ai.embed
 * is only granted when an explicit .embed() call exists.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { detectUsedTools } from "../auto-api-key.js";

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "auto-api-key-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
  }
  return root;
}

describe("detectUsedTools", () => {
  const cleanups: string[] = [];
  after(async () => {
    for (const dir of cleanups) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("returns [] for an empty project", async () => {
    const dir = await makeProject({ "src/App.tsx": "export const App = () => null;" });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.deepEqual(tools, []);
  });

  it("detects @doable/data import and grants data.query + data.schema", async () => {
    const dir = await makeProject({
      "src/App.tsx": 'import { db } from "@doable/data"; db.query("select 1");',
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("data.query"));
    assert.ok(tools.includes("data.schema"));
  });

  it("grants ai.chat on @doable/ai import alone", async () => {
    const dir = await makeProject({
      "src/Chat.tsx": 'import { ai } from "@doable/ai";\nexport const x = ai;',
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("ai.chat"), 'should grant ai.chat on @doable/ai import');
    assert.ok(!tools.includes("ai.embed"), 'should NOT grant ai.embed without .embed() call');
  });

  it("grants ai.chat AND ai.embed when both are used", async () => {
    const dir = await makeProject({
      "src/Rag.tsx": `
        import { ai } from "@doable/ai";
        const { embedding } = await ai.embed("hello");
        for await (const t of ai.chat([{ role: "user", content: "hi" }])) console.log(t);
      `,
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("ai.chat"));
    assert.ok(tools.includes("ai.embed"));
  });

  it("combines data + ai grants when both SDKs are imported", async () => {
    const dir = await makeProject({
      "src/App.tsx": `
        import { db } from "@doable/data";
        import { ai } from "@doable/ai";
        await ai.embed("x");
        db.query("select 1");
      `,
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    for (const t of ["data.query", "data.schema", "ai.chat", "ai.embed"]) {
      assert.ok(tools.includes(t), `missing ${t} in ${JSON.stringify(tools)}`);
    }
  });

  it("does not grant ai.chat when no @doable/ai import is present", async () => {
    const dir = await makeProject({
      "src/foo.ts": 'import { openai } from "openai"; const x = await openai.chat();',
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.equal(tools.includes("ai.chat"), false, '`openai.chat()` is not @doable/ai');
  });

  it("flags a template-literal MCP tool name as dynamic (\"*\"), not a literal tool", async () => {
    const dir = await makeProject({
      "src/hook.ts":
        "const toolName = 'list_cases';\n" +
        "await doable.mcp.call(`mcp_discovery_mcp_${toolName}`, {});",
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("*"), "dynamic template-literal dispatch should emit the * sentinel");
    // The un-interpolated placeholder must NOT be baked as a real tool.
    assert.ok(
      !tools.some((t) => t.includes("${") || t === "mcp_discovery_mcp_"),
      `must not bake placeholder artifacts: ${JSON.stringify(tools)}`,
    );
  });

  it("flags a variable-arg MCP dispatch as dynamic (\"*\")", async () => {
    const dir = await makeProject({
      "src/agent.ts":
        "function run(tool, args) { return doable.mcp.call(tool, args); }",
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("*"), "variable-arg dispatch should emit the * sentinel");
  });

  it("flags a PURE runMcpAgent assistant as dynamic (\"*\") — the deployed-403 regression", async () => {
    // Reproduces 0bfac055: the chatbot dispatches MCP tools only via the
    // platform's runMcpAgent helper, so no `mcp_…` literal exists in src. Without
    // the * sentinel the published key gets {ai.chat} and every MCP call 403s.
    const dir = await makeProject({
      "src/App.tsx": `
        const { runMcpAgent } = await import("@doable/ai");
        const { createDoableClient } = await import("@doable/sdk");
        const doable = createDoableClient();
        const { answer } = await runMcpAgent({ mcp: doable.mcp, ai, messages });
      `,
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("*"), "runMcpAgent dispatch must emit the * sentinel");
    assert.ok(tools.includes("ai.chat"), "still grants ai.chat for the @doable/ai import");
    // No bogus mcp_ literal should have been baked.
    assert.ok(!tools.some((t) => t.startsWith("mcp_")), `must not bake an mcp literal: ${JSON.stringify(tools)}`);
  });

  it("is generic — runMcpAgent flags dynamic regardless of server/tool names", async () => {
    const dir = await makeProject({
      "src/Bot.tsx": 'import { runMcpAgent } from "@doable/ai";\nexport const go = (mcp) => runMcpAgent({ mcp });',
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("*"));
  });

  it("keeps static MCP tool names exact (no spurious * sentinel)", async () => {
    const dir = await makeProject({
      "src/data.ts": 'await doable.mcp.call("mcp_discovery_mcp_list_cases_and_folders", {});',
    });
    cleanups.push(dir);
    const tools = await detectUsedTools(dir);
    assert.ok(tools.includes("mcp_discovery_mcp_list_cases_and_folders"));
    assert.ok(!tools.includes("*"), "a static literal call must not be flagged dynamic");
  });
});
