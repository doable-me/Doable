import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripThinking,
  createThinkingStripper,
  THINKING_TAGS,
} from "./thinking.ts";

// ─── Single-tag coverage (every registered tag once) ───────────────────────

describe("stripThinking — every supported tag name", () => {
  for (const tag of THINKING_TAGS) {
    it(`extracts <${tag}>…</${tag}>`, () => {
      const r = stripThinking(`Hi <${tag}>secret reasoning</${tag}> there`);
      // Extraction leaves a small whitespace gap where the block lived; the
      // important invariants are the leading/trailing words and the absence
      // of the secret content.
      assert.match(r.visible, /^Hi\b/);
      assert.match(r.visible, /\bthere$/);
      assert.equal(r.visible.includes("secret reasoning"), false);
      assert.deepEqual(r.thinking, ["secret reasoning"]);
    });
    it(`extracts [${tag}]…[/${tag}] bracket form`, () => {
      const r = stripThinking(`Pre [${tag}]hidden[/${tag}] post`);
      assert.equal(r.visible.includes("Pre"), true);
      assert.equal(r.visible.includes("post"), true);
      assert.equal(r.visible.includes("hidden"), false);
      assert.deepEqual(r.thinking, ["hidden"]);
    });
  }
});

describe("stripThinking — case insensitivity", () => {
  it("matches <Think> as well as <think>", () => {
    const r = stripThinking("Hi <Think>internal</THINK> bye");
    assert.deepEqual(r.thinking, ["internal"]);
    assert.match(r.visible, /Hi/);
    assert.match(r.visible, /bye/);
  });
  it("matches [REASONING] uppercase bracket form", () => {
    const r = stripThinking("a [REASONING]r1[/reasoning] b");
    assert.deepEqual(r.thinking, ["r1"]);
  });
});

describe("stripThinking — multiple blocks", () => {
  it("extracts each thinking block in order", () => {
    const r = stripThinking(
      "<think>one</think>visible1<plan>two</plan>visible2[cot]three[/cot]visible3",
    );
    assert.deepEqual(r.thinking, ["one", "two", "three"]);
    // Visible portions, when joined, contain the visibleN markers in order.
    assert.equal(/visible1.*visible2.*visible3/.test(r.visible), true);
  });
});

describe("stripThinking — nested tag (outer wins)", () => {
  it("treats inner blocks as part of the outer thinking", () => {
    const input =
      "Hello <thinking>top-level<plan>sub-plan</plan>more</thinking> world";
    const r = stripThinking(input);
    assert.deepEqual(r.thinking, ["top-level<plan>sub-plan</plan>more"]);
    assert.match(r.visible, /^Hello\s+world$/);
  });
});

describe("stripThinking — no tags", () => {
  it("returns the input unchanged when no tags present", () => {
    const r = stripThinking("Just a normal answer.");
    assert.deepEqual(r, { visible: "Just a normal answer.", thinking: [] });
  });
  it("returns empty for empty input", () => {
    const r = stripThinking("");
    assert.deepEqual(r, { visible: "", thinking: [] });
  });
});

describe("stripThinking — never strips inside code fences", () => {
  it("ignores <think> that lives inside a ``` … ``` block", () => {
    const input =
      "Here's an example:\n```\n<think>this is code, not real CoT</think>\n```\nDone.";
    const r = stripThinking(input);
    assert.equal(r.thinking.length, 0, "no thinking should be extracted");
    assert.match(r.visible, /this is code, not real CoT/);
  });
  it("ignores a fenced block whose lang tag is a thinking name", () => {
    const input = "```think\nprint('hi')\n```\nAfter.";
    const r = stripThinking(input);
    assert.equal(r.thinking.length, 0);
    assert.match(r.visible, /print\('hi'\)/);
  });
  it("still strips real <think> outside the fence", () => {
    const input =
      "Intro <think>cot</think>\n```\n<think>code</think>\n```\nOutro";
    const r = stripThinking(input);
    assert.deepEqual(r.thinking, ["cot"]);
    assert.match(r.visible, /code<\/think>/); // the fenced one survives
    assert.match(r.visible, /Intro/);
    assert.match(r.visible, /Outro/);
  });
});

// ─── Streaming coverage ─────────────────────────────────────────────────────

describe("createThinkingStripper — chunked input", () => {
  it("buffers a partial opening tag until the closer arrives", () => {
    const s = createThinkingStripper();
    let visible = "";
    let thinking: string[] = [];
    // Chunk 1: partial opener — emit nothing yet.
    let r = s.push("Hello <thi");
    visible += r.visible;
    thinking = thinking.concat(r.thinking);
    assert.equal(visible, "Hello ");
    // Chunk 2: completes the open tag + body + close.
    r = s.push("nk>secret</think> world");
    visible += r.visible;
    thinking = thinking.concat(r.thinking);
    // Final flush — nothing left.
    r = s.flush();
    visible += r.visible;
    thinking = thinking.concat(r.thinking);
    assert.match(visible, /Hello\s+world/);
    assert.deepEqual(thinking, ["secret"]);
  });

  it("handles a tag whose close arrives only on flush", () => {
    const s = createThinkingStripper();
    let visible = "";
    let thinking: string[] = [];
    let r = s.push("a <plan>step 1");
    visible += r.visible;
    r = s.push(" step 2");
    visible += r.visible;
    // No close yet → no thinking emitted, partial body still buffered.
    assert.equal(thinking.length, 0);
    r = s.push("</plan> b");
    visible += r.visible;
    thinking = thinking.concat(r.thinking);
    r = s.flush();
    visible += r.visible;
    thinking = thinking.concat(r.thinking);
    assert.match(visible, /a\s+b/);
    assert.deepEqual(thinking, ["step 1 step 2"]);
  });

  it("emits visible text from chunks that contain no tag at all", () => {
    const s = createThinkingStripper();
    const r1 = s.push("Plain answer ");
    assert.equal(r1.visible, "Plain answer ");
    const r2 = s.push("continues here.");
    assert.equal(r2.visible, "continues here.");
    const f = s.flush();
    assert.equal(f.visible, "");
  });

  it("strips bracket-form tags across chunk boundaries", () => {
    const s = createThinkingStripper();
    let visible = "";
    let thinking: string[] = [];
    for (const chunk of ["x [reaso", "ning]r-body", "[/reasoning] y"]) {
      const r = s.push(chunk);
      visible += r.visible;
      thinking = thinking.concat(r.thinking);
    }
    const f = s.flush();
    visible += f.visible;
    thinking = thinking.concat(f.thinking);
    assert.match(visible, /x\s+y/);
    assert.deepEqual(thinking, ["r-body"]);
  });

  it("does not strip inside a code fence even across chunk boundaries", () => {
    const s = createThinkingStripper();
    let visible = "";
    let thinking: string[] = [];
    for (const chunk of ["```\n<th", "ink>not c", "ot</think>\n", "```\n done"]) {
      const r = s.push(chunk);
      visible += r.visible;
      thinking = thinking.concat(r.thinking);
    }
    const f = s.flush();
    visible += f.visible;
    thinking = thinking.concat(f.thinking);
    assert.equal(thinking.length, 0);
    assert.match(visible, /not cot/);
  });
});

// ─── End-to-end sanity ──────────────────────────────────────────────────────

describe("stripThinking — full message shape", () => {
  it("typical model reply: one think block + one plan block + body", () => {
    const r = stripThinking(`<thinking>
I should consider the user's question carefully.
</thinking>

The capital of France is <plan>quickly compute the answer</plan>**Paris**.
`);
    assert.equal(r.thinking.length, 2);
    assert.match(r.thinking[0]!, /consider/i);
    assert.match(r.thinking[1]!, /compute/i);
    assert.match(r.visible, /Paris/);
    assert.equal(/<\/?thinking|<\/?plan/i.test(r.visible), false);
  });
});
