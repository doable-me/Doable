/**
 * Stdio transport for local subprocess MCP servers.
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./types.js";
import type { McpTransport } from "./transport-http.js";

export class StdioTransport implements McpTransport {
  private connected = false;
  private process: import("node:child_process").ChildProcess | null = null;
  private pendingRequests = new Map<number | string, {
    resolve: (r: JsonRpcResponse) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = "";

  constructor(
    private command: string,
    private args: string[] = [],
    private env?: Record<string, string>,
  ) {}

  async connect(): Promise<void> {
    const { spawn } = await import("node:child_process");

    this.process = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
      shell: process.platform === "win32",
    });

    // Track early exit so we can fail fast instead of waiting for 30s timeout
    let earlyExitCode: number | null | undefined = undefined;
    let stderrChunks: string[] = [];

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrChunks.push(text);
      console.error(`[MCP:stdio:${this.command}]`, text);
    });

    this.process.on("exit", (code) => {
      earlyExitCode = code;
      this.connected = false;
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

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`MCP request timed out after 120s: ${request.method}`));
      }, 120_000);

      this.pendingRequests.set(request.id, {
        resolve: (resp: JsonRpcResponse) => {
          const respStr = JSON.stringify(resp);
          console.log(`[MCP:stdio:${this.command}] ── RESPONSE (${Date.now() - sendTime}ms) ──\n  ${respStr.slice(0, 2000)}${respStr.length > 2000 ? `... [${respStr.length}c]` : ""}`);
          if (resp.error) {
            console.error(`[MCP:stdio:${this.command}] ── ERROR ── code=${resp.error.code} message=${resp.error.message} data=${JSON.stringify(resp.error.data ?? null).slice(0, 500)}`);
          }
          resolve(resp);
        },
        reject,
        timer,
      });

      const message = JSON.stringify(request) + "\n";
      const sendTime = Date.now();
      console.log(`[MCP:stdio:${this.command}] ── REQUEST ──\n  ${message.slice(0, 2000)}${message.length > 2000 ? `... [${message.length}c]` : ""}`);
      this.process!.stdin!.write(message);
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected || !this.process?.stdin) return;
    const message = JSON.stringify(notification) + "\n";
    this.process.stdin.write(message);
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
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        // Non-JSON output, ignore
      }
    }
  }
}
