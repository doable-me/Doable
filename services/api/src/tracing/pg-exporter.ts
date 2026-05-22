// PostgresSpanExporter: in-process OpenTelemetry SpanExporter that writes
// spans into the doable Postgres instance. No external collector required.

import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { sql } from "../db/index.js";

const SPAN_KINDS = ["internal", "server", "client", "producer", "consumer"] as const;

interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  service: string;
  kind: string;
  started_at: Date;
  ended_at: Date;
  duration_ms: number;
  status_code: "UNSET" | "OK" | "ERROR";
  status_message: string | null;
  attributes: Record<string, unknown>;
  events: unknown;
  exception: unknown;
}

export class PostgresSpanExporter implements SpanExporter {
  private shutdownStarted = false;

  async export(spans: ReadableSpan[], cb: (r: ExportResult) => void): Promise<void> {
    if (this.shutdownStarted || spans.length === 0) {
      return cb({ code: ExportResultCode.SUCCESS });
    }
    try {
      // Group spans by trace for the trace-row upsert.
      const traceMap = new Map<string, ReadableSpan[]>();
      for (const s of spans) {
        const tid = s.spanContext().traceId;
        if (!traceMap.has(tid)) traceMap.set(tid, []);
        traceMap.get(tid)!.push(s);
      }

      // Build all span rows up front. We don't wrap in a transaction —
      // both upserts are idempotent (ON CONFLICT) and partial failure on a
      // batch of N spans is acceptable for a tracing pipeline.
      const spanRows: SpanRow[] = spans.map((s) => {
        const ctx = s.spanContext();
        const dur = hrToMs(s.duration);
        const startMs = hrToMs(s.startTime);
        const endMs = startMs + dur;
        const kindIdx = typeof s.kind === "number" ? s.kind : 0;
        // ReadableSpan in OTel SDK 1.x exposes parent via parentSpanId (string?).
        // Newer SDKs expose parentSpanContext: SpanContext. Read either via cast
        // for forward-compat. Skip if it's the all-zero spanId (no parent).
        const sAny = s as unknown as {
          parentSpanId?: string;
          parentSpanContext?: { spanId?: string };
        };
        const rawParent = sAny.parentSpanId ?? sAny.parentSpanContext?.spanId;
        const parentId = rawParent && rawParent !== "0".repeat(16) ? rawParent : null;
        return {
          span_id: ctx.spanId,
          trace_id: ctx.traceId,
          parent_span_id: parentId,
          name: s.name,
          service: String(s.resource.attributes["service.name"] ?? "unknown"),
          kind: SPAN_KINDS[kindIdx] ?? "internal",
          started_at: new Date(startMs),
          ended_at: new Date(endMs),
          duration_ms: Math.round(dur),
          status_code: (["UNSET", "OK", "ERROR"][s.status.code] ?? "UNSET") as SpanRow["status_code"],
          status_message: s.status.message ?? null,
          attributes: s.attributes as Record<string, unknown>,
          events: s.events.map((e) => ({
            name: e.name,
            time: hrToMs(e.time),
            attributes: e.attributes,
          })),
          exception: extractException(s),
        };
      });

      // Map span rows by id for fast lookup of "is this span the root?".
      const spanRowByOtelId = new Map(spanRows.map((r) => [r.span_id, r]));

      for (const [traceId, group] of traceMap) {
        // The root span is the first one in the group whose parent is missing
        // from this batch (heuristic: parent might be in an earlier batch).
        const root: ReadableSpan = group.find((s) => {
          const sAny = s as unknown as { parentSpanId?: string; parentSpanContext?: { spanId?: string } };
          return !sAny.parentSpanId && !sAny.parentSpanContext?.spanId;
        }) ?? group[0]!;
        const errCount = group.filter((s) => s.status.code === 2).length;
        const services = [...new Set(group.map((s) => String(s.resource.attributes["service.name"] ?? "unknown")))];
        const rootDur = hrToMs(root.duration);
        const rootStartMs = hrToMs(root.startTime);
        const rootEndMs = rootStartMs + rootDur;
        const wsId = (root.attributes["workspace_id"] as string) ?? null;
        const userId = (root.attributes["user_id"] as string) ?? null;
        const projId = (root.attributes["project_id"] as string) ?? null;
        await sql`
          INSERT INTO traces (
            trace_id, started_at, ended_at, duration_ms,
            workspace_id, user_id, project_id,
            root_span_name, status, error_count, span_count, services
          ) VALUES (
            ${traceId},
            ${new Date(rootStartMs)},
            ${new Date(rootEndMs)},
            ${Math.round(rootDur)},
            ${wsId},
            ${userId},
            ${projId},
            ${root.name},
            ${errCount > 0 ? "error" : "ok"},
            ${errCount},
            ${group.length},
            ${services}
          )
          ON CONFLICT (trace_id) DO UPDATE SET
            ended_at      = GREATEST(traces.ended_at, EXCLUDED.ended_at),
            duration_ms   = GREATEST(traces.duration_ms, EXCLUDED.duration_ms),
            status        = CASE WHEN traces.error_count + EXCLUDED.error_count > 0 THEN 'error' ELSE traces.status END,
            error_count   = traces.error_count + EXCLUDED.error_count,
            span_count    = traces.span_count + EXCLUDED.span_count,
            services      = (
              SELECT array_agg(DISTINCT s) FROM unnest(traces.services || EXCLUDED.services) AS s
            )
        `;
      }

      for (const r of spanRows) {
        // postgres.js auto-encodes plain objects to jsonb when the column type is jsonb.
        await sql`
          INSERT INTO spans (
            span_id, trace_id, parent_span_id, name, service, kind,
            started_at, ended_at, duration_ms,
            status_code, status_message, attributes, events, exception
          ) VALUES (
            ${r.span_id}, ${r.trace_id}, ${r.parent_span_id}, ${r.name},
            ${r.service}, ${r.kind},
            ${r.started_at}, ${r.ended_at}, ${r.duration_ms},
            ${r.status_code}, ${r.status_message},
            ${sql.json(r.attributes as unknown as Parameters<typeof sql.json>[0])},
            ${sql.json(r.events as unknown as Parameters<typeof sql.json>[0])},
            ${r.exception == null ? null : sql.json(r.exception as unknown as Parameters<typeof sql.json>[0])}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      void spanRowByOtelId; // reserved for future cross-batch root resolution
      cb({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      // Never block app on tracing failure — drop the batch.
      // eslint-disable-next-line no-console
      console.warn(`[pg-exporter] export failed: ${(err as Error).message}; dropping ${spans.length} span(s)`);
      cb({ code: ExportResultCode.FAILED, error: err as Error });
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownStarted = true;
  }

  async forceFlush(): Promise<void> {
    /* BatchSpanProcessor handles flushing — exporter is stateless. */
  }
}

function hrToMs(hr: [number, number]): number {
  return hr[0] * 1000 + hr[1] / 1e6;
}

function extractException(s: ReadableSpan): unknown {
  const ex = s.events.find((e) => e.name === "exception");
  if (!ex || !ex.attributes) return null;
  return {
    type: ex.attributes["exception.type"],
    message: ex.attributes["exception.message"],
    stack: ex.attributes["exception.stacktrace"],
  };
}
