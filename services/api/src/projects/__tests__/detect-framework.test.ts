import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { detectFrameworkFromPrompt } from "../detect-framework.js";

describe("detectFrameworkFromPrompt", () => {
  it("matches Next.js variants", () => {
    assert.equal(detectFrameworkFromPrompt("build a next.js todo app"), "nextjs-app");
    assert.equal(detectFrameworkFromPrompt("Build a Nextjs blog"), "nextjs-app");
    assert.equal(detectFrameworkFromPrompt("App Router with server actions"), "nextjs-app");
  });

  it("matches SvelteKit", () => {
    assert.equal(detectFrameworkFromPrompt("I want a SvelteKit blog"), "sveltekit");
    assert.equal(detectFrameworkFromPrompt("svelte-kit todo"), "sveltekit");
  });

  it("matches FastAPI", () => {
    assert.equal(detectFrameworkFromPrompt("FastAPI backend with auth"), "fastapi");
    assert.equal(detectFrameworkFromPrompt("fast api server"), "fastapi");
  });

  it("matches the other strong signals", () => {
    assert.equal(detectFrameworkFromPrompt("build me an astro landing page"), "astro");
    assert.equal(detectFrameworkFromPrompt("django app with admin"), "django");
    assert.equal(detectFrameworkFromPrompt("Hono api server"), "hono");
    assert.equal(detectFrameworkFromPrompt("vite + react SPA"), "vite-react");
    assert.equal(detectFrameworkFromPrompt("Nuxt 4 storefront"), "nuxt");
  });

  it("returns null on ambiguous bare 'react'", () => {
    assert.equal(detectFrameworkFromPrompt("react app"), null);
  });

  it("returns null on empty / non-matching", () => {
    assert.equal(detectFrameworkFromPrompt(""), null);
    assert.equal(detectFrameworkFromPrompt("a simple todo list"), null);
  });

  it("returns null when two strong frameworks both appear", () => {
    assert.equal(detectFrameworkFromPrompt("build a Next.js or Nuxt app"), null);
    assert.equal(detectFrameworkFromPrompt("django backend with hono microservices"), null);
  });

  it("falls back to weak Vue/Svelte signals when no strong match", () => {
    assert.equal(detectFrameworkFromPrompt("use Vue 3"), "nuxt");
    assert.equal(detectFrameworkFromPrompt("svelte component"), "sveltekit");
  });
});
