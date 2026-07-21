/**
 * Tests for extract-lovable-system-prompt.ts (see PRD
 * doableinfo/LOVABLE_CHATBOT_PERSONA_PRESERVATION.md §9.1).
 *
 * Run: pnpm exec tsx --test services/api/src/projects/__tests__/extract-lovable-system-prompt.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractLovableSystemPrompt,
  extractFromSource,
} from "../extract-lovable-system-prompt.js";

// ─── Fixture helpers ─────────────────────────────────────

function makeProject(
  files: Record<string, string>,
): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "extract-lovable-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A minimal Lovable-shape chat route with the `system:` param inline.
function lovableRoute(persona: string, quote: '"' | "'" | "`" = '"'): string {
  const escaped = persona
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(quote, "g"), "\\" + quote);
  return `
import { createServerFileRoute } from "@tanstack/react-start/server";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@lovable.dev/ai";

export const ServerRoute = createServerFileRoute("/api/chat").methods({
  POST: async ({ request }) => {
    const { messages } = await request.json();
    const result = streamText({
      model: createLovableAiGatewayProvider({ apiKey: process.env.LOVABLE_API_KEY })("openai/gpt-4o-mini"),
      system: ${quote}${escaped}${quote},
      messages,
    });
    return result.toUIMessageStreamResponse();
  },
});
`;
}

// ─── extractFromSource (unit-tested; no filesystem) ─────────────

describe("extractFromSource", () => {
  it("extracts a double-quoted inline system prompt", () => {
    const src = lovableRoute("You are Ember, the virtual barista at Ember & Oak Coffee.");
    assert.equal(
      extractFromSource(src),
      "You are Ember, the virtual barista at Ember & Oak Coffee.",
    );
  });

  it("extracts a single-quoted inline system prompt", () => {
    const src = lovableRoute("You are a helpful assistant.", "'");
    assert.equal(extractFromSource(src), "You are a helpful assistant.");
  });

  it("extracts a template-literal system prompt and preserves newlines", () => {
    const persona = "You are Ember.\nYou serve coffee.\nBe warm and concise.";
    const src = lovableRoute(persona, "`");
    assert.equal(extractFromSource(src), persona);
  });

  it("resolves `system: NAME` when NAME is bound to a string literal above", () => {
    const src = `
      import { streamText } from "ai";
      const SYSTEM_PROMPT = "You are Ember, the virtual barista.";
      streamText({
        model: some(),
        system: SYSTEM_PROMPT,
        messages,
      });
    `;
    assert.equal(extractFromSource(src), "You are Ember, the virtual barista.");
  });

  it("resolves `system: NAME` when NAME is a template literal binding", () => {
    const src = [
      "const P = `You are Ember.",
      "Menu: espresso $3.50, latte $5.25.`;",
      "streamText({ system: P, messages });",
    ].join("\n");
    assert.equal(
      extractFromSource(src),
      "You are Ember.\nMenu: espresso $3.50, latte $5.25.",
    );
  });

  it("returns null when the system arg is a function call (non-literal)", () => {
    const src = `
      import { streamText } from "ai";
      streamText({ system: buildSystem(input), messages });
    `;
    assert.equal(extractFromSource(src), null);
  });

  it("returns null when there is no system field at all", () => {
    const src = `
      import { streamText } from "ai";
      streamText({ model: m, messages });
    `;
    assert.equal(extractFromSource(src), null);
  });

  it("returns null on an empty extracted string", () => {
    // "system: ''" is a literal empty string — treat as no persona.
    const src = `streamText({ system: "", messages });`;
    assert.equal(extractFromSource(src), null);
  });

  it("returns null when the extracted string exceeds MAX_EXTRACTED_LENGTH", () => {
    const huge = "a".repeat(9 * 1024); // > 8KB cap
    const src = `streamText({ system: "${huge}", messages });`;
    assert.equal(extractFromSource(src), null);
  });

  it("un-escapes common JS escape sequences", () => {
    const src = `streamText({ system: "line1\\nline2\\t\\"quoted\\"", messages });`;
    assert.equal(extractFromSource(src), 'line1\nline2\t"quoted"');
  });

  it("preserves literal backslashes correctly (no double-unescape)", () => {
    // Source: system: "path\\to\\file"  →  persona is  path\to\file
    const src = `streamText({ system: "path\\\\to\\\\file", messages });`;
    assert.equal(extractFromSource(src), "path\\to\\file");
  });

  it("ignores obvious non-identifier tokens masquerading as bindings", () => {
    // system: null / true / false / undefined — must not accidentally resolve
    for (const kw of ["null", "true", "false", "undefined"]) {
      const src = `streamText({ system: ${kw}, messages });`;
      assert.equal(extractFromSource(src), null, `keyword: ${kw}`);
    }
  });
});

// ─── extractLovableSystemPrompt (I/O-tested with real fixture dirs) ───

describe("extractLovableSystemPrompt", () => {
  it("returns null when no candidate file exists", async () => {
    const p = makeProject({ "package.json": "{}" });
    try {
      assert.equal(await extractLovableSystemPrompt(p.path), null);
    } finally { p.cleanup(); }
  });

  it("extracts from the nested TSR route (src/routes/api/chat.ts)", async () => {
    const p = makeProject({
      "src/routes/api/chat.ts": lovableRoute("You are Ember."),
    });
    try {
      assert.equal(await extractLovableSystemPrompt(p.path), "You are Ember.");
    } finally { p.cleanup(); }
  });

  it("extracts from the flat TSR route (src/routes/api.chat.ts)", async () => {
    const p = makeProject({
      "src/routes/api.chat.ts": lovableRoute("You are Ember (flat)."),
    });
    try {
      assert.equal(await extractLovableSystemPrompt(p.path), "You are Ember (flat).");
    } finally { p.cleanup(); }
  });

  it("extracts from the Next.js App Router route (app/api/chat/route.ts)", async () => {
    const p = makeProject({
      "app/api/chat/route.ts": lovableRoute("You are Ember (Next)."),
    });
    try {
      assert.equal(
        await extractLovableSystemPrompt(p.path),
        "You are Ember (Next).",
      );
    } finally { p.cleanup(); }
  });

  it("prefers the first candidate on the priority list when several exist", async () => {
    // src/routes/api/chat.ts wins over app/api/chat/route.ts (nested TSR
    // is first in CANDIDATES).
    const p = makeProject({
      "src/routes/api/chat.ts": lovableRoute("first"),
      "app/api/chat/route.ts": lovableRoute("second"),
    });
    try {
      assert.equal(await extractLovableSystemPrompt(p.path), "first");
    } finally { p.cleanup(); }
  });

  it("returns the same result on repeated calls (idempotent, no state)", async () => {
    const p = makeProject({
      "src/routes/api/chat.ts": lovableRoute("Stable persona."),
    });
    try {
      const first = await extractLovableSystemPrompt(p.path);
      const second = await extractLovableSystemPrompt(p.path);
      assert.equal(first, second);
      assert.equal(first, "Stable persona.");
    } finally { p.cleanup(); }
  });

  it("never throws on a malformed / unreadable candidate file", async () => {
    // Non-UTF-8 garbage that regex still runs against without crashing.
    const p = makeProject({
      "src/routes/api/chat.ts": "not valid javascript ??? {{{",
    });
    try {
      // Doesn't throw; returns null because no `system:` matches.
      assert.equal(await extractLovableSystemPrompt(p.path), null);
    } finally { p.cleanup(); }
  });
});
