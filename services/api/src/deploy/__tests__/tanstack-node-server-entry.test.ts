import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { TANSTACK_NODE_SERVER_ENTRY } from "../tanstack-node-server-entry.js";

/**
 * Integration test for the platform Node entry that hosts a TanStack Start
 * (cloudflare-module) build. Builds a minimal fixture mirroring the real
 * output shape — dist/server/server.js exporting `{ fetch }` + a static asset
 * under dist/client/ — then runs the entry and asserts it:
 *   1. listens,
 *   2. SSR-renders `/` (200, handler HTML),
 *   3. serves dist/client/* static assets (200),
 *   4. honours the PORT/HOST env from the runtime adapter.
 */
describe("TANSTACK_NODE_SERVER_ENTRY (deploy node server)", () => {
  it("serves SSR and static client assets, listening on PORT/HOST", async () => {
    const dir = await mkdtemp(join(tmpdir(), "doable-ts-shim-"));
    let proc: ChildProcess | undefined;
    try {
      await mkdir(join(dir, "dist", "server"), { recursive: true });
      await mkdir(join(dir, "dist", "client"), { recursive: true });
      // Fixture web-fetch handler (same export shape as the real build).
      await writeFile(
        join(dir, "dist", "server", "server.js"),
        `const server = {
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === "/echo") {
      return new Response(JSON.stringify({ method: request.method }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("<html><body>SSR-OK " + u.pathname + "</body></html>", {
      status: 200, headers: { "content-type": "text/html" },
    });
  },
};
export { server as default };
`,
        "utf-8",
      );
      await writeFile(join(dir, "dist", "client", "app.js"), `export const x = 1;`, "utf-8");
      await writeFile(join(dir, "index.mjs"), TANSTACK_NODE_SERVER_ENTRY, "utf-8");

      const port = 39000 + Math.floor(Math.random() * 2000);
      proc = spawn(process.execPath, ["index.mjs"], {
        cwd: dir,
        env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await waitForListen(proc!);

      const root = await fetch(`http://127.0.0.1:${port}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain("SSR-OK");

      const asset = await fetch(`http://127.0.0.1:${port}/app.js`);
      expect(asset.status).toBe(200);
      expect(await asset.text()).toContain("export const x");

      const echo = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST" });
      expect(echo.status).toBe(200);
      expect(await echo.json()).toEqual({ method: "POST" });
    } finally {
      proc?.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  }, 25_000);
});

function waitForListen(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start within 10s")), 10_000);
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString();
      if (buf.includes("listening on")) {
        clearTimeout(t);
        resolve();
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`server exited early (code ${code}): ${buf}`));
    });
  });
}
