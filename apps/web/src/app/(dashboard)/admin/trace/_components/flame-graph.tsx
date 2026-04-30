"use client";

/**
 * Vanilla SVG flame graph. No D3.
 *
 * Layout:
 *   width  = duration_ms / total_ms * canvasWidth
 *   x      = (started_at - trace.started_at) / total_ms * canvasWidth
 *   y      = depth * 24
 *
 * Color: ERROR=red, OK+server=blue, client=green, internal=gray.
 *
 * Tree is built from parent_span_id linkage; orphans (parent not in span set
 * — common when a parent is the inbound HTTP span from another service) are
 * placed at depth 0.
 */
import { useMemo } from "react";

export interface Span {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  service: string;
  kind: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status_code: string;
  status_message: string | null;
  attributes: Record<string, unknown> | null;
  events: unknown[] | null;
  exception: Record<string, unknown> | null;
}

interface Props {
  spans: Span[];
  traceStartedAt: string;
  totalMs: number;
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
  width?: number;
}

interface Laid {
  span: Span;
  depth: number;
  xPx: number;
  widthPx: number;
}

const ROW_H = 24;
const CANVAS_DEFAULT = 1000;
const MIN_RECT_W = 2; // smallest visible rect

function colorFor(span: Span): string {
  if (span.status_code === "ERROR") return "#ef4444"; // red-500
  switch (span.kind) {
    case "server":
      return "#3b82f6"; // blue-500
    case "client":
      return "#22c55e"; // green-500
    case "producer":
    case "consumer":
      return "#a855f7"; // purple-500
    default:
      return "#6b7280"; // gray-500
  }
}

export function FlameGraph({
  spans,
  traceStartedAt,
  totalMs,
  selectedSpanId,
  onSelect,
  width = CANVAS_DEFAULT,
}: Props) {
  const { laid, height } = useMemo(() => {
    if (spans.length === 0) return { laid: [] as Laid[], height: ROW_H };

    // depth lookup: walk parent chain
    const byId = new Map<string, Span>();
    spans.forEach((s) => byId.set(s.span_id, s));

    const depthCache = new Map<string, number>();
    function depthOf(s: Span): number {
      const cached = depthCache.get(s.span_id);
      if (cached !== undefined) return cached;
      if (!s.parent_span_id) {
        depthCache.set(s.span_id, 0);
        return 0;
      }
      const parent = byId.get(s.parent_span_id);
      if (!parent) {
        // orphan — likely cross-service parent
        depthCache.set(s.span_id, 0);
        return 0;
      }
      const d = depthOf(parent) + 1;
      depthCache.set(s.span_id, d);
      return d;
    }

    const t0 = new Date(traceStartedAt).getTime();
    const denom = Math.max(totalMs, 1);

    const laid: Laid[] = spans.map((s) => {
      const depth = depthOf(s);
      const start = new Date(s.started_at).getTime();
      const dur = s.duration_ms ?? 0;
      const xPx = ((start - t0) / denom) * width;
      const widthPx = Math.max((dur / denom) * width, MIN_RECT_W);
      return { span: s, depth, xPx, widthPx };
    });

    const maxDepth = laid.reduce((m, l) => Math.max(m, l.depth), 0);
    return { laid, height: (maxDepth + 1) * ROW_H + 8 };
  }, [spans, traceStartedAt, totalMs, width]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-2">
      <svg width={width} height={height} role="img" aria-label="Trace flame graph">
        {laid.map(({ span, depth, xPx, widthPx }) => {
          const isSelected = selectedSpanId === span.span_id;
          const fill = colorFor(span);
          const y = depth * ROW_H;
          return (
            <g
              key={`${span.span_id}-${span.started_at}`}
              onClick={() => onSelect(span.span_id)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={xPx}
                y={y}
                width={widthPx}
                height={ROW_H - 4}
                fill={fill}
                fillOpacity={isSelected ? 1 : 0.85}
                stroke={isSelected ? "#fbbf24" : "rgba(0,0,0,0.2)"}
                strokeWidth={isSelected ? 2 : 1}
                rx={2}
              />
              {widthPx > 50 && (
                <text
                  x={xPx + 4}
                  y={y + 14}
                  fill="white"
                  fontSize={11}
                  style={{ pointerEvents: "none", fontFamily: "ui-monospace, monospace" }}
                >
                  {truncate(`${span.service} · ${span.name}`, Math.floor(widthPx / 7))}
                </text>
              )}
              <title>
                {`${span.service} · ${span.name}\n${span.duration_ms ?? "?"}ms · ${span.status_code}${
                  span.status_message ? `\n${span.status_message}` : ""
                }`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (n <= 1) return "";
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + "…";
}
