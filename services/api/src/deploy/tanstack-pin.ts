import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { detectTanStackStart } from "../projects/detect-tanstack-start.js";

const PKG = "@lovable.dev/vite-tanstack-config";
// Last dist/-emitting line. >= 2.6 runs Nitro's cloudflare-module preset and
// emits .output/ (a Worker) which the deploy path can't host.
const PINNED = "2.4.0";

/**
 * Normalize a Lovable TanStack Start import so `vite build` emits the
 * dist/client + dist/server/server.js layout the deploy adapter stages via
 * tanstack-node-server-entry. Returns true when it rewrote package.json (the
 * caller must (re)install so the pinned version lands in node_modules). No-op +
 * false for non-TanStack projects and for projects already pinned exactly.
 */
export function pinLovableTanstackConfigSync(
  projectDir: string,
  onLog?: (s: string) => void,
): boolean {
  try {
    if (!detectTanStackStart(projectDir)) return false;
    const pkgPath = path.join(projectDir, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const field of ["dependencies", "devDependencies"] as const) {
      const cur = pkg[field]?.[PKG];
      if (cur && cur !== PINNED) {
        pkg[field]![PKG] = PINNED;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
        rmSync(path.join(projectDir, "node_modules", "@lovable.dev", "vite-tanstack-config"), {
          recursive: true,
          force: true,
        });
        onLog?.(`[tanstack-pin] pinned ${PKG} ${cur} -> ${PINNED} (dist/-emitting) for deployable build output\n`);
        return true;
      }
    }
    return false;
  } catch (err) {
    onLog?.(`[tanstack-pin] skipped: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}
