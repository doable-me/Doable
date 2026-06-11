import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectTanStackStart,
  tanStackHijackViolation,
  invalidateTanStackStartCache,
} from "../detect-tanstack-start.js";

// ─── Fixture helpers ─────────────────────────────────────

function makeProject(
  files: Record<string, string>,
): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tss-detect-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const pkg = (deps: object, devDeps: object = {}) =>
  JSON.stringify({ dependencies: deps, devDependencies: devDeps });

// ─── detectTanStackStart ─────────────────────────────────

describe("detectTanStackStart", () => {
  it("detects via @tanstack/react-start dependency", () => {
    const p = makeProject({ "package.json": pkg({ "@tanstack/react-start": "^1.0.0" }) });
    assert.equal(detectTanStackStart(p.path), true);
    p.cleanup();
  });

  it("detects via @lovable.dev/vite-tanstack-config devDependency", () => {
    const p = makeProject({
      "package.json": pkg({ react: "^19" }, { "@lovable.dev/vite-tanstack-config": "^1.0.0" }),
    });
    assert.equal(detectTanStackStart(p.path), true);
    p.cleanup();
  });

  it("detects via file shape (src/start.tsx + src/routeTree.gen.ts) with no marker deps", () => {
    const p = makeProject({
      "package.json": pkg({ react: "^19", vite: "^5" }),
      "src/start.tsx": "export {}",
      "src/routeTree.gen.ts": "export const routeTree = {}",
    });
    assert.equal(detectTanStackStart(p.path), true);
    p.cleanup();
  });

  it("detects via file shape with root-level routeTree.gen.ts", () => {
    const p = makeProject({
      "package.json": pkg({ react: "^19" }),
      "src/start.ts": "export {}",
      "routeTree.gen.ts": "export const routeTree = {}",
    });
    assert.equal(detectTanStackStart(p.path), true);
    p.cleanup();
  });

  it("returns false for a classic vite-react project (main.tsx, no route tree)", () => {
    const p = makeProject({
      "package.json": pkg({ react: "^19", "react-dom": "^19" }, { vite: "^5" }),
      "src/main.tsx": "createRoot(...)",
      "index.html": '<script type="module" src="/src/main.tsx"></script>',
    });
    assert.equal(detectTanStackStart(p.path), false);
    p.cleanup();
  });

  it("returns false when only start.tsx exists without a route tree", () => {
    const p = makeProject({
      "package.json": pkg({ react: "^19" }),
      "src/start.tsx": "export {}",
    });
    assert.equal(detectTanStackStart(p.path), false);
    p.cleanup();
  });

  it("returns false for a missing/empty project dir (never throws)", () => {
    const p = makeProject({});
    assert.equal(detectTanStackStart(p.path), false);
    p.cleanup();
  });

  it("returns false on invalid package.json with no fallback file shape", () => {
    const p = makeProject({ "package.json": "{ not json" });
    assert.equal(detectTanStackStart(p.path), false);
    p.cleanup();
  });

  it("memoizes and re-evaluates only after cache invalidation", () => {
    const p = makeProject({ "package.json": pkg({ react: "^19" }) });
    assert.equal(detectTanStackStart(p.path), false); // caches false

    // Flip the project to TanStack Start on disk.
    writeFileSync(join(p.path, "package.json"), pkg({ "@tanstack/react-start": "^1" }), "utf-8");
    assert.equal(detectTanStackStart(p.path), false, "stale cache holds until invalidated");

    invalidateTanStackStartCache(p.path);
    assert.equal(detectTanStackStart(p.path), true, "re-detects after invalidation");
    p.cleanup();
  });
});

// ─── tanStackHijackViolation ─────────────────────────────

describe("tanStackHijackViolation", () => {
  it("blocks creating a CSR src/main.tsx", () => {
    assert.ok(tanStackHijackViolation("src/main.tsx", "createRoot(document.getElementById('root'))"));
    assert.ok(tanStackHijackViolation("./src/main.tsx", "x"));
    assert.ok(tanStackHijackViolation("src/main.ts", "x"));
  });

  it("blocks rewriting the native bootstrap src/start.*", () => {
    assert.ok(tanStackHijackViolation("src/start.tsx", "export {}"));
    assert.ok(tanStackHijackViolation("src/start.ts", "export {}"));
  });

  it("blocks repointing index.html away from /src/start.tsx", () => {
    assert.ok(
      tanStackHijackViolation("index.html", '<script type="module" src="/src/main.tsx"></script>'),
      "repoint to main.tsx is blocked",
    );
    assert.ok(
      tanStackHijackViolation("index.html", "<body><div id='root'></div></body>"),
      "dropping the start entry is blocked",
    );
  });

  it("allows an index.html that keeps the TanStack Start entry", () => {
    assert.equal(
      tanStackHijackViolation(
        "index.html",
        '<html><head><title>New</title></head><body><script type="module" src="/src/start.tsx"></script></body></html>',
      ),
      null,
    );
  });

  it("allows legitimate route, root-layout, and component edits", () => {
    assert.equal(tanStackHijackViolation("src/routes/about.tsx", "createFileRoute(...)"), null);
    assert.equal(tanStackHijackViolation("src/routes/__root.tsx", "createRootRoute(...)"), null);
    assert.equal(tanStackHijackViolation("src/components/Hero.tsx", "export default ..."), null);
    assert.equal(tanStackHijackViolation("src/index.css", "@import 'tailwindcss';"), null);
  });

  // ─── __root.tsx document-shell protection ───────────────
  const ROOT_WITH_SHELL =
    'function RootComponent(){return(<html><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>);}';
  const ROOT_BARE = // the Marketgrove breakage — shell stripped to a bare Outlet
    'function RootComponent(){return(<QueryClientProvider><Outlet /><Toaster /></QueryClientProvider>);}';

  it("blocks stripping the document shell (<HeadContent/>) from __root.tsx", () => {
    assert.ok(
      tanStackHijackViolation("src/routes/__root.tsx", ROOT_BARE, ROOT_WITH_SHELL),
      "removing HeadContent/head from an existing shell must be blocked",
    );
  });

  it("allows editing __root.tsx as long as the shell is kept", () => {
    const edited =
      'function RootComponent(){return(<html><head><HeadContent /><meta name="x" /></head><body><Nav /><Outlet /><Scripts /></body></html>);}';
    assert.equal(
      tanStackHijackViolation("src/routes/__root.tsx", edited, ROOT_WITH_SHELL),
      null,
    );
  });

  it("does not block __root.tsx when there is no prior shell (first write / no currentContent)", () => {
    assert.equal(tanStackHijackViolation("src/routes/__root.tsx", ROOT_BARE), null);
    assert.equal(tanStackHijackViolation("src/routes/__root.tsx", ROOT_BARE, ROOT_BARE), null);
  });
});
