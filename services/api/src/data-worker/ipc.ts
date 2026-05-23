// PRD chapter 03 §Framing — length-prefixed JSON-RPC framing for per-project DB worker IPC.
// Wire format: 4-byte big-endian unsigned length prefix (body bytes only) + UTF-8 JSON body. No NUL terminator.
// Max body: 8 MiB.

import { Buffer } from "node:buffer";

const MAX_BODY = 8 * 1024 * 1024; // 8 MiB

export class FrameError extends Error {
  readonly code: "PAYLOAD_TOO_LARGE" | "BAD_UTF8" | "BAD_JSON" | "TRUNCATED";

  constructor(
    code: "PAYLOAD_TOO_LARGE" | "BAD_UTF8" | "BAD_JSON" | "TRUNCATED",
    message: string
  ) {
    super(message);
    this.name = "FrameError";
    this.code = code;
  }
}

export function encodeFrame(value: unknown): Buffer {
  const json = JSON.stringify(value);
  const body = Buffer.from(json, "utf8");
  if (body.length > MAX_BODY) {
    throw new FrameError(
      "PAYLOAD_TOO_LARGE",
      `Frame body ${body.length} bytes exceeds max ${MAX_BODY}`
    );
  }
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  get pendingBytes(): number {
    return this.buf.length;
  }

  push(chunk: Buffer): object[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const results: object[] = [];

    while (this.buf.length >= 4) {
      const length = this.buf.readUInt32BE(0);
      if (length > MAX_BODY) {
        throw new FrameError(
          "PAYLOAD_TOO_LARGE",
          `Declared frame length ${length} bytes exceeds max ${MAX_BODY}`
        );
      }
      if (this.buf.length < 4 + length) {
        // Wait for more data
        break;
      }
      const bodyBuf = this.buf.subarray(4, 4 + length);
      let json: string;
      try {
        json = decoder.decode(bodyBuf);
      } catch {
        throw new FrameError("BAD_UTF8", "Frame body is not valid UTF-8");
      }
      let obj: object;
      try {
        obj = JSON.parse(json) as object;
      } catch {
        throw new FrameError("BAD_JSON", "Frame body is not valid JSON");
      }
      results.push(obj);
      this.buf = this.buf.subarray(4 + length);
    }

    return results;
  }
}

export async function* parseFrames(
  stream: AsyncIterable<Buffer>
): AsyncGenerator<object> {
  const dec = new FrameDecoder();
  for await (const chunk of stream) {
    const frames = dec.push(chunk);
    for (const frame of frames) {
      yield frame;
    }
  }
  if (dec.pendingBytes > 0) {
    throw new FrameError(
      "TRUNCATED",
      `Stream ended with ${dec.pendingBytes} bytes remaining in partial frame`
    );
  }
}
