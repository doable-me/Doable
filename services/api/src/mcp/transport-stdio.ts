/**
 * Stdio transport for local subprocess MCP servers.
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./types.js";
import type { McpTransport } from "./transport-http.js";
import { SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";

export class StdioTransport implements McpTransport {
  private connected = false;
  private process: import("node:child_process").ChildProcess | null = null;
  private pendingRequests = new Map<number | string, {
    resolve: (r: JsonRpcResponse) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = "";
  // Long-running OTel span covering the lifetime of the spawned MCP process.
  // Per-frame send/recv spans are children of this. End on disconnect/exit.
  private connectorSpan: Span | null = null;

  constructor(
    private command: string,
    private args: string[] = [],
    private env?: Record<string, string>,
  ) {}

  private get tracer() {
    return getTracer("doable-api/mcp-stdio");
  }

  private commandBasename(): string {
    return (this.command.split(/[\\/]/).pop() ?? this.command).slice(0, 80);
  }

  async connect(): Promise<void> {
    const { spawn } = await import("node:child_process");

    // Open the long-running connector span. Stays open for the process
    // lifetime; ended in disconnect() / on exit / on spawn error.
    this.connectorSpan = this.tracer.startSpan("mcp.connector", {
      kind: SpanKind.CLIENT,
      attributes: {
        "mcp.transport": "stdio",
        "mcp.command": this.commandBasename(),
        "mcp.args.count": this.args.length,
      },
    });

    // Track early exit so we can fail fast instead of waiting for 30s timeout
    let earlyExitCode: number | null | undefined = undefined;
    let stderrChunks: string[] = [];
    let spawnError: Error | null = null;

    try {
      // SECURITY: Do NOT inherit process.env — it contains DB passwords,
      // encryption keys, and API secrets. Only pass the minimal env needed
      // for the child process to run, plus any explicit serverEnv.
      const safeEnv: Record<string, string> = {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_ENV: process.env.NODE_ENV ?? "production",
        ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
        ...(process.env.TERM ? { TERM: process.env.TERM } : {}),
        ...this.env,
      };
      this.process = spawn(this.command, this.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: safeEnv,
        shell: false,
      });
    } catch (err) {
      throw new Error(
        `Failed to spawn MCP stdio process: ${err instanceof Error ? err.message : String(err)} (command: ${this.command})`,
      );
    }

    // Catch spawn 'error' events (e.g. ENOENT for missing executables).
    // Without this handler the error bubbles up as an uncaught exception
    // and kills the entire API process.
    this.process.on("error", (err) => {
      spawnError = err;
      console.error(`[MCP:stdio:${this.command}] spawn error:`, err.message);
      this.connected = false;
      this.connectorSpan?.recordException(err);
      this.connectorSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message.slice(0, 200) });
      this.connectorSpan?.end();
      this.connectorSpan = null;
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP process spawn error: ${err.message}`));
      }
      this.pendingRequests.clear();
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrChunks.push(text);
      console.error(`[MCP:stdio:${this.command}]`, text);
      this.connectorSpan?.addEvent("stderr", { line: text.slice(0, 200) });
    });

    this.process.on("exit", (code) => {
      earlyExitCode = code;
      this.connected = false;
      this.connectorSpan?.addEvent("exit", { "process.exit_code": code ?? -1 });
      if (code !== 0 && code !== null) {
        this.connectorSpan?.setStatus({ code: SpanStatusCode.ERROR, message: `exit code ${code}` });
      } else {
        this.connectorSpan?.setStatus({ code: SpanStatusCode.OK });
      }
      this.connectorSpan?.end();
      this.connectorSpan = null;
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP process exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    // Wait briefly for early crash detection — if the process exits
    // immediately (bad command, missing module), we fail fast instead of
    // letting the subsequent initialize() hang for 30s.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    // Check for spawn errors (ENOENT, EACCES, etc.)
    if (spawnError) {
      this.process = null;
      throw new Error(
        `MCP stdio process failed to start: ${(spawnError as Error).message} (command: ${this.command})`,
      );
    }

    if (earlyExitCode !== undefined) {
      const stderr = stderrChunks.join("").slice(0, 500);
      throw new Error(
        `MCP stdio process exited immediately with code ${earlyExitCode}${stderr ? `: ${stderr}` : ""}`,
      );
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.connected = false;
    if (this.connectorSpan) {
      this.connectorSpan.addEvent("disconnect");
      this.connectorSpan.setStatus({ code: SpanStatusCode.OK });
      this.connectorSpan.end();
      this.connectorSpan = null;
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Transport disconnected"));
    }
    this.pendingRequests.clear();
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.connected || !this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    // Per-request OTel span — short-lived around the actual JSON-RPC roundtrip.
    const sendSpan = this.tracer.startSpan("mcp.send", {
      kind: SpanKind.CLIENT,
      attributes: {
        "mcp.method": request.method,
        "mcp.id": String(request.id),
      },
    });
    const sendStartedAt = Date.now();

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        sendSpan.setAttribute("mcp.duration_ms", Date.now() - sendStartedAt);
        sendSpan.setStatus({ code: SpanStatusCode.ERROR, message: "timeout" });
        sendSpan.end();
        reject(new Error(`MCP request timed out after 120s: ${request.method}`));
      }, 120_000);

      this.pendingRequests.set(request.id, {
        resolve: (resp: JsonRpcResponse) => {
          const respStr = JSON.stringify(resp);
          const durationMs = Date.now() - sendTime;
          console.log(`[MCP:stdio:${this.command}] ── RESPONSE (${durationMs}ms) ──\n  ${respStr.slice(0, 2000)}${respStr.length > 2000 ? `... [${respStr.length}c]` : ""}`);
          if (resp.error) {
            console.error(`[MCP:stdio:${this.command}] ── ERROR ── code=${resp.error.code} message=${resp.error.message} data=${JSON.stringify(resp.error.data ?? null).slice(0, 500)}`);
            sendSpan.setAttribute("mcp.error.code", resp.error.code);
            sendSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(resp.error.message).slice(0, 200) });
          } else {
            sendSpan.setStatus({ code: SpanStatusCode.OK });
          }
          sendSpan.setAttribute("mcp.duration_ms", durationMs);
          sendSpan.setAttribute("mcp.response.bytes", respStr.length);
          sendSpan.end();
          resolve(resp);
        },
        reject: (err: Error) => {
          sendSpan.recordException(err);
          sendSpan.setAttribute("mcp.duration_ms", Date.now() - sendStartedAt);
          sendSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message.slice(0, 200) });
          sendSpan.end();
          reject(err);
        },
        timer,
      });

      const message = JSON.stringify(request) + "\n";
      const sendTime = Date.now();
      sendSpan.setAttribute("mcp.request.bytes", message.length);
      console.log(`[MCP:stdio:${this.command}] ── REQUEST ──\n  ${message.slice(0, 2000)}${message.length > 2000 ? `... [${message.length}c]` : ""}`);
      this.process!.stdin!.write(message);
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected || !this.process?.stdin) return;
    const message = JSON.stringify(notification) + "\n";
    const span = this.tracer.startSpan("mcp.notify", {
      kind: SpanKind.CLIENT,
      attributes: {
        "mcp.method": notification.method,
        "mcp.request.bytes": message.length,
      },
    });
    try {
      this.process.stdin.write(message);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        // Note: the per-frame correlation lives on the mcp.send span via
        // pending.resolve. This recv span captures unmatched/notification
        // frames so even server-initiated messages are visible.
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        } else {
          // Unsolicited frame (notification, log, server-push)
          this.connectorSpan?.addEvent("recv_unsolicited", {
            "mcp.frame.bytes": trimmed.length,
            "mcp.id": response.id !== undefined ? String(response.id) : "(none)",
          });
        }
      } catch (err) {
        // Non-JSON output — record on the connector span instead of dropping silently.
        this.connectorSpan?.addEvent("parse_error", {
          "mcp.frame.bytes": trimmed.length,
          "mcp.frame.snippet": trimmed.slice(0, 200),
          "error.message": (err as Error).message.slice(0, 200),
        });
      }
    }
  }
}
