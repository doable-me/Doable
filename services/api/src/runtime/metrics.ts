/**
 * Per-instance runtime metrics for hosted projects.
 *
 * Reads systemd + cgroup state on Linux (production); returns
 * "unknown / null" with `source: "none"` on dev hosts that have no
 * systemd. Never throws — every error path collapses to the unknown
 * shape so the API endpoint always returns a valid InstanceMetrics.
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export interface InstanceMetrics {
  state: "running" | "stopped" | "failed" | "unknown";
  uptimeMs: number | null;
  memoryBytes: number | null;
  /** 0-100. Sampled across a 200ms window via cpu.stat usage_usec delta. */
  cpuPct: number | null;
  source: "cgroup" | "ps" | "none";
}

const UNKNOWN: InstanceMetrics = {
  state: "unknown",
  uptimeMs: null,
  memoryBytes: null,
  cpuPct: null,
  source: "none",
};

export async function getInstanceMetrics(slug: string): Promise<InstanceMetrics> {
  if (process.platform !== "linux") return UNKNOWN;

  try {
    const unit = `doable-app@${slug}.service`;
    const cgroupBase = `/sys/fs/cgroup/system.slice/${unit}`;

    const state = readSystemdState(unit);
    const uptimeMs = readSystemdUptime(unit);
    const memoryBytes = await readCgroupMemory(cgroupBase);
    const cpuPct = await sampleCgroupCpu(cgroupBase);

    return {
      state,
      uptimeMs,
      memoryBytes,
      cpuPct,
      source: "cgroup",
    };
  } catch {
    return UNKNOWN;
  }
}

function readSystemdState(unit: string): InstanceMetrics["state"] {
  try {
    const r = spawnSync(
      "systemctl",
      ["show", unit, "--property=ActiveState", "--value"],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 2000 },
    );
    if (r.status !== 0) return "unknown";
    const value = r.stdout?.toString().trim() ?? "";
    if (value === "active") return "running";
    if (value === "inactive") return "stopped";
    if (value === "failed") return "failed";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function readSystemdUptime(unit: string): number | null {
  try {
    const r = spawnSync(
      "systemctl",
      ["show", unit, "--property=ActiveEnterTimestamp", "--value"],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 2000 },
    );
    if (r.status !== 0) return null;
    const value = r.stdout?.toString().trim() ?? "";
    if (!value) return null;
    const t = Date.parse(value);
    if (!Number.isFinite(t)) return null;
    return Date.now() - t;
  } catch {
    return null;
  }
}

async function readCgroupMemory(cgroupBase: string): Promise<number | null> {
  try {
    const txt = await readFile(`${cgroupBase}/memory.current`, "utf-8");
    const n = parseInt(txt.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function sampleCgroupCpu(cgroupBase: string): Promise<number | null> {
  try {
    const a = await readCpuUsec(cgroupBase);
    if (a === null) return null;
    await sleep(200);
    const b = await readCpuUsec(cgroupBase);
    if (b === null) return null;
    const deltaUsec = b - a;
    // 200ms window = 200_000 microseconds of wall time on ONE core. Going
    // over 100 means multi-core; cap at 100 so the UI bar makes sense.
    const pct = (deltaUsec / 200_000) * 100;
    return Math.max(0, Math.min(100, pct));
  } catch {
    return null;
  }
}

async function readCpuUsec(cgroupBase: string): Promise<number | null> {
  try {
    const txt = await readFile(`${cgroupBase}/cpu.stat`, "utf-8");
    for (const line of txt.split("\n")) {
      if (line.startsWith("usage_usec ")) {
        const n = parseInt(line.slice("usage_usec ".length).trim(), 10);
        return Number.isFinite(n) ? n : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
