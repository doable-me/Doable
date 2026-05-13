/**
 * Local-only probe: mount just the auth router on a fresh Hono app and
 * issue an anon POST to /auth/password-reset. Verifies the route exists
 * and returns 200/400 (never 401) without a token. No DB / SMTP needed —
 * if DB is reachable it inserts a token; if not, the handler swallows
 * the error and still returns the generic envelope.
 *
 * Usage: `pnpm --filter @doable/api exec tsx scripts/verify-password-reset.ts`
 * from services/api or with full path from repo root.
 */
import { Hono } from "hono";
import { coreAuthRoutes } from "../services/api/src/routes/auth/core.js";

const app = new Hono();
app.route("/auth", coreAuthRoutes);

async function probe(path: string, body: unknown): Promise<void> {
  const res = await app.fetch(
    new Request(`http://local${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  console.log(`POST ${path}  body=${JSON.stringify(body)}`);
  console.log(`  -> ${res.status} ${text}`);
  console.log();
}

async function main(): Promise<void> {
  await probe("/auth/password-reset", { email: "qa-owner@doable.test" });
  await probe("/auth/password-reset", { email: "x@x" });
  await probe("/auth/password-reset", {});
  await probe("/auth/forgot-password", { email: "qa-owner@doable.test" });
}

void main();
