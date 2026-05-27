import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  APP_AI_PROMPT_BLOCK,
  APP_AI_RAG_PROMPT_BLOCK,
  buildAppAiContext,
} from "../app-ai-prompt.js";

describe("APP_AI_PROMPT_BLOCK content", () => {
  it('mentions "@doable/ai"', () => {
    assert.ok(APP_AI_PROMPT_BLOCK.includes("@doable/ai"), 'Missing "@doable/ai"');
  });

  it('mentions "ai.chat" and "ai.embed"', () => {
    assert.ok(APP_AI_PROMPT_BLOCK.includes("ai.chat"), 'Missing "ai.chat"');
    assert.ok(APP_AI_PROMPT_BLOCK.includes("ai.embed"), 'Missing "ai.embed"');
  });

  it("forbids importing external provider SDKs in app code", () => {
    assert.ok(/openai/.test(APP_AI_PROMPT_BLOCK), 'Should warn about external openai SDK');
    assert.ok(/@anthropic-ai\/sdk/.test(APP_AI_PROMPT_BLOCK), 'Should warn about anthropic SDK');
  });
});

describe("APP_AI_RAG_PROMPT_BLOCK content", () => {
  it('contains "CREATE EXTENSION IF NOT EXISTS vector"', () => {
    assert.ok(
      APP_AI_RAG_PROMPT_BLOCK.includes("CREATE EXTENSION IF NOT EXISTS vector"),
      'Missing pgvector CREATE EXTENSION',
    );
  });

  it("uses cosine distance operator (<=>)", () => {
    assert.ok(APP_AI_RAG_PROMPT_BLOCK.includes("<=>"), "Missing cosine distance operator");
  });

  it("uses vector_cosine_ops in ivfflat index", () => {
    assert.ok(
      APP_AI_RAG_PROMPT_BLOCK.includes("vector_cosine_ops"),
      "Missing vector_cosine_ops in the recipe",
    );
  });

  it("teaches JSON.stringify for embedding parameter binding", () => {
    assert.ok(
      APP_AI_RAG_PROMPT_BLOCK.includes("JSON.stringify(embedding)"),
      "Should teach JSON.stringify(embedding) for pgvector parameter binding",
    );
  });
});

describe("buildAppAiContext env gating", () => {
  it("returns the block when DOABLE_APP_AI_ENABLED is unset (enabled by default; DB also unset = on, so RAG appended)", () => {
    const r = buildAppAiContext({ env: {} });
    assert.ok(r.startsWith(APP_AI_PROMPT_BLOCK), "AI block should come first");
    assert.ok(r.includes(APP_AI_RAG_PROMPT_BLOCK), "RAG block should be appended");
  });

  it("returns empty string when DOABLE_APP_AI_ENABLED is '0'", () => {
    const r = buildAppAiContext({ env: { DOABLE_APP_AI_ENABLED: "0" } });
    assert.strictEqual(r, "");
  });

  it("returns only the AI block when AI is on but DB is off", () => {
    const r = buildAppAiContext({ env: { DOABLE_APP_AI_ENABLED: "1", DOABLE_APP_DB_ENABLED: "0" } });
    assert.strictEqual(r, APP_AI_PROMPT_BLOCK);
  });

  it("appends the RAG block when both AI and DB flags are on", () => {
    const r = buildAppAiContext({
      env: { DOABLE_APP_AI_ENABLED: "1", DOABLE_APP_DB_ENABLED: "1" },
    });
    assert.ok(r.startsWith(APP_AI_PROMPT_BLOCK), "AI block should come first");
    assert.ok(r.includes(APP_AI_RAG_PROMPT_BLOCK), "RAG block should be appended");
  });
});
