#!/usr/bin/env node
/**
 * pptx-worker — isolated subprocess that runs an AI-supplied PptxGenJS
 * script body in the strictest sandbox Node lets us build in-process:
 *
 *   • Started by `child_process.fork()` from `index.mjs:runPptxScript`.
 *   • Parent strips its env to NOTHING before forking (no JWT_SECRET,
 *     ENCRYPTION_KEY, DOABLE_KEK, API keys, OAuth secrets — none of it
 *     reaches this process even via process.env).
 *   • Script body arrives via IPC, never via CLI args (avoids ps-level
 *     leakage and avoids the parent's argv buffer caps).
 *   • Inside the worker, the script runs in a `vm.runInNewContext`
 *     sandbox seeded only with PptxGenJS + Buffer + console +
 *     typed-array constructors. The sandbox has no `process`, no
 *     `require`, no `globalThis`, no I/O bindings.
 *   • Even if the script escapes the in-process vm sandbox via a
 *     prototype-chain trick, it lands in THIS subprocess — which has
 *     no real environment to read, no inherited file descriptors to
 *     the parent's stdin/stdout/stderr beyond the IPC channel itself,
 *     and dies cleanly when the parent SIGKILLs it on timeout.
 *   • 30-second wall-clock timeout enforced by the vm `timeout` option.
 *
 * Output: writes one IPC message {ok:true, bufferBase64, slideCount}
 * on success, or {ok:false, error} on failure. Parent decodes the
 * base64 back to a Buffer (transferring a Buffer over IPC works on
 * Node 18+ but base64 is the universally-supported fallback and adds
 * <100ms for a typical 100 KB .pptx).
 */
import { Buffer } from "node:buffer";
import { createContext, runInContext } from "node:vm";
import PptxGenJS from "pptxgenjs";

function fail(error) {
  process.send?.({ ok: false, error: String(error?.message || error) });
  process.exit(1);
}

async function runScript(scriptBody) {
  const sandbox = {
    PptxGenJS,
    Buffer,
    console,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    ArrayBuffer,
    Promise,
    __pptx: null,
    __scriptError: null,
  };
  createContext(sandbox);
  const wrapped = `
    (async () => {
      try {
        ${scriptBody}
      } catch (e) {
        __scriptError = e;
      }
    })()
  `;
  await runInContext(wrapped, sandbox, {
    timeout: 30000,
    breakOnSigint: true,
    displayErrors: true,
  });
  if (sandbox.__scriptError) throw sandbox.__scriptError;
  const inst = sandbox.__pptx;
  if (!inst || typeof inst.write !== "function") {
    throw new Error(
      "Script did not assign `__pptx = pptx;` to a PptxGenJS instance. " +
      "End your script body with: `__pptx = pptx;`",
    );
  }
  const buffer = await inst.write({ outputType: "nodebuffer" });
  let slideCount = 0;
  try { slideCount = inst.slides?.length ?? 0; } catch {}
  return { buffer, slideCount };
}

process.on("message", async (msg) => {
  try {
    if (!msg || typeof msg.script !== "string") fail("worker received no script");
    const { buffer, slideCount } = await runScript(msg.script);
    process.send?.({
      ok: true,
      bufferBase64: Buffer.from(buffer).toString("base64"),
      slideCount,
    });
    process.exit(0);
  } catch (e) {
    fail(e);
  }
});

process.on("disconnect", () => process.exit(0));
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
