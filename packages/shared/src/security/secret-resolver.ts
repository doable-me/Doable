import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Resolve a process secret (JWT_SECRET, ENCRYPTION_KEY, INTERNAL_SECRET, …)
 * with a precedence that is STABLE across restarts and SHARED across the
 * api + ws processes.
 *
 * Why this exists — the bug it kills:
 *   The api and ws services each used to call a local `requireSecret()` that,
 *   when an env var was absent in a non-production boot, returned
 *   `randomBytes(32)` — a BRAND-NEW signing key on every single process start.
 *   Because the api runs under `tsx watch` (and can crash-loop), every file
 *   save / restart rotated JWT_SECRET, instantly invalidating every live
 *   access + refresh token → "session expires every few seconds". The two
 *   processes also generated DIFFERENT random values, silently breaking all
 *   WebSocket auth (collab/presence/HMR/AI-trace) and api↔ws internal RPC.
 *
 * Precedence:
 *   1. process.env[name]           — explicit operator value (.env, systemd
 *                                    EnvironmentFile, container env, k8s
 *                                    secret). Always wins. Behavior unchanged.
 *   2. NODE_ENV=production, absent  — FATAL. A generated key would not be
 *                                    shared across replicas, so we refuse to
 *                                    boot rather than issue unverifiable tokens.
 *   3. dev / self-host, absent      — read-or-create a persisted secrets file.
 *                                    Generated ONCE, reused forever, shared
 *                                    between api + ws via a deterministic,
 *                                    repo-rooted path. An atomic exclusive
 *                                    create resolves the api/ws first-boot race
 *                                    so both converge on identical values.
 *
 * Docker / k8s are unaffected: they set the env vars (step 1), so the
 * persisted-file path never runs there (and a per-container file would not be
 * shared between the api and ws containers anyway).
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * The secrets we know how to auto-generate for a keyless dev/self-host boot.
 * All are 32-byte hex. We generate the whole set in one atomic file write so a
 * single process "wins" the create and every other process reads identical
 * values. PROJECT_JWT_SECRET is intentionally absent — it derives from
 * JWT_SECRET in services/api/src/lib/secrets.ts.
 */
const AUTOGEN_SECRETS = ["JWT_SECRET", "ENCRYPTION_KEY", "INTERNAL_SECRET"] as const;

function findRepoRoot(): string {
  // Walk up from cwd to the monorepo marker. `pnpm --filter @doable/api dev`
  // and `… @doable/ws dev` may run with cwd set to each package dir, but the
  // marker lives at the repo root — so both processes converge on the SAME
  // root → the SAME secrets file → identical JWT_SECRET / INTERNAL_SECRET.
  let dir = process.cwd();
  for (let i = 0; i < 16; i++) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Candidate locations for the persisted dev-secrets file, in order. The first
 * one we can successfully read-or-write wins. Repo-root is preferred because
 * it is identical for the co-located api + ws processes; the home-dir fallback
 * covers read-only repo checkouts. An explicit override short-circuits both.
 */
function secretsFileCandidates(): string[] {
  if (process.env.DOABLE_SECRETS_FILE) return [process.env.DOABLE_SECRETS_FILE];
  return [
    path.join(findRepoRoot(), ".doable-data", "dev-secrets.json"),
    path.join(os.homedir(), ".doable", "dev-secrets.json"),
  ];
}

let cache: Record<string, string> | null = null;

/**
 * Try to read-or-create the persisted secret set at `file`. Returns the shared
 * record on success, or null if this location is unusable (read-only fs, perms)
 * so the caller can try the next candidate.
 */
function tryLoadOrInit(file: string): Record<string, string> | null {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    return null;
  }

  // Build a full candidate set up-front and attempt to claim the file with an
  // EXCLUSIVE create ("wx"). Exactly one process wins the write; everyone else
  // hits EEXIST and reads it. This single atomic event is what keeps api and ws
  // agreeing on first boot.
  const generated: Record<string, string> = {};
  for (const n of AUTOGEN_SECRETS) generated[n] = randomBytes(32).toString("hex");

  try {
    const fd = fs.openSync(file, "wx", 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(generated, null, 2));
    } finally {
      fs.closeSync(fd);
    }
    console.warn(
      `[SECURITY] No secrets in env — generated STABLE dev secrets at ${file}. ` +
        `Sessions now survive restarts. Set JWT_SECRET / ENCRYPTION_KEY / ` +
        `INTERNAL_SECRET in .env (or your secret manager) for production.`,
    );
    return generated;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
        return backfill(parsed, file);
      } catch {
        return null; // corrupt/unreadable — let caller fall through
      }
    }
    return null; // EACCES / EROFS / etc. — try the next candidate
  }
}

/** Back-fill any secret a pre-existing file pre-dates, persisting best-effort. */
function backfill(record: Record<string, string>, file: string): Record<string, string> {
  let mutated = false;
  for (const n of AUTOGEN_SECRETS) {
    if (!record[n]) {
      record[n] = randomBytes(32).toString("hex");
      mutated = true;
    }
  }
  if (mutated) {
    try {
      fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
    } catch {
      /* in-memory record still keeps THIS boot self-consistent */
    }
  }
  return record;
}

function loadDevSecrets(): Record<string, string> {
  if (cache) return cache;
  for (const file of secretsFileCandidates()) {
    const loaded = tryLoadOrInit(file);
    if (loaded) {
      cache = loaded;
      return cache;
    }
  }
  // Last resort: in-memory only (survives within this process but not a
  // restart). Generated once and cached so at least the api↔itself stays
  // consistent for this boot. Loud warning — this is the old broken behavior
  // and should never be reached on a normal filesystem.
  console.warn(
    "[SECURITY] Could not persist dev secrets to disk (read-only fs?). Falling " +
      "back to per-process values — sessions will NOT survive a restart. Set " +
      "secrets in env to fix.",
  );
  const fallback: Record<string, string> = {};
  for (const n of AUTOGEN_SECRETS) fallback[n] = randomBytes(32).toString("hex");
  cache = fallback;
  return cache;
}

/**
 * Reject the placeholder secrets shipped in deployment/docker/.env.example
 * (e.g. "change-me-run-openssl-rand-hex-32"). A naive operator who copies
 * .env.example to .env and boots WITHOUT running setup.sh would otherwise run
 * on a publicly-known, predictable secret. Treated exactly like a missing
 * secret: FATAL in production, stable generated dev secret otherwise.
 */
function isPlaceholderSecret(value: string): boolean {
  return /^change[-_ ]?me/i.test(value.trim());
}

/**
 * Resolve a required secret. See module docs for full precedence.
 *
 * @param name        env var name (e.g. "JWT_SECRET").
 * @param serviceName optional label used only in the production FATAL log line.
 */
export function resolveSecret(name: string, serviceName?: string): string {
  const fromEnv = process.env[name];
  if (fromEnv && !isPlaceholderSecret(fromEnv)) return fromEnv;

  const reason = fromEnv ? "is set to a placeholder value" : "is not set";

  if (IS_PRODUCTION) {
    const where = serviceName ? ` Cannot start ${serviceName} in production.` : "";
    console.error(
      `[FATAL] ${name} ${reason}.${where} Set a strong secret (e.g. \`openssl rand -hex 32\`) before starting in production.`,
    );
    process.exit(1);
  }

  if (fromEnv) {
    console.warn(
      `[SECURITY] ${name} is set to a placeholder value — ignoring it and using a stable generated dev secret instead. Set a real secret for production.`,
    );
  }

  const devSecrets = loadDevSecrets();
  const known = devSecrets[name];
  if (known) return known;

  // An unknown (not auto-generatable) secret requested in dev. Generate a
  // per-boot value but warn — this won't survive a restart. None of the three
  // known secrets hit this path.
  console.warn(
    `[SECURITY] ${name} is not set and is outside the persisted dev-secret set ` +
      `— using a per-boot value that will not survive a restart.`,
  );
  return randomBytes(32).toString("hex");
}
