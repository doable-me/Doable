import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { detectFrameworkFromPrompt } from "../detect-framework.js";

describe("detectFrameworkFromPrompt", () => {
  it("matches Next.js variants", () => {
    assert.equal(detectFrameworkFromPrompt("build a next.js todo app"), "nextjs-app");
    assert.equal(detectFrameworkFromPrompt("Build a Nextjs blog"), "nextjs-app");
    assert.equal(detectFrameworkFromPrompt("App Router with server actions"), "nextjs-app");
  });

  it("matches Vite", () => {
    assert.equal(detectFrameworkFromPrompt("vite + react SPA"), "vite-react");
    assert.equal(detectFrameworkFromPrompt("a vite app"), "vite-react");
  });

  it("returns null on ambiguous bare 'react'", () => {
    assert.equal(detectFrameworkFromPrompt("react app"), null);
  });

  it("returns null on empty / non-matching", () => {
    assert.equal(detectFrameworkFromPrompt(""), null);
    assert.equal(detectFrameworkFromPrompt("a simple todo list"), null);
  });

  it("returns null when both shipped frameworks appear", () => {
    assert.equal(detectFrameworkFromPrompt("Next.js or Vite — your call"), null);
  });

  it("ignores prompts mentioning disabled frameworks", () => {
    // Prompts naming sveltekit/nuxt/astro/django/fastapi/hono used to map
    // to those framework ids — they're now removed, so detection falls
    // through to null and the admin default (or vite-react fallback) wins.
    assert.equal(detectFrameworkFromPrompt("I want a SvelteKit blog"), null);
    assert.equal(detectFrameworkFromPrompt("FastAPI backend with auth"), null);
    assert.equal(detectFrameworkFromPrompt("django app with admin"), null);
    assert.equal(detectFrameworkFromPrompt("Nuxt 4 storefront"), null);
  });
});
