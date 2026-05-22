import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { sql } from "../db/index.js";

interface SupervisorHandle {
  stop(): void;
}

/**
 * Subscribe to systemd journal for doable-app@* unit state changes.
 * On unit failure: bump fail_count, set state='failed'.
 * On unit active: set state='running'.
 * On unit inactive: set state='stopped'.
 *
 * Linux + systemd only. On other platforms (Windows/macOS dev), returns
 * a no-op handle and logs a warning.
 *
 * Per devframeworkPRD/06-runtime-and-publish.md §4.4.
 */
export function startSupervisor(): SupervisorHandle {
  if (process.platform !== "linux" || !hasSystemctl()) {
    console.warn("[runtime/supervisor] systemctl not available; supervisor disabled");
    return { stop: () => {} };
  }

  let child: ChildProcess | null = null;
  let stopped = false;

  function attach(): void {
    if (stopped) return;
    // journalctl emits one JSON object per line on stdout.
    // -u 'doable-app@*' matches the per-app units.
    // -f follows; -o json gives structured output; --no-pager required for streaming.
    child = spawn(
      "journalctl",
      ["-u", "doable-app@*.service", "-f", "-o", "json", "--no-pager", "-n", "0"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep partial line for next chunk
      for (const line of lines) {
        if (!line.trim()) continue;
        handleJournalLine(line).catch((err) => {
          console.warn(
            "[runtime/supervisor] journal line error:",
            err instanceof Error ? err.message : err,
          );
        });
      }
    });

    child.on("close", () => {
      child = null;
      if (!stopped) {
        // journalctl exited unexpectedly; restart after a short backoff.
        setTimeout(attach, 5_000);
      }
    });
  }

  // Reconcile on boot - read every running/starting row, check actual systemctl state.
  reconcileOnBoot().catch((err) => {
    console.warn(
      "[runtime/supervisor] reconcile failed:",
      err instanceof Error ? err.message : err,
    );
  });

  attach();

  return {
    stop: () => {
      stopped = true;
      try {
        child?.kill("SIGTERM");
      } catch {
        // ignore
      }
    },
  };
}

async function handleJournalLine(line: string): Promise<void> {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }

  const unit = typeof entry["_SYSTEMD_UNIT"] === "string" ? entry["_SYSTEMD_UNIT"] : null;
  if (!unit || !unit.startsWith("doable-app@") || !unit.endsWith(".service")) return;

  // We're interested in unit-state messages: MESSAGE_ID 39f53479d3a045ac8e11786248231fbf is "unit started"
  // and 7d4958e842da4a758f6c1cedaedd8c9a is "unit failed". Simpler: parse the MESSAGE field.
  const msg = typeof entry["MESSAGE"] === "string" ? entry["MESSAGE"] : "";
  let nextState: "running" | "failed" | "stopped" | null = null;
  if (msg.includes("Started") || msg.includes("Reloaded")) nextState = "running";
  else if (msg.includes("Failed with result") || msg.includes("entered failed state"))
    nextState = "failed";
  else if (msg.match(/Stopped|Deactivated|Succeeded$/)) nextState = "stopped";

  if (!nextState) return;

  if (nextState === "failed") {
    await sql`
      UPDATE project_runtime
      SET state='failed', fail_count = fail_count + 1, updated_at = now()
      WHERE systemd_unit = ${unit}
    `;
  } else {
    await sql`
      UPDATE project_runtime
      SET state=${nextState}, updated_at = now()
      WHERE systemd_unit = ${unit}
    `;
  }
}

async function reconcileOnBoot(): Promise<void> {
  const rows = await sql<{ project_id: string; systemd_unit: string | null }[]>`
    SELECT project_id, systemd_unit
    FROM project_runtime
    WHERE state IN ('running','starting') AND systemd_unit IS NOT NULL
  `;
  for (const row of rows) {
    if (!row.systemd_unit) continue;
    const r = spawnSync("systemctl", ["is-active", row.systemd_unit], { encoding: "utf-8" });
    const actual = (r.stdout ?? "").trim();
    let dbState: "running" | "stopped" | "failed";
    if (actual === "active") dbState = "running";
    else if (actual === "failed") dbState = "failed";
    else dbState = "stopped";
    await sql`
      UPDATE project_runtime
      SET state=${dbState}, updated_at=now()
      WHERE project_id=${row.project_id}
    `;
  }
}

function hasSystemctl(): boolean {
  try {
    return spawnSync("which", ["systemctl"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

// ─── Health Check Loop ─────────────────────────────────────

const HEALTH_INTERVAL_MS = 30_000;  // 30s between checks
const HEALTH_TIMEOUT_MS = 5_000;    // 5s per request
const MAX_CONSECUTIVE_FAILURES = 3;

interface HealthState {
  consecutiveFailures: number;
}

const healthStates = new Map<string, HealthState>();

export function startHealthCheckLoop(): { stop: () => void } {
  if (process.platform !== "linux") {
    return { stop: () => {} };
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function checkAll(): Promise<void> {
    if (stopped) return;

    let rows: { project_id: string; listen_addr: string | null; systemd_unit: string | null }[];
    try {
      rows = await sql<typeof rows>`
        SELECT project_id, listen_addr, systemd_unit
        FROM project_runtime
        WHERE state = 'running' AND runtime_kind = 'process' AND listen_addr IS NOT NULL
      `;
    } catch {
      scheduleNext();
      return;
    }

    for (const row of rows) {
      if (stopped) break;
      if (!row.listen_addr) continue;

      const healthUrl = row.listen_addr.startsWith("http")
        ? row.listen_addr
        : `http://${row.listen_addr}`;

      let ok = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const resp = await fetch(healthUrl, { signal: controller.signal, method: "GET" });
        clearTimeout(timeout);
        ok = resp.status < 500;
      } catch {
        ok = false;
      }

      const state = healthStates.get(row.project_id) ?? { consecutiveFailures: 0 };

      if (ok) {
        state.consecutiveFailures = 0;
        healthStates.set(row.project_id, state);
      } else {
        state.consecutiveFailures++;
        healthStates.set(row.project_id, state);

        if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(
            `[runtime/health] ${row.project_id} failed ${state.consecutiveFailures} consecutive checks — marking failed`,
          );
          await sql`
            UPDATE project_runtime
            SET state = 'failed', fail_count = fail_count + 1, updated_at = now()
            WHERE project_id = ${row.project_id} AND state = 'running'
          `;
          state.consecutiveFailures = 0;

          // Attempt auto-restart if fail_count is under threshold
          const [runtime] = await sql<{ fail_count: number; systemd_unit: string | null }[]>`
            SELECT fail_count, systemd_unit FROM project_runtime WHERE project_id = ${row.project_id}
          `;
          if (runtime && runtime.fail_count <= 5 && runtime.systemd_unit) {
            console.log(`[runtime/health] auto-restarting ${row.project_id} (fail_count=${runtime.fail_count})`);
            spawnSync("systemctl", ["restart", runtime.systemd_unit], { stdio: "ignore" });
            await sql`
              UPDATE project_runtime
              SET state = 'starting', last_started_at = now(), updated_at = now()
              WHERE project_id = ${row.project_id}
            `;
          }
        }
      }
    }

    scheduleNext();
  }

  function scheduleNext(): void {
    if (!stopped) {
      timer = setTimeout(checkAll, HEALTH_INTERVAL_MS);
    }
  }

  // Start after a short delay to let services boot
  timer = setTimeout(checkAll, 10_000);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

// ─── Idle Detection ────────────────────────────────────────

const IDLE_CHECK_INTERVAL_MS = 60_000;  // Check every 60s
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function startIdleDetection(): { stop: () => void } {
  if (process.platform !== "linux") {
    return { stop: () => {} };
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function checkIdle(): Promise<void> {
    if (stopped) return;

    try {
      // Find running process-kind apps that haven't been accessed recently
      const idle = await sql<{ project_id: string; systemd_unit: string; last_active_at: Date | null }[]>`
        SELECT project_id, systemd_unit, last_active_at
        FROM project_runtime
        WHERE state = 'running'
          AND runtime_kind = 'process'
          AND systemd_unit IS NOT NULL
          AND (
            last_active_at IS NULL
            OR last_active_at < now() - interval '30 minutes'
          )
      `;

      for (const row of idle) {
        if (stopped) break;
        console.log(
          `[runtime/idle] stopping idle app ${row.project_id} (last_active: ${row.last_active_at?.toISOString() ?? "never"})`,
        );
        spawnSync("systemctl", ["stop", row.systemd_unit], { stdio: "ignore" });
        await sql`
          UPDATE project_runtime
          SET state = 'stopped', updated_at = now()
          WHERE project_id = ${row.project_id}
        `;
      }
    } catch (err) {
      console.warn("[runtime/idle] check failed:", err instanceof Error ? err.message : err);
    }

    if (!stopped) {
      timer = setTimeout(checkIdle, IDLE_CHECK_INTERVAL_MS);
    }
  }

  timer = setTimeout(checkIdle, 30_000); // first check after 30s

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
