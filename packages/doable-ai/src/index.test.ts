import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DoableAiClient, createAiClient, ai, type ChatMessage } from "./index.ts";

// ─── Fetch stub helpers ────────────────────────────────────────────────────────

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let origFetch: typeof globalThis.fetch;

function stubFetch(impl: FetchStub): void {
  (globalThis as Record<string, unknown>)["fetch"] = impl;
}

function restoreFetch(): void {
  (globalThis as Record<string, unknown>)["fetch"] = origFetch;
}

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

before(() => {
  origFetch = globalThis.fetch;
});

after(() => {
  restoreFetch();
});

describe("DoableAiClient.chat() — streaming", () => {
  afterEach(restoreFetch);

  it("POSTs to /__doable/ai/chat with correct headers and body", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    stubFetch(async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return sseResponse([
        JSON.stringify({ type: "text_delta", data: "Hello" }),
        JSON.stringify({ type: "done", data: { usage: { prompt_tokens: 10, completion_tokens: 3 }, elapsed_ms: 42 } }),
      ]);
    });

    const client = createAiClient({ token: "test-token", baseUrl: "http://localhost:4000" });
    const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

    const tokens: string[] = [];
    const gen = client.chat(messages, { max_tokens: 100 });
    let step = await gen.next();
    while (!step.done) {
      tokens.push(step.value);
      step = await gen.next();
    }

    assert.equal(capturedUrl, "http://localhost:4000/__doable/ai/chat");
    const headers = capturedInit!.headers as Record<string, string>;
    assert.equal(headers["authorization"], "Bearer test-token");
    assert.equal(headers["content-type"], "application/json");

    const sentBody = JSON.parse(capturedInit!.body as string);
    assert.deepEqual(sentBody.messages, messages);
    assert.equal(sentBody.stream, true);
    assert.equal(sentBody.max_tokens, 100);

    assert.deepEqual(tokens, ["Hello"]);
    const result = step.value!;
    assert.equal(result.content, "Hello");
    assert.equal(result.usage?.prompt_tokens, 10);
    assert.equal(result.elapsed_ms, 42);
  });

  it("invokes onToken for every text_delta", async () => {
    stubFetch(async () =>
      sseResponse([
        JSON.stringify({ type: "text_delta", data: "Foo" }),
        JSON.stringify({ type: "text_delta", data: "Bar" }),
        JSON.stringify({ type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 2 }, elapsed_ms: 5 } }),
      ]),
    );
    const received: string[] = [];
    const client = createAiClient({ token: "t" });
    const gen = client.chat([{ role: "user", content: "x" }], { onToken: (t) => received.push(t) });
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    assert.deepEqual(received, ["Foo", "Bar"]);
  });

  it("throws an AiError with code on non-2xx response", async () => {
    stubFetch(async () =>
      jsonResponse({ ok: false, error: { code: "BUDGET_EXCEEDED", message: "Budget cap reached" } }, 402),
    );
    const client = createAiClient({ token: "t" });
    const gen = client.chat([{ role: "user", content: "x" }]);
    await assert.rejects(
      async () => { await gen.next(); },
      (err: unknown) => {
        const e = err as Error & { code?: string; status?: number };
        assert.equal(e.message, "Budget cap reached");
        assert.equal(e.code, "BUDGET_EXCEEDED");
        assert.equal(e.status, 402);
        return true;
      },
    );
  });

  it("throws on inline SSE error event", async () => {
    stubFetch(async () =>
      sseResponse([
        JSON.stringify({ type: "text_delta", data: "partial" }),
        JSON.stringify({ type: "error", data: "Upstream provider unreachable" }),
      ]),
    );
    const client = createAiClient({ token: "t" });
    const gen = client.chat([{ role: "user", content: "x" }]);
    await assert.rejects(async () => {
      let s = await gen.next();
      while (!s.done) s = await gen.next();
    }, /Upstream provider unreachable/);
  });
});

describe("DoableAiClient.chatSync()", () => {
  afterEach(restoreFetch);

  it("returns the full concatenated response", async () => {
    stubFetch(async () =>
      sseResponse([
        JSON.stringify({ type: "text_delta", data: "Hello" }),
        JSON.stringify({ type: "text_delta", data: ", " }),
        JSON.stringify({ type: "text_delta", data: "world" }),
        JSON.stringify({ type: "done", data: { usage: { prompt_tokens: 1, completion_tokens: 3 }, elapsed_ms: 9 } }),
      ]),
    );
    const client = createAiClient({ token: "t" });
    const r = await client.chatSync([{ role: "user", content: "x" }]);
    assert.equal(r.content, "Hello, world");
    assert.equal(r.usage?.completion_tokens, 3);
  });
});

describe("DoableAiClient.embed()", () => {
  afterEach(restoreFetch);

  it("POSTs the texts array and returns vectors + embedding shortcut", async () => {
    let captured: RequestInit | undefined;
    const responseBody = {
      ok: true,
      vectors: [[0.1, 0.2, 0.3]],
      model: "text-embedding-3-small",
      dimensions: 3,
      elapsed_ms: 12,
    };
    stubFetch(async (_input, init) => {
      captured = init;
      return jsonResponse(responseBody);
    });

    const client = createAiClient({ token: "tok", baseUrl: "http://api" });
    const r = await client.embed("hello");

    const sent = JSON.parse(captured!.body as string);
    assert.deepEqual(sent.texts, ["hello"]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.vectors, [[0.1, 0.2, 0.3]]);
    assert.deepEqual(r.embedding, [0.1, 0.2, 0.3]);
    assert.equal(r.dimensions, 3);
    assert.equal(r.model, "text-embedding-3-small");
  });

  it("propagates server-side errors in the EmbedResult envelope", async () => {
    stubFetch(async () => jsonResponse({ ok: false, error: { code: "PROVIDER_ERROR", message: "boom" }, vectors: [] }, 503));
    const client = createAiClient({ token: "t" });
    const r = await client.embed(["x", "y"]);
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, "PROVIDER_ERROR");
  });
});

describe("lazy token resolution", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"];
    restoreFetch();
  });

  it("reads __DOABLE_DATA_TOKEN at call time when constructed with empty token", async () => {
    let capturedAuth = "";
    stubFetch(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      capturedAuth = headers["authorization"]!;
      return sseResponse([JSON.stringify({ type: "done", data: { elapsed_ms: 0 } })]);
    });

    (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] = "injected-tok";

    const gen = ai.chat([{ role: "user", content: "hi" }]);
    let step = await gen.next();
    while (!step.done) step = await gen.next();

    assert.equal(capturedAuth, "Bearer injected-tok");
  });
});

describe("DoableAiClient defaults", () => {
  it("uses empty baseUrl by default (same-origin)", () => {
    const c = new DoableAiClient({ token: "x" });
    assert.ok(c, "instantiation works without baseUrl");
  });
});
