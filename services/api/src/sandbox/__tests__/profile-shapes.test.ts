/**
 * Shape tests for the sandbox profile catalog.
 *
 * Verifies that each factory in profileCatalog produces a SandboxProfile
 * that validates against the canonical zod schema, carries the high-CVE
 * syscall denylist, and emits a well-formed synthetic /etc/passwd.
 *
 * Uses node:test (this repo's test runner per envelope-crypto.test.ts).
 * Run with:
 *   pnpm tsx --test services/api/src/sandbox/__tests__/profile-shapes.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SandboxProfileSchema,
  type SandboxProfile,
} from "../../../../../packages/dovault/src/profile.js";
import {
  aiBashProfile,
  vitePreviewProfile,
  installProfile,
  buildProfile,
} from "../profiles/index.js";
import { loadSystemRules, type SystemRules } from "../system-rules.js";
import type { SpawnContext } from "../orchestrator.js";

function makeCtx(overrides: Partial<SpawnContext> = {}): SpawnContext {
  return {
    projectId: "00000000-0000-0000-0000-000000000001",
    workspaceId: null,
    userId: "00000000-0000-0000-0000-0000000000aa",
    sessionId: "00000000-0000-0000-0000-0000000000bb",
    hardening: "dev",
    ...overrides,
  };
}

interface NamedProfile {
  name: string;
  factory: (ctx: SpawnContext, sys: SystemRules) => SandboxProfile;
}

const CATALOG: NamedProfile[] = [
  { name: "ai-bash", factory: aiBashProfile },
  { name: "vite-preview", factory: vitePreviewProfile },
  { name: "install", factory: installProfile },
  { name: "build", factory: buildProfile },
];

// ───────────────────────── schema validation ─────────────────────────

let sys: SystemRules;
test("load system rules for subsequent tests", async () => {
  sys = await loadSystemRules();
  assert.ok(sys, "system rules loaded");
});

for (const { name, factory } of CATALOG) {
  test(`profile "${name}" validates against SandboxProfileSchema`, () => {
    const profile = factory(makeCtx(), sys);
    const result = SandboxProfileSchema.safeParse(profile);
    if (!result.success) {
      assert.fail(
        `Profile "${name}" failed schema validation: ${JSON.stringify(
          result.error.format(),
          null,
          2,
        )}`,
      );
    }
    assert.equal(result.success, true);
  });
}

// ───────────────────────── high-CVE syscall denylist ─────────────────────────

for (const { name, factory } of CATALOG) {
  test(`profile "${name}" includes the full syscall deny set in seccompDeny`, () => {
    const profile = factory(makeCtx(), sys);
    // Each catalog profile defines seccompDeny — the floor must be present.
    assert.ok(
      Array.isArray(profile.syscalls.seccompDeny),
      `profile "${name}" missing syscalls.seccompDeny`,
    );
    for (const sysc of sys.syscallFloors) {
      assert.ok(
        profile.syscalls.seccompDeny.includes(sysc),
        `profile "${name}" missing high-CVE syscall "${sysc}" in seccompDeny`,
      );
    }
  });
}

// ───────────────────────── synthetic /etc/passwd shape ─────────────────────────

for (const { name, factory } of CATALOG) {
  test(`profile "${name}" emits a well-formed synthetic /etc/passwd (7 colon-separated fields per line)`, () => {
    const profile = factory(makeCtx(), sys);
    const passwd = profile.fs.etcSynth["/etc/passwd"];
    assert.ok(
      typeof passwd === "string" && passwd.length > 0,
      `profile "${name}" missing /etc/passwd in etcSynth`,
    );

    const lines = passwd.split("\n").filter((line) => line.length > 0);
    assert.ok(
      lines.length >= 1,
      `profile "${name}" /etc/passwd has no entries`,
    );

    for (const line of lines) {
      const fields = line.split(":");
      assert.equal(
        fields.length,
        7,
        `profile "${name}" /etc/passwd line "${line}" has ${fields.length} fields; expected 7 (name:passwd:uid:gid:gecos:home:shell)`,
      );
      // uid and gid must be parseable integers
      assert.ok(
        /^\d+$/.test(fields[2]!),
        `profile "${name}" /etc/passwd line "${line}" has non-numeric uid "${fields[2]}"`,
      );
      assert.ok(
        /^\d+$/.test(fields[3]!),
        `profile "${name}" /etc/passwd line "${line}" has non-numeric gid "${fields[3]}"`,
      );
    }
  });
}
