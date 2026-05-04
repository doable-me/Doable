/**
 * Mint a short-lived admin JWT for testing.
 *
 * Usage:
 *   pnpm tsx scripts/mint-admin-token.ts <email>
 *
 * Prints the bearer token on stdout. Caller is responsible for
 * keeping it out of logs / shell history.
 */
import { sql } from "../services/api/src/db/index.js";
import { signAccessToken } from "../services/api/src/lib/jwt.js";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: mint-admin-token.ts <email>");
    process.exit(2);
  }
  const rows = await sql<{ id: string; email: string; is_platform_admin: boolean }[]>`
    SELECT id, email, is_platform_admin FROM users WHERE email = ${email}
  `;
  const u = rows[0];
  if (!u) {
    console.error(`no user with email ${email}`);
    process.exit(3);
  }
  if (!u.is_platform_admin) {
    console.error(`user ${email} is not a platform admin`);
    process.exit(4);
  }
  const token = await signAccessToken(u.id, u.email);
  const refresh = await (await import("../services/api/src/lib/jwt.js")).signRefreshToken(u.id);
  // print as JSON so callers can grab both
  console.log(JSON.stringify({ access: token, refresh }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
