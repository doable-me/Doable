/**
 * R11 — verification probe for the three fixes on branch
 * fix/r11-pdf-attachment-prompt-and-persist.
 *
 * Validates the prompt-assembly side of the root-cause fix without
 * needing a live API server or pdf-parse running against a real binary.
 * We import processAttachments() directly and hand it a synthetic
 * text-attachment (mime=text/plain) which exercises the exact same
 * augmentedPrompt assembly path that PDFs go through.
 *
 * Run from repo root:
 *   pnpm exec tsx scripts/r11-test-pdf-attachment-fix.ts
 */
import { processAttachments } from "../services/api/src/ai/attachments.js";

// ─── Assertion helpers ──────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, label, `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

// ─── Test 1: docs attached → delimited block + repeated user prompt ──

async function testWithAttachments(): Promise<void> {
  console.log("\n[1] processAttachments WITH a text doc:");
  const fakeDocBody =
    "SECTION 1. SYSTEM NAME\nThe system shall be called LibraryManager.\n" +
    "SECTION 2. FEATURES\n- search by title\n- borrow / return\n- overdue email";
  const userPrompt =
    "Read the attached SRS and build a React app whose title is the system name.";

  // Encode the body as a data URL the way the API receives it.
  const dataUrl = "data:text/plain;base64," + Buffer.from(fakeDocBody, "utf-8").toString("base64");

  const result = await processAttachments(
    [{ type: "text/plain", data: dataUrl, name: "fake-srs.txt" }],
    userPrompt,
  );

  const prompt = result.augmentedPrompt;

  // 1A — the doc-fence delimiters appear exactly once each.
  const openFenceMatches = prompt.match(/========== ATTACHED DOCUMENTS \(use these to fulfill the user's request\) ==========/g) ?? [];
  const closeFenceMatches = prompt.match(/========== END OF ATTACHED DOCUMENTS ==========/g) ?? [];
  assertEq(openFenceMatches.length, 1, "open ATTACHED DOCUMENTS fence appears once");
  assertEq(closeFenceMatches.length, 1, "close ATTACHED DOCUMENTS fence appears once");

  // 1B — the repeated-user-request fence appears too.
  const repeatFenceMatches = prompt.match(/========== USER REQUEST \(REPEATED — execute this against the documents above\) ==========/g) ?? [];
  const repeatCloseMatches = prompt.match(/========== END OF USER REQUEST ==========/g) ?? [];
  assertEq(repeatFenceMatches.length, 1, "USER REQUEST (REPEATED) fence appears once");
  assertEq(repeatCloseMatches.length, 1, "END OF USER REQUEST fence appears once");

  // 1C — the doc body is INSIDE the fence (between open + close).
  const openIdx = prompt.indexOf("========== ATTACHED DOCUMENTS");
  const closeIdx = prompt.indexOf("========== END OF ATTACHED DOCUMENTS");
  const docIdx = prompt.indexOf("The system shall be called LibraryManager.");
  assert(docIdx > openIdx && docIdx < closeIdx, "doc body sits between the ATTACHED DOCUMENTS fences");

  // 1D — the user prompt appears AFTER the doc block (the critical
  // attention-tail fix). The user prompt actually appears twice in the
  // current design: once at the very start (the original spot) and once
  // INSIDE the USER REQUEST (REPEATED) block. What matters for the bug
  // fix is that at least one occurrence is AFTER the closing doc fence.
  const userPromptLastIdx = prompt.lastIndexOf(userPrompt);
  assert(userPromptLastIdx > closeIdx, "user prompt is echoed AFTER the END OF ATTACHED DOCUMENTS fence");

  // 1E — userPrompt appears at position 0 too (original ordering preserved).
  assertEq(prompt.indexOf(userPrompt), 0, "original user prompt remains at position 0");

  // 1F — userPrompt appears exactly twice (once at front, once in repeat block).
  const userPromptCount = prompt.split(userPrompt).length - 1;
  assertEq(userPromptCount, 2, "user prompt appears exactly twice (once at front, once in REPEATED block)");

  // 1G — repeated block sits between the two repeat-fence delimiters.
  const repeatOpenIdx = prompt.indexOf("========== USER REQUEST (REPEATED");
  const repeatCloseIdx = prompt.indexOf("========== END OF USER REQUEST");
  assert(repeatOpenIdx > closeIdx, "USER REQUEST (REPEATED) block opens AFTER the doc fence closes");
  assert(repeatCloseIdx > repeatOpenIdx, "END OF USER REQUEST closes AFTER the repeat opens");
}

// ─── Test 2: NO attachments → behavior unchanged (passthrough) ──────

async function testWithoutAttachments(): Promise<void> {
  console.log("\n[2] processAttachments WITHOUT any attachments:");
  const userPrompt = "Build me a kanban board with three columns.";
  const result = await processAttachments([], userPrompt);

  assertEq(result.augmentedPrompt, userPrompt, "augmentedPrompt is verbatim userPrompt");
  assertEq(result.fileAttachments.length, 0, "no fileAttachments emitted");
  assert(!result.augmentedPrompt.includes("ATTACHED DOCUMENTS"), "doc fence is absent");
  assert(!result.augmentedPrompt.includes("USER REQUEST (REPEATED"), "repeat fence is absent");
}

// ─── Test 3: multiple docs → both wrapped inside the same fence ─────

async function testMultipleAttachments(): Promise<void> {
  console.log("\n[3] processAttachments WITH two docs:");
  const a = "data:text/plain;base64," + Buffer.from("DOC A BODY", "utf-8").toString("base64");
  const b = "data:text/plain;base64," + Buffer.from("DOC B BODY", "utf-8").toString("base64");
  const result = await processAttachments(
    [
      { type: "text/plain", data: a, name: "a.txt" },
      { type: "text/plain", data: b, name: "b.txt" },
    ],
    "Use both files to build a single app.",
  );
  const prompt = result.augmentedPrompt;

  const openIdx = prompt.indexOf("========== ATTACHED DOCUMENTS");
  const closeIdx = prompt.indexOf("========== END OF ATTACHED DOCUMENTS");
  const aIdx = prompt.indexOf("DOC A BODY");
  const bIdx = prompt.indexOf("DOC B BODY");

  assert(openIdx >= 0 && closeIdx > openIdx, "doc fence brackets are present");
  assert(aIdx > openIdx && aIdx < closeIdx, "DOC A body inside the fence");
  assert(bIdx > openIdx && bIdx < closeIdx, "DOC B body inside the fence");
  assert(aIdx < bIdx, "DOC A appears before DOC B");

  // Both --- markers still appear (the per-file marker wraps each section
  // INSIDE the doc fence — that's intentional, lets the model tell which
  // chunk came from which file).
  assert(prompt.includes("--- Attached file: a.txt ---"), "per-file marker preserved for a.txt");
  assert(prompt.includes("--- Attached file: b.txt ---"), "per-file marker preserved for b.txt");
}

// ─── Test 4: empty-PDF fallback no longer forwards a binary path ────

// We cannot exercise the actual PDF fallback path here because it requires
// pdf-parse to run against a real PDF buffer. The static guarantee we want
// is just: when fileSections is empty (no inlined docs) and we ONLY have
// notes from the fallback branch, the augmentedPrompt is plain userPrompt
// + notes, with NO doc fence. That's already covered by testWithoutAttachments
// indirectly. We add a focused assertion below that the source file no
// longer contains the legacy `Saved PDF "${name}" to ${tempPath}` log line
// (that string was the smoking gun for the empty-PDF fallback regression).
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

async function testNoStaleEmptyPdfFallback(): Promise<void> {
  console.log("\n[4] static check: empty-PDF fallback no longer forwards binary:");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, "..", "services", "api", "src", "ai", "attachments.ts"), "utf-8");
  assert(
    !src.includes("Saved PDF \"${name}\" to ${tempPath} (no text extracted; fallback)"),
    "legacy 'Saved PDF ... no text extracted; fallback' log line is removed",
  );
  assert(
    src.includes("pdf-parse returned 0 chars"),
    "new pdf-parse-returned-0 note is present",
  );
}

// ─── Static checks for fixes 2 and 3 ────────────────────────────────

async function testStaticFix2(): Promise<void> {
  console.log("\n[5] static check: setSessionId(\"\") removed from post-processing.ts:");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    resolve(here, "..", "services", "api", "src", "routes", "chat", "post-processing.ts"),
    "utf-8",
  );
  // Strip line comments so the doc comment that explains the fix
  // ("Intentionally NOT calling setSessionId(\"\") — ...") doesn't get
  // misread as a real call site.
  const codeOnly = src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  const hits = codeOnly.match(/setSessionId\(""\)/g) ?? [];
  assertEq(hits.length, 0, "no setSessionId(\"\") calls remain in post-processing.ts (excluding comments)");

  const tf = readFileSync(
    resolve(here, "..", "services", "api", "src", "ai", "trace-factory.ts"),
    "utf-8",
  );
  assert(
    /function setSessionId\(id: string\): void \{[\s\S]*?if \(!id\) return;/m.test(tf),
    "trace-factory setSessionId now guards against empty id",
  );
}

async function testStaticFix3(): Promise<void> {
  console.log("\n[6] static check: persistSessionToDb throws + workspace_id in INSERT:");
  const here = dirname(fileURLToPath(import.meta.url));
  const sm = readFileSync(
    resolve(here, "..", "services", "api", "src", "routes", "chat", "session-manager.ts"),
    "utf-8",
  );
  assert(
    sm.includes("INSERT INTO ai_sessions (project_id, user_id, workspace_id, mode, copilot_session_id)"),
    "INSERT now includes workspace_id column",
  );
  assert(
    sm.includes("throw e instanceof Error ? e : new Error(String(e));"),
    "persistSessionToDb re-throws instead of returning undefined",
  );
  assert(
    !/return undefined;\s*\}\s*\}\s*\/\*\* Recreate/.test(sm),
    "old `return undefined` swallow path is gone",
  );

  const sh = readFileSync(
    resolve(here, "..", "services", "api", "src", "routes", "chat", "send-handler.ts"),
    "utf-8",
  );
  assert(
    !sh.includes("if (dbSessionId) await saveUserMessage"),
    "send-handler no longer gates saveUserMessage on dbSessionId",
  );
  assert(
    !sh.includes("if (dbSessionId) state.assistantMessageId = await preInsertAssistantMessage"),
    "send-handler no longer gates preInsertAssistantMessage on dbSessionId",
  );

  const mig = readFileSync(
    resolve(here, "..", "services", "api", "src", "db", "migrations", "083_ai_sessions_workspace_id.sql"),
    "utf-8",
  );
  assert(
    mig.includes("ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id)"),
    "migration 083 adds workspace_id with FK to workspaces",
  );
}

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("R11 — PDF attachment + session-persistence fix verification\n");

  await testWithAttachments();
  await testWithoutAttachments();
  await testMultipleAttachments();
  await testNoStaleEmptyPdfFallback();
  await testStaticFix2();
  await testStaticFix3();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Probe crashed:", err);
  process.exit(1);
});
