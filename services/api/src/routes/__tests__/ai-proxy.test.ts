/**
 * Route tests for the runtime AI data plane (/__doable/ai/*).
 *
 * Uses a real project JWT (no DB lookup needed) and stubbed chat / embed
 * provider executors so the auth / tier / validation / streaming / error
 * pipeline is exercised deterministically. DATABASE_URL is intentionally
 * NOT set — the route handler swallows DB errors via its outer try/catch
 * wrappers so we exercise the in-process logic end-to-end.
 *
 * Run: pnpm exec tsx --test services/api/src/routes/__tests__/ai-proxy.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Must be set BEFORE importing modules that read secrets at load time.
process.env.PROJECT_JWT_SECRET = process.env.PROJECT_JWT_SECRET ?? "test-secret-for-ai-proxy-routes";

const {
  aiProxyRoutes,
  __setChatExecutorForTest,
  __setEmbedExecutorForTest,
  __setSettingsResolverForTest,
  __setEngineResolverForTest,
  __setEmbeddingResolverForTest,
  toolNotAllowed,
  appUserId,
  estimateTokens,
  enforceModelAllowList,
} = await import("../ai-proxy.js");
const { signProjectJwt } = await import("../../auth/project-jwt.js");
import type { ResolvedAuth } from "../connector-proxy.js";
import type { ProjectAiSettings } from "../ai-proxy.js";

function settings(overrides: Partial<ProjectAiSettings> = {}): ProjectAiSettings {
  return {
    enabled: true,
    defaultModel: null,
    modelAllowlist: null,
    budgetTokens: null,
    budgetWindowSec: null,
    perUserBudgetTokens: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    maxTurnsPerSession: null,
    systemPrompt: null,
    embeddingModel: null,
    embeddingProviderId: null,
    // OOB default mirrors production: unset thinking visibility resolves to "hide".
    thinkingVisibility: "hide",
    systemPromptOverride: null,
    chatModelOverride: null,
    embeddingModelOverride: null,
    ...overrides,
  };
}

const app = new Hono();
app.route("/", aiProxyRoutes);

let jwt: string;
before(async () => {
  jwt = await signProjectJwt(
    {
      kind: "connector-proxy",
      projectId: "11111111-1111-1111-1111-111111111111",
      workspaceId: "ws1",
      userId: "user1",
    } as never,
    process.env.PROJECT_JWT_SECRET!,
  );
});
after(() => {
  __setChatExecutorForTest(null);
  __setEmbedExecutorForTest(null);
  __setSettingsResolverForTest(null);
  __setEngineResolverForTest(null);
  __setEmbeddingResolverForTest(null);
});

// Default test embedding resolver — returns a sane fake provider so /embed
// tests that just want to verify the executor pipeline don't need to wire
// the resolver in every test. Tests that need a specific provider can call
// __setEmbeddingResolverForTest() to override.
function defaultTestEmbeddingResolver() {
  __setEmbeddingResolverForTest(async (_projectId, override) => ({
    provider: {
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
    },
    model: override.embeddingModel ?? "text-embedding-3-small",
    source: "platform" as const,
  }));
}

function req(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${jwt}`,
      origin: "http://localhost",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function consumeSse(res: Response): Promise<Array<{ type: string; data?: unknown }>> {
  const text = await res.text();
  const events: Array<{ type: string; data?: unknown }> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (raw === "[DONE]") {
      events.push({ type: "[DONE]" });
      continue;
    }
    try {
      events.push(JSON.parse(raw) as { type: string; data?: unknown });
    } catch {
      // skip
    }
  }
  return events;
}

// ── /chat tests ────────────────────────────────────────────────────────────

test("no model resolved + no project default => 503 PROVIDER_ERROR", async () => {
  __setSettingsResolverForTest(async () => settings());
  __setEngineResolverForTest(async () => null);
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "Hi" }],
    stream: false,
  });
  assert.equal(res.status, 503);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "PROVIDER_ERROR");
});

test("non-streaming chat with default model returns content + usage", async () => {
  __setSettingsResolverForTest(async () => settings({ defaultModel: "claude-sonnet-4-6" }));
  __setEngineResolverForTest(async () => ({ model: "claude-sonnet-4-6" }));
  __setChatExecutorForTest(async function* (ctx) {
    assert.equal(ctx.stream, false);
    assert.equal(ctx.model, "claude-sonnet-4-6");
    assert.equal(ctx.messages.length, 1);
    yield { type: "text_delta", data: "Hi" };
    yield { type: "text_delta", data: ", there!" };
    yield { type: "done", data: { usage: { prompt_tokens: 5, completion_tokens: 2 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "Hi" }],
    stream: false,
  });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { ok: boolean; content: string; usage: { prompt_tokens: number; completion_tokens: number } };
  assert.equal(j.ok, true);
  assert.equal(j.content, "Hi, there!");
  assert.equal(j.usage.prompt_tokens, 5);
  assert.equal(j.usage.completion_tokens, 2);
});

test("streaming chat emits text_delta + done SSE frames", async () => {
  __setSettingsResolverForTest(async () => settings({ defaultModel: "claude-sonnet-4-6" }));
  __setEngineResolverForTest(async () => ({ model: "claude-sonnet-4-6" }));
  __setChatExecutorForTest(async function* (ctx) {
    assert.equal(ctx.stream, true);
    yield { type: "text_delta", data: "Hel" };
    yield { type: "text_delta", data: "lo" };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 2 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "say hi" }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type")?.startsWith("text/event-stream"), true);
  const events = await consumeSse(res);
  const textDeltas = events.filter((e) => e.type === "text_delta").map((e) => e.data);
  assert.deepEqual(textDeltas, ["Hel", "lo"]);
  const done = events.find((e) => e.type === "done");
  assert.ok(done, "should emit a done event");
  assert.equal(events.at(-1)?.type, "[DONE]");
});

test("streaming chat surfaces inline executor error as SSE error frame", async () => {
  __setSettingsResolverForTest(async () => settings({ defaultModel: "x" }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  __setChatExecutorForTest(async function* () {
    yield { type: "text_delta", data: "before failure" };
    yield { type: "error", data: "provider outage" };
  });
  const res = await req("/__doable/ai/chat", { messages: [{ role: "user", content: "x" }] });
  assert.equal(res.status, 200);
  const events = await consumeSse(res);
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  assert.equal(err!.data, "provider outage");
  // no `done` frame on error path (we still emit [DONE] sentinel)
  assert.equal(events.at(-1)?.type, "[DONE]");
});

test("model not in allowlist => 403 MODEL_NOT_ALLOWED", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "gpt-4o-mini",
    modelAllowlist: ["claude-sonnet-4-6"],
  }));
  __setEngineResolverForTest(async () => ({ model: "gpt-4o-mini" }));
  const res = await req("/__doable/ai/chat", { messages: [{ role: "user", content: "x" }] });
  assert.equal(res.status, 403);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "MODEL_NOT_ALLOWED");
});

test("AI disabled flag => 503 AI_DISABLED_FOR_PROJECT", async () => {
  __setSettingsResolverForTest(async () => settings({ enabled: false }));
  const res = await req("/__doable/ai/chat", { messages: [{ role: "user", content: "x" }] });
  assert.equal(res.status, 503);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "AI_DISABLED_FOR_PROJECT");
});

test("input over maxInputTokens => 400 INPUT_TOO_LARGE", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "claude-sonnet-4-6",
    maxInputTokens: 10,
  }));
  __setEngineResolverForTest(async () => ({ model: "claude-sonnet-4-6" }));
  // 80 chars ≈ 20 tokens, exceeds 10
  const longMessage = "x".repeat(80);
  const res = await req("/__doable/ai/chat", { messages: [{ role: "user", content: longMessage }] });
  assert.equal(res.status, 400);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "INPUT_TOO_LARGE");
});

test("pinned system prompt is prepended server-side, never echoed to caller", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "x",
    systemPrompt: "You are Mrs. Whiskers. Always meow before answering.",
  }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  let seenMessages: unknown = null;
  __setChatExecutorForTest(async function* (ctx) {
    seenMessages = ctx.messages;
    yield { type: "text_delta", data: "meow" };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 1 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  });
  assert.equal(res.status, 200);
  const msgs = seenMessages as Array<{ role: string; content: string }>;
  assert.equal(msgs[0]?.role, "system");
  assert.match(msgs[0]?.content ?? "", /Mrs\. Whiskers/);
  assert.equal(msgs[1]?.role, "user");
});

test("project default model wins over workspace resolved model", () => {
  const r = enforceModelAllowList("workspace-model", settings({ defaultModel: "project-model" }));
  assert.deepEqual(r, { ok: true, model: "project-model" });
});

test("chat_model_override beats both defaultModel and resolved model", () => {
  const r = enforceModelAllowList(
    "workspace-model",
    settings({ defaultModel: "project-model", chatModelOverride: "tab-override-model" }),
  );
  assert.deepEqual(r, { ok: true, model: "tab-override-model" });
});

test("system_prompt_override is concatenated with legacy systemPrompt", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "x",
    systemPrompt: "Be safe.",
    systemPromptOverride: "You always answer in haiku.",
  }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  let seenMessages: Array<{ role: string; content: string }> = [];
  __setChatExecutorForTest(async function* (ctx) {
    seenMessages = ctx.messages as typeof seenMessages;
    yield { type: "text_delta", data: "haiku" };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 1 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  });
  assert.equal(res.status, 200);
  assert.equal(seenMessages[0]!.role, "system");
  assert.match(seenMessages[0]!.content, /Be safe/);
  assert.match(seenMessages[0]!.content, /haiku/);
});

test("thinking_visibility=hide strips <think> blocks server-side (non-stream)", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "x",
    thinkingVisibility: "hide",
  }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  __setChatExecutorForTest(async function* () {
    yield { type: "text_delta", data: "<think>I should answer carefully.</think>" };
    yield { type: "text_delta", data: "The answer is 42." };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 2 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "x" }],
    stream: false,
  });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { content: string };
  assert.equal(j.content.includes("<think>"), false);
  assert.equal(j.content.includes("answer carefully"), false);
  assert.match(j.content, /The answer is 42/);
});

test("UNSET thinking_visibility defaults to hide and strips <think> (OOB)", async () => {
  // No thinkingVisibility override — exercises the OOB default. The product
  // default is now "hide", so generated apps never leak raw reasoning.
  __setSettingsResolverForTest(async () => settings({ defaultModel: "x" }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  __setChatExecutorForTest(async function* () {
    yield { type: "text_delta", data: "<think>internal chain of thought</think>" };
    yield { type: "text_delta", data: "Visible answer." };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 2 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "x" }],
    stream: false,
  });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { content: string };
  assert.equal(j.content.includes("<think>"), false);
  assert.equal(j.content.includes("chain of thought"), false);
  assert.match(j.content, /Visible answer\./);
});

test("thinking_visibility=auto passes <think> through to the SDK", async () => {
  __setSettingsResolverForTest(async () => settings({
    defaultModel: "x",
    thinkingVisibility: "auto",
  }));
  __setEngineResolverForTest(async () => ({ model: "x" }));
  __setChatExecutorForTest(async function* () {
    yield { type: "text_delta", data: "<think>sneaky</think>visible" };
    yield { type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 1 } } };
  });
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "user", content: "x" }],
    stream: false,
  });
  const j = (await res.json()) as { content: string };
  assert.match(j.content, /<think>sneaky<\/think>visible/);
});

test("streaming chat with empty messages => 400 PARAMS_INVALID", async () => {
  const res = await req("/__doable/ai/chat", { messages: [] });
  assert.equal(res.status, 400);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "PARAMS_INVALID");
});

test("missing Authorization header => 401 UNAUTHORIZED", async () => {
  const res = await app.request("/__doable/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
  });
  assert.equal(res.status, 401);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "UNAUTHORIZED");
});

test("invalid Bearer JWT => 401 UNAUTHORIZED", async () => {
  const res = await app.request("/__doable/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer not-a-real-jwt",
      origin: "http://localhost",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
  });
  assert.equal(res.status, 401);
});

test("malformed messages entry => 400 PARAMS_INVALID", async () => {
  const res = await req("/__doable/ai/chat", {
    messages: [{ role: "not-a-real-role", content: "x" }],
  });
  assert.equal(res.status, 400);
});

test("too many messages => 400 PARAMS_INVALID", async () => {
  const messages = Array.from({ length: 200 }, (_, i) => ({
    role: "user" as const,
    content: `m${i}`,
  }));
  const res = await req("/__doable/ai/chat", { messages });
  assert.equal(res.status, 400);
});

// ── /embed tests ───────────────────────────────────────────────────────────

test("embed empty texts => 400 PARAMS_INVALID", async () => {
  const res = await req("/__doable/ai/embed", { texts: [] });
  assert.equal(res.status, 400);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "PARAMS_INVALID");
});

test("embed non-string entries => 400 PARAMS_INVALID", async () => {
  const res = await req("/__doable/ai/embed", { texts: [123 as unknown as string] });
  assert.equal(res.status, 400);
});

test("embed too many texts => 400 PARAMS_INVALID", async () => {
  const texts = Array.from({ length: 200 }, (_, i) => `text${i}`);
  const res = await req("/__doable/ai/embed", { texts });
  assert.equal(res.status, 400);
});

test("embed propagates executor result as ok envelope", async () => {
  defaultTestEmbeddingResolver();
  __setEmbedExecutorForTest(async (ctx) => {
    assert.deepEqual(ctx.texts, ["alpha", "beta"]);
    assert.ok(ctx.model.length > 0, "default embed model should be passed");
    return {
      vectors: [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
      ],
      model: ctx.model,
      dimensions: 4,
      prompt_tokens: 7,
    };
  });
  const res = await req("/__doable/ai/embed", { texts: ["alpha", "beta"] });
  assert.equal(res.status, 200);
  const j = (await res.json()) as {
    ok: boolean;
    vectors: number[][];
    model: string;
    dimensions: number;
  };
  assert.equal(j.ok, true);
  assert.equal(j.vectors.length, 2);
  assert.equal(j.dimensions, 4);
  assert.equal(j.model, "text-embedding-3-small");
});

test("embed surfaces executor errors as 503 PROVIDER_ERROR envelope", async () => {
  defaultTestEmbeddingResolver();
  __setEmbedExecutorForTest(async () => {
    throw new Error("upstream down");
  });
  const res = await req("/__doable/ai/embed", { texts: ["x"] });
  assert.equal(res.status, 503);
  const j = (await res.json()) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(j.ok, false);
  assert.equal(j.error.code, "PROVIDER_ERROR");
  assert.match(j.error.message, /upstream down/);
});

test("embed returns 503 EMBEDDING_NOT_CONFIGURED when no provider configured anywhere", async () => {
  __setEmbeddingResolverForTest(async () => null);
  const res = await req("/__doable/ai/embed", { texts: ["x"] });
  assert.equal(res.status, 503);
  const j = (await res.json()) as { error: { code: string } };
  assert.equal(j.error.code, "EMBEDDING_NOT_CONFIGURED");
});

// ── CORS preflight ─────────────────────────────────────────────────────────

test("OPTIONS /__doable/ai/* returns 204 with CORS headers", async () => {
  const res = await app.request("/__doable/ai/chat", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /x-doable-app-user/);
});

// ── Pure helper logic ──────────────────────────────────────────────────────

test("toolNotAllowed: JWT auth is unrestricted, api-key respects allowedTools", () => {
  const jwtAuth = { authMode: "jwt", allowedTools: null } as ResolvedAuth;
  const clientChat = { authMode: "api-key", tier: "client", allowedTools: ["ai.chat"] } as ResolvedAuth;
  const clientEmbed = { authMode: "api-key", tier: "client", allowedTools: ["ai.embed"] } as ResolvedAuth;
  const unrestricted = { authMode: "api-key", tier: "server", allowedTools: null } as ResolvedAuth;
  assert.equal(toolNotAllowed(jwtAuth, "chat"), false);
  assert.equal(toolNotAllowed(jwtAuth, "embed"), false);
  assert.equal(toolNotAllowed(clientChat, "chat"), false);
  assert.equal(toolNotAllowed(clientChat, "embed"), true);
  assert.equal(toolNotAllowed(clientEmbed, "chat"), true);
  assert.equal(toolNotAllowed(clientEmbed, "embed"), false);
  assert.equal(toolNotAllowed(unrestricted, "chat"), false);
  assert.equal(toolNotAllowed(unrestricted, "embed"), false);
});

test("appUserId honors x-doable-app-user only for server-tier api keys", () => {
  function fakeCtx(headerVal?: string) {
    return {
      req: { header: (n: string) => (n === "x-doable-app-user" ? headerVal : undefined) },
    } as unknown as Parameters<typeof appUserId>[0];
  }
  const server = { authMode: "api-key", tier: "server", userId: "u1" } as ResolvedAuth;
  const client = { authMode: "api-key", tier: "client", userId: "u1" } as ResolvedAuth;
  const jwtAuth = { authMode: "jwt", userId: "u1" } as ResolvedAuth;
  assert.equal(appUserId(fakeCtx("end-user-42"), server), "end-user-42");
  assert.equal(appUserId(fakeCtx(undefined), server), null);
  assert.equal(appUserId(fakeCtx("forged"), client), null, "client tier ignores header");
  assert.equal(appUserId(fakeCtx("forged"), jwtAuth), null, "JWT ignores header");
});

test("estimateTokens ~ length/4", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("a".repeat(400)), 100);
});

test("enforceModelAllowList policies", () => {
  const baseSettings: ProjectAiSettings = {
    enabled: true,
    defaultModel: null,
    modelAllowlist: null,
    budgetTokens: null,
    budgetWindowSec: null,
    perUserBudgetTokens: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    maxTurnsPerSession: null,
    systemPrompt: null,
    embeddingModel: null,
    embeddingProviderId: null,
    thinkingVisibility: "auto",
    systemPromptOverride: null,
    chatModelOverride: null,
    embeddingModelOverride: null,
  };
  // no model resolved + no project default => PROVIDER_ERROR
  let r = enforceModelAllowList(undefined, baseSettings);
  assert.equal(r.ok, false);
  // workspace-resolved model, no allowlist => OK
  r = enforceModelAllowList("gpt-4o-mini", baseSettings);
  assert.deepEqual(r, { ok: true, model: "gpt-4o-mini" });
  // project default wins over workspace-resolved model
  r = enforceModelAllowList("gpt-4o-mini", { ...baseSettings, defaultModel: "claude-haiku-4-5" });
  assert.deepEqual(r, { ok: true, model: "claude-haiku-4-5" });
  // allowlist blocks an unlisted model
  r = enforceModelAllowList("gpt-4o-mini", { ...baseSettings, modelAllowlist: ["claude-sonnet-4-6"] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "MODEL_NOT_ALLOWED");
  // empty allowlist blocks all
  r = enforceModelAllowList("gpt-4o-mini", { ...baseSettings, modelAllowlist: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "MODEL_NOT_ALLOWED");
});
