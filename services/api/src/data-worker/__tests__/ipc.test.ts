import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { encodeFrame, FrameDecoder, FrameError, parseFrames } from "../ipc.js";

const MAX_BODY = 8 * 1024 * 1024;

describe("encodeFrame + FrameDecoder roundtrip", () => {
  it("roundtrips a small object", () => {
    const obj = { id: 1, method: "ping", params: [] };
    const [decoded] = new FrameDecoder().push(encodeFrame(obj));
    assert.deepEqual(decoded, obj);
  });

  it("roundtrips an array", () => {
    const arr = [1, "two", { three: 3 }];
    const [decoded] = new FrameDecoder().push(encodeFrame(arr));
    assert.deepEqual(decoded, arr);
  });

  it("roundtrips a nested object", () => {
    const obj = { a: { b: { c: { d: [true, false, null] } } } };
    const [decoded] = new FrameDecoder().push(encodeFrame(obj));
    assert.deepEqual(decoded, obj);
  });

  it("roundtrips a unicode string value", () => {
    const obj = { greeting: "héllo 🎉" };
    const [decoded] = new FrameDecoder().push(encodeFrame(obj));
    assert.deepEqual(decoded, obj);
  });
});

describe("split delivery", () => {
  it("decodes after feeding one byte at a time", () => {
    const obj = { split: true, value: 42 };
    const frame = encodeFrame(obj);
    const dec = new FrameDecoder();
    let results: object[] = [];
    for (let i = 0; i < frame.length - 1; i++) {
      const partial = dec.push(frame.subarray(i, i + 1));
      assert.equal(partial.length, 0, `unexpected decode at byte ${i}`);
    }
    results = dec.push(frame.subarray(frame.length - 1));
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], obj);
  });
});

describe("two frames in one chunk", () => {
  it("decodes both objects in order", () => {
    const a = { seq: 1, x: "alpha" };
    const b = { seq: 2, x: "beta" };
    const combined = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
    const results = new FrameDecoder().push(combined);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], a);
    assert.deepEqual(results[1], b);
  });
});

describe("pendingBytes", () => {
  it("reflects leftover partial bytes", () => {
    const frame = encodeFrame({ x: 1 });
    const dec = new FrameDecoder();
    dec.push(frame.subarray(0, 3)); // only 3 of 4 header bytes
    assert.equal(dec.pendingBytes, 3);
    dec.push(frame.subarray(3));
    assert.equal(dec.pendingBytes, 0);
  });
});

describe("negative: FrameDecoder errors", () => {
  it("throws PAYLOAD_TOO_LARGE when declared length > 8 MiB", () => {
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(MAX_BODY + 1, 0);
    const dec = new FrameDecoder();
    assert.throws(
      () => dec.push(header),
      (err: unknown) => {
        assert.ok(err instanceof FrameError);
        assert.equal(err.code, "PAYLOAD_TOO_LARGE");
        return true;
      }
    );
  });

  it("throws BAD_UTF8 for invalid UTF-8 body", () => {
    // Build a frame manually with invalid UTF-8 bytes
    const badBody = Buffer.from([0xff, 0xfe, 0xfd]);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(badBody.length, 0);
    const frame = Buffer.concat([header, badBody]);
    const dec = new FrameDecoder();
    assert.throws(
      () => dec.push(frame),
      (err: unknown) => {
        assert.ok(err instanceof FrameError);
        assert.equal(err.code, "BAD_UTF8");
        return true;
      }
    );
  });

  it("throws BAD_JSON for invalid JSON body", () => {
    const badJson = Buffer.from("{not json", "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(badJson.length, 0);
    const frame = Buffer.concat([header, badJson]);
    const dec = new FrameDecoder();
    assert.throws(
      () => dec.push(frame),
      (err: unknown) => {
        assert.ok(err instanceof FrameError);
        assert.equal(err.code, "BAD_JSON");
        return true;
      }
    );
  });
});

describe("negative: encodeFrame too large", () => {
  it("throws PAYLOAD_TOO_LARGE when JSON exceeds 8 MiB", () => {
    // Build a string slightly over 8 MiB when JSON-encoded
    const big = { data: "x".repeat(MAX_BODY) };
    assert.throws(
      () => encodeFrame(big),
      (err: unknown) => {
        assert.ok(err instanceof FrameError);
        assert.equal(err.code, "PAYLOAD_TOO_LARGE");
        return true;
      }
    );
  });
});

describe("parseFrames", () => {
  async function* toStream(bufs: Buffer[]): AsyncGenerator<Buffer> {
    for (const b of bufs) yield b;
  }

  it("yields decoded frames from async stream", async () => {
    const a = { n: 1 };
    const b = { n: 2 };
    const chunks = [encodeFrame(a), encodeFrame(b)];
    const results: object[] = [];
    for await (const frame of parseFrames(toStream(chunks))) {
      results.push(frame);
    }
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], a);
    assert.deepEqual(results[1], b);
  });

  it("throws TRUNCATED when stream ends mid-frame", async () => {
    const frame = encodeFrame({ x: 99 });
    // Only send the first 4 bytes (header only, no body)
    const partial = [frame.subarray(0, 4)];
    await assert.rejects(
      async () => {
        for await (const _ of parseFrames(toStream(partial))) {
          // consume
        }
      },
      (err: unknown) => {
        assert.ok(err instanceof FrameError);
        assert.equal(err.code, "TRUNCATED");
        return true;
      }
    );
  });
});
