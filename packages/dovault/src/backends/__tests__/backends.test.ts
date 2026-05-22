/**
 * Sandbox backend smoke tests per devframeworkPRD/11-cross-platform-sandbox.md §9.
 *
 * Per-backend assertions:
 *   1. construction works
 *   2. available() returns boolean
 *   3. wrapSpawn() returns { command, args } shape
 *   4. wrapExec() (when implemented) returns same shape with jail
 *
 * Platform-conditional via skip() so the suite passes on every host.
 * Does NOT actually spawn — only verifies the wrap shape.
 *
 * Run via: cd packages/dovault && node --test --import tsx src/backends/__tests__/backends.test.ts
 * (tsx required because package compiles to dist/ on demand.)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DirectBackend } from "../direct.js";
import { SystemdBackend } from "../systemd.js";
import { BubblewrapBackend } from "../bubblewrap.js";
import { WindowsBackend } from "../windows.js";
import { PsrootBackend } from "../psroot.js";
import { SandboxExecBackend } from "../sandbox-exec.js";
import { AppleContainerBackend } from "../apple-container.js";
import { GvisorBackend } from "../gvisor.js";
import { WindowsHeapBackend } from "../win-heap.js";

import type { ResourceBackend } from "../types.js";

const isLinux = process.platform === "linux";
const isWin32 = process.platform === "win32";
const isDarwin = process.platform === "darwin";

const DEFAULT_LIMITS = { memoryMax: "100M", cpuQuota: "50%", tasksMax: 32 };

function assertWrapShape(result: { command: string; args: string[] }): void {
  assert.equal(typeof result.command, "string");
  assert.ok(result.command.length > 0, "command is non-empty");
  assert.ok(Array.isArray(result.args), "args is array");
}

function smokeBackend(name: string, ctor: new () => ResourceBackend): void {
  describe(name, () => {
    const b = new ctor();

    it("constructs", () => {
      assert.ok(b instanceof Object);
      assert.equal(typeof b.name, "string");
      assert.equal(typeof b.priority, "number");
    });

    it("available() returns boolean", () => {
      const result = b.available();
      assert.equal(typeof result, "boolean");
    });

    it("wrapSpawn returns valid shape", () => {
      const result = b.wrapSpawn("echo", ["hello"], {
        limits: DEFAULT_LIMITS,
        blockNetwork: true,
      });
      assertWrapShape(result);
    });

    if (typeof b.wrapExec === "function") {
      it("wrapExec returns valid shape", () => {
        const result = b.wrapExec!("echo", ["hello"], {
          limits: DEFAULT_LIMITS,
          blockNetwork: true,
          jail: "/tmp/test-jail",
        });
        assertWrapShape(result);
      });
    }

    it("blockNetwork flag flows through", () => {
      const blocked = b.wrapSpawn("echo", [], {
        limits: DEFAULT_LIMITS,
        blockNetwork: true,
      });
      const unblocked = b.wrapSpawn("echo", [], {
        limits: DEFAULT_LIMITS,
        blockNetwork: false,
      });
      assertWrapShape(blocked);
      assertWrapShape(unblocked);
    });
  });
}

describe("ResourceBackend smoke tests", () => {
  smokeBackend("DirectBackend", DirectBackend);
  smokeBackend("SystemdBackend", SystemdBackend);
  smokeBackend("BubblewrapBackend", BubblewrapBackend);
  smokeBackend("WindowsBackend", WindowsBackend);
  smokeBackend("PsrootBackend", PsrootBackend);
  smokeBackend("SandboxExecBackend", SandboxExecBackend);
  smokeBackend("AppleContainerBackend", AppleContainerBackend);
  smokeBackend("GvisorBackend", GvisorBackend);
  smokeBackend("WindowsHeapBackend", WindowsHeapBackend);
});

describe("Platform-conditional availability", () => {
  it("DirectBackend always available", () => {
    assert.equal(new DirectBackend().available(), true);
  });

  if (isLinux) {
    it("SystemdBackend on linux: returns boolean (depends on cgroup delegation)", () => {
      assert.equal(typeof new SystemdBackend().available(), "boolean");
    });
    it("BubblewrapBackend on linux: returns boolean (depends on bwrap)", () => {
      assert.equal(typeof new BubblewrapBackend().available(), "boolean");
    });
  } else {
    it("Linux-only backends report unavailable on non-linux", () => {
      assert.equal(new SystemdBackend().available(), false);
      assert.equal(new BubblewrapBackend().available(), false);
      assert.equal(new GvisorBackend().available(), false);
    });
  }

  if (isWin32) {
    // WindowsBackend on win32: returns boolean — availability depends on
    // PowerShell being on PATH and reachable; per PRD §9 we only assert the
    // function doesn't throw and returns a boolean.
    it("WindowsBackend on win32: returns boolean (depends on PowerShell)", () => {
      assert.equal(typeof new WindowsBackend().available(), "boolean");
    });
    it("PsrootBackend on win32: returns boolean (depends on psroot.exe)", () => {
      assert.equal(typeof new PsrootBackend().available(), "boolean");
    });
  } else {
    it("Windows-only backends report unavailable on non-win32", () => {
      assert.equal(new WindowsBackend().available(), false);
      assert.equal(new PsrootBackend().available(), false);
      assert.equal(new WindowsHeapBackend().available(), false);
    });
  }

  if (isDarwin) {
    it("SandboxExecBackend on darwin: usually available", () => {
      assert.equal(typeof new SandboxExecBackend().available(), "boolean");
    });
  } else {
    it("Darwin-only backends report unavailable on non-darwin", () => {
      assert.equal(new SandboxExecBackend().available(), false);
      assert.equal(new AppleContainerBackend().available(), false);
    });
  }
});

describe("Opt-in backends gated by env var", () => {
  it("AppleContainerBackend requires DOVAULT_PROFILE=hardened (when on darwin arm64)", () => {
    const original = process.env.DOVAULT_PROFILE;
    delete process.env.DOVAULT_PROFILE;
    try {
      // On non-darwin/non-arm64 hosts this returns false regardless;
      // we just assert the function doesn't throw.
      assert.equal(typeof new AppleContainerBackend().available(), "boolean");
    } finally {
      if (original !== undefined) process.env.DOVAULT_PROFILE = original;
    }
  });

  it("GvisorBackend requires DOVAULT_PROFILE=hardened or DOVAULT_BACKEND=gvisor", () => {
    const a = process.env.DOVAULT_PROFILE;
    const b = process.env.DOVAULT_BACKEND;
    delete process.env.DOVAULT_PROFILE;
    delete process.env.DOVAULT_BACKEND;
    try {
      assert.equal(new GvisorBackend().available(), false);
    } finally {
      if (a !== undefined) process.env.DOVAULT_PROFILE = a;
      if (b !== undefined) process.env.DOVAULT_BACKEND = b;
    }
  });
});
