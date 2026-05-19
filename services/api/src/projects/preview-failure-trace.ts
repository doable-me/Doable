/**
 * preview.start.failed — structured trace emission for per-project dev-server
 * start failures (e.g. `npm install exit 243` in the dodev bwrap sandbox).
 *
 * Two parallel sinks, both already deployed in this repo:
 *   1. OpenTelemetry span via `getTracer()` — auto-redacted by
 *      RedactingSpanProcessor (scrubSecrets on every string attribute) and
 *      persisted by PostgresSpanExporter into the `spans` table.
 *   2. xray.recordVaultEvent — rolling in-memory audit record exposed via
 *      `GET /admin/xray/vault?projectId=...`, surviving across chat turns.
 *
 * ── How to query (operators / future Claude sessions) ──
 *   - OTel  : SELECT * FROM otel_spans WHERE name = 'preview.start.failed'
 *             ORDER BY start_time DESC LIMIT 50;
 *   - xray  : GET /admin/xray/vault?projectId=<id>  -> filter type=preview.start.failed
 *   - Live  : tail services/api stdout for "[preview-trace] preview.start.failed"
 *   - Quick : the build-events SSE stream already shows it inline (build_error).
 *
 * NDJSON fallback path is NOT used here — OTel + xray are both first-class
 * sinks in this codebase. If a future deploy ships with TRACING_LEVEL=off
 * AND no xray subscribers, the console.warn line below is still queryable
 * via journalctl on the api unit.
 */

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";
import { scrubSecrets } from "../tracing/secret-patterns.js";
import { xray } from "../integrations/xray.js";

const ANSI_RE = /\[[0-9;]*[a-zA-Z]/g;
const LAST_LINES = 200;
const MAX_BYTES = 8 * 1024;

export interface PreviewStartFailedInput {
  projectId: string;
  workspaceId: string | null;
  userId: string | null;
  sandboxUid: number | null;
  workDir: string;
  exitCode: number | null;
  signal?: string | null;
  durationMs: number;
  npmCmd: string;
  framework: string;
  rawOutput: string;
  errorMessage?: string;
}

function tailLines(buf: string): string {
  if (!buf) return "";
  const stripped = scrubSecrets(buf.replace(ANSI_RE, ""));
  const lines = stripped.split(/\r?\n/);
  let slice = lines.slice(-LAST_LINES).join("\n");
  if (Buffer.byteLength(slice, "utf8") > MAX_BYTES) {
    slice = slice.slice(slice.length - MAX_BYTES);
  }
  return slice;
}

export function emitPreviewStartFailed(input: PreviewStartFailedInput): void {
  const lastStderrLines = tailLines(input.rawOutput);
  const timestamp = new Date().toISOString();

  const payload = {
    event: "preview.start.failed",
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    sandboxUid: input.sandboxUid,
    workDir: input.workDir,
    exitCode: input.exitCode,
    signal: input.signal ?? null,
    durationMs: input.durationMs,
    npmCmd: input.npmCmd,
    framework: input.framework,
    lastStderrLines,
    timestamp,
  };

  // ── Sink 1: OTel span (persisted to otel_spans via PostgresSpanExporter) ──
  try {
    const tracer = getTracer("doable-api/preview");
    const span = tracer.startSpan("preview.start.failed", {
      kind: SpanKind.INTERNAL,
      attributes: {
        "preview.project_id": input.projectId,
        "preview.workspace_id": input.workspaceId ?? "",
        "preview.user_id": input.userId ?? "",
        "preview.sandbox_uid": input.sandboxUid ?? -1,
        "preview.work_dir": input.workDir,
        "preview.exit_code": input.exitCode ?? -1,
        "preview.signal": input.signal ?? "",
        "preview.duration_ms": input.durationMs,
        "preview.npm_cmd": input.npmCmd,
        "preview.framework": input.framework,
        "preview.last_stderr": lastStderrLines,
      },
    });
    span.addEvent("preview.start.failed", { reason: scrubSecrets(input.errorMessage ?? "") });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: scrubSecrets(input.errorMessage ?? `exit ${input.exitCode}`).slice(0, 500),
    });
    span.end();
  } catch {
    // Tracing must never block dev-server diagnostics.
  }

  // ── Sink 2: xray rolling audit history (queryable cross-turn) ──
  try {
    xray.recordVaultEvent({
      projectId: input.projectId,
      type: "preview.start.failed",
      data: payload,
    });
  } catch {
    // xray.recordVaultEvent is best-effort.
  }

  // ── Sink 3 (always): one structured log line for journalctl forensics ──
  console.warn(
    `[preview-trace] preview.start.failed project=${input.projectId} exit=${input.exitCode} signal=${input.signal ?? ""} framework=${input.framework} uid=${input.sandboxUid ?? "-"} dur=${input.durationMs}ms`,
  );
}
