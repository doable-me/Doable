import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeForPlatform } from "../sandbox-args.js";
import type { ComposeOpts } from "../sandbox-args.js";

const BASE_OPTS: ComposeOpts = {
  projectId: "proj-abc-123",
  dataDir: "/srv/doable/projects/proj-abc-123/.doable/app.db",
  socketPath: "/srv/doable/projects/proj-abc-123/.doable/db.sock",
  workerEntry: "/opt/doable/services/api/dist/data-worker/index.js",
  nodeExec: "/usr/local/bin/node",
  memoryMb: 128,
  idleShutdownMs: 660_000,
  rowCap: 10_000,
  queryTimeoutMs: 5_000,
  uid: 10042,
};

const WIN_OPTS: ComposeOpts = {
  projectId: "proj-win-456",
  dataDir: "C:\\doable\\projects\\proj-win-456\\.doable\\app.db",
  pipeName: "\\\\.\\pipe\\doable-db-proj-win-456",
  workerEntry: "C:\\doable\\api\\dist\\data-worker\\index.js",
  nodeExec: "C:\\Program Files\\nodejs\\node.exe",
  memoryMb: 128,
  idleShutdownMs: 660_000,
  rowCap: 10_000,
  queryTimeoutMs: 5_000,
};

describe("composeForPlatform — linux (bwrap profile)", () => {
  const plan = composeForPlatform("linux", BASE_OPTS);

  it("command ends with bwrap", () => {
    assert.ok(
      plan.command.endsWith("bwrap"),
      `expected command to end with "bwrap", got: ${plan.command}`,
    );
  });

  it("profile is bwrap", () => {
    assert.equal(plan.profile, "bwrap");
  });

  it("degraded is false", () => {
    assert.equal(plan.degraded, false);
  });

  it("uid is carried through from opts", () => {
    assert.equal(plan.uid, 10042);
  });

  it("args includes --unshare-net", () => {
    assert.ok(plan.args.includes("--unshare-net"), "missing --unshare-net");
  });

  it("args includes --die-with-parent", () => {
    assert.ok(plan.args.includes("--die-with-parent"), "missing --die-with-parent");
  });

  it("args includes --cap-drop ALL", () => {
    const idx = plan.args.indexOf("--cap-drop");
    assert.ok(idx !== -1, "missing --cap-drop");
    assert.equal(plan.args[idx + 1], "ALL");
  });

  it("args includes --unshare-pid", () => {
    assert.ok(plan.args.includes("--unshare-pid"), "missing --unshare-pid");
  });

  it("bind mounts .doable dir to /work/.doable", () => {
    // --bind <host doableDir> /work/.doable
    const bindIdx = plan.args.indexOf("--bind");
    assert.ok(bindIdx !== -1, "missing --bind");
    // host side should be path.dirname(dataDir) = the .doable dir
    assert.equal(
      plan.args[bindIdx + 1],
      "/srv/doable/projects/proj-abc-123/.doable",
    );
    assert.equal(plan.args[bindIdx + 2], "/work/.doable");
  });

  it("worker entry appears after the -- separator", () => {
    const sepIdx = plan.args.indexOf("--");
    assert.ok(sepIdx !== -1, 'missing "--" separator');
    // node exec is immediately after --
    assert.equal(plan.args[sepIdx + 1], BASE_OPTS.nodeExec);
    // worker entry is after node exec
    assert.equal(plan.args[sepIdx + 2], BASE_OPTS.workerEntry);
  });

  it("--project-id appears after -- with correct value", () => {
    const sepIdx = plan.args.indexOf("--");
    const workerSection = plan.args.slice(sepIdx + 1);
    const pidIdx = workerSection.indexOf("--project-id");
    assert.ok(pidIdx !== -1, "missing --project-id in worker section");
    assert.equal(workerSection[pidIdx + 1], BASE_OPTS.projectId);
  });

  it("--socket-path is /work/.doable/db.sock inside jail", () => {
    const sepIdx = plan.args.indexOf("--");
    const workerSection = plan.args.slice(sepIdx + 1);
    const idx = workerSection.indexOf("--socket-path");
    assert.ok(idx !== -1, "missing --socket-path");
    assert.equal(workerSection[idx + 1], "/work/.doable/db.sock");
  });

  it("--data-dir is /work/.doable/app.db inside jail", () => {
    const sepIdx = plan.args.indexOf("--");
    const workerSection = plan.args.slice(sepIdx + 1);
    const idx = workerSection.indexOf("--data-dir");
    assert.ok(idx !== -1, "missing --data-dir");
    assert.equal(workerSection[idx + 1], "/work/.doable/app.db");
  });

  it("NODE_OPTIONS max-old-space-size is set via --setenv", () => {
    const idx = plan.args.indexOf("NODE_OPTIONS");
    assert.ok(idx !== -1, "NODE_OPTIONS not set via --setenv");
    assert.ok(
      plan.args[idx + 1]!.includes("max-old-space-size"),
      "NODE_OPTIONS value missing max-old-space-size",
    );
  });
});

describe("composeForPlatform — win32 (plain profile)", () => {
  const plan = composeForPlatform("win32", WIN_OPTS);

  it("profile is plain", () => {
    assert.equal(plan.profile, "plain");
  });

  it("degraded is true", () => {
    assert.equal(plan.degraded, true);
  });

  it("command is the node executable", () => {
    assert.equal(plan.command, WIN_OPTS.nodeExec);
  });

  it("args[0] is workerEntry", () => {
    assert.equal(plan.args[0], WIN_OPTS.workerEntry);
  });

  it("args includes --pipe-name", () => {
    assert.ok(plan.args.includes("--pipe-name"), "missing --pipe-name");
  });

  it("pipe name contains doable-db- prefix", () => {
    const idx = plan.args.indexOf("--pipe-name");
    assert.ok(idx !== -1);
    assert.ok(
      plan.args[idx + 1]!.includes("doable-db-"),
      `pipe name should contain "doable-db-", got: ${plan.args[idx + 1]}`,
    );
  });

  it("pipe name contains the project id", () => {
    const idx = plan.args.indexOf("--pipe-name");
    assert.ok(idx !== -1);
    assert.ok(
      plan.args[idx + 1]!.includes(WIN_OPTS.projectId),
      `pipe name should contain projectId, got: ${plan.args[idx + 1]}`,
    );
  });

  it("env.NODE_OPTIONS contains max-old-space-size", () => {
    assert.ok(
      plan.env.NODE_OPTIONS?.includes("max-old-space-size"),
      `NODE_OPTIONS should contain max-old-space-size, got: ${plan.env.NODE_OPTIONS}`,
    );
  });

  it("uid is not set on win32", () => {
    assert.equal(plan.uid, undefined);
  });
});

describe("composeForPlatform — win32 without explicit pipeName (auto-derive)", () => {
  const optsNoPipe: ComposeOpts = { ...WIN_OPTS, pipeName: undefined };
  const plan = composeForPlatform("win32", optsNoPipe);

  it("auto-derives pipe name from projectId", () => {
    const idx = plan.args.indexOf("--pipe-name");
    assert.ok(idx !== -1, "missing --pipe-name");
    const pipe = plan.args[idx + 1]!;
    assert.ok(
      pipe.startsWith("\\\\.\\pipe\\doable-db-"),
      `expected UNC pipe prefix, got: ${pipe}`,
    );
    assert.ok(
      pipe.includes(WIN_OPTS.projectId),
      `expected projectId in pipe, got: ${pipe}`,
    );
  });
});

describe("composeForPlatform — linux uid=null (no uid drop)", () => {
  const plan = composeForPlatform("linux", { ...BASE_OPTS, uid: null });

  it("uid is undefined when opts.uid is null", () => {
    assert.equal(plan.uid, undefined);
  });

  it("still produces bwrap profile", () => {
    assert.equal(plan.profile, "bwrap");
  });
});
