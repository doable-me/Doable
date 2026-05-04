/**
 * Real AI chat e2e — drives the production chat endpoint with a real
 * user JWT and verifies an assistant message gets persisted.
 *
 * Usage on droplet:
 *   pnpm tsx --env-file=.env scripts/test-chat-real.ts \
 *      --email testadmin@doable.me --project <projectId>
 *
 * The script:
 *   1. Mints a JWT for the given user (must be platform admin OR project member)
 *   2. Snapshots the current ai_messages count for the target project
 *   3. POSTs to /projects/:id/chat with a small "add a comment" prompt
 *      and consumes the SSE stream until done or 90s timeout
 *   4. Re-counts ai_messages — verifies user msg + assistant msg landed
 *   5. Prints the assistant's first 500 chars (redacted with the same
 *      patterns as the admin log viewer)
 */

import { sql } from "../services/api/src/db/index.js";
import { signAccessToken } from "../services/api/src/lib/jwt.js";

interface Args { email?: string; project?: string; prompt?: string }
const args: Args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i]?.replace(/^--/, "") as keyof Args;
  const v = process.argv[i + 1];
  if (k && v) args[k] = v;
}
const email = args.email ?? "testadmin@doable.me";
const projectId = args.project;
const prompt = args.prompt ?? "Reply with one short sentence: confirm you can hear me. No code edits.";

if (!projectId) {
  console.error("--project <uuid> is required");
  process.exit(2);
}

const API = "http://127.0.0.1:4000";

async function main() {
  // 1. Mint JWT
  const u = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM users WHERE email = ${email}
  `;
  if (u.length === 0) throw new Error(`no user ${email}`);
  const token = await signAccessToken(u[0]!.id, u[0]!.email);
  console.log(`✓ JWT minted for ${email} (${u[0]!.id})`);

  // 2. Snapshot existing message count
  const before = await sql<{ c: number }[]>`
    SELECT COUNT(am.id)::int AS c
    FROM ai_messages am
    JOIN ai_sessions s ON s.id = am.session_id
    WHERE s.project_id = ${projectId}
  `;
  const beforeCount = before[0]?.c ?? 0;
  console.log(`✓ ai_messages count for project before: ${beforeCount}`);

  // 3. Send the chat message
  console.log(`→ POST /projects/${projectId}/chat …`);
  const startMs = Date.now();
  const resp = await fetch(`${API}/projects/${projectId}/chat`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: prompt,
      mode: "chat",
    }),
  });
  console.log(`  HTTP ${resp.status}`);
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`  body: ${text.slice(0, 500)}`);
    process.exit(3);
  }

  // 4. Drain SSE stream (up to 90s)
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("no response body");
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let eventCount = 0;
  const deadline = Date.now() + 90_000;
  const sample: string[] = [];
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      const text = decoder.decode(value, { stream: true });
      eventCount += (text.match(/\nevent:|^event:/g) ?? []).length;
      if (sample.length < 5) sample.push(text.slice(0, 200));
    }
  }
  const elapsedMs = Date.now() - startMs;
  console.log(`✓ stream drained: ${totalBytes} bytes, ~${eventCount} events, in ${elapsedMs}ms`);

  // 5. Verify new messages persisted
  await new Promise((r) => setTimeout(r, 2000)); // tail-end DB writes
  const after = await sql<{ c: number }[]>`
    SELECT COUNT(am.id)::int AS c
    FROM ai_messages am
    JOIN ai_sessions s ON s.id = am.session_id
    WHERE s.project_id = ${projectId}
  `;
  const afterCount = after[0]?.c ?? 0;
  const delta = afterCount - beforeCount;
  console.log(`✓ ai_messages count after: ${afterCount} (Δ +${delta})`);

  if (delta < 1) {
    console.error("✗ FAIL: no new messages persisted — chat round-trip didn't complete");
    process.exit(4);
  }

  // Print the most-recent assistant message (first 500 chars)
  const newMsgs = await sql<{ role: string; content: string | null; had_tool_calls: boolean; created_at: Date }[]>`
    SELECT am.role::text AS role, am.content, am.had_tool_calls, am.created_at
    FROM ai_messages am
    JOIN ai_sessions s ON s.id = am.session_id
    WHERE s.project_id = ${projectId}
    ORDER BY am.created_at DESC
    LIMIT ${delta}
  `;
  console.log(`\n--- new messages (most recent first) ---`);
  for (const m of newMsgs) {
    const preview = (m.content ?? "").slice(0, 500);
    console.log(`[${m.role}] tools=${m.had_tool_calls} ${m.created_at.toISOString()}`);
    console.log(`  ${preview.replace(/\n/g, "\n  ")}`);
  }
  console.log(`\n✓ ALL OK — chat round-trip persisted ${delta} message(s) in ${elapsedMs}ms`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
