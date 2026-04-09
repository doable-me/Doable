# Bug 22 — Preview proxy ECONNRESET crashes the entire API process

**Severity:** 🔴 P0 — Critical (single preview request can kill the whole API server)
**Area:** `services/api/src/routes/preview-proxy.ts` + Node.js `fetch` streaming behaviour
**Discovered:** 2026-04-09 during bug-20 verification
**Status:** Fixed 2026-04-09 — guard ships alongside the bug-20 preview queue fix

## Symptom

During a chat turn that included an `install_package` tool call, the API server produced this uncaught crash:

```
node:events:486
      throw er; // Unhandled 'error' event
      ^

Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
Emitted 'error' event on Socket instance at:
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21) {
  errno: -4077,
  code: 'ECONNRESET',
  syscall: 'read'
}
```

The entire Node process exited. `tsx watch` would have restarted it eventually, but in the meantime all AI chat streams, preview requests, and API calls fail.

## Root cause

The reverse proxy in `preview-proxy.ts` does:

```ts
try {
  const resp = await fetch(fullUrl, { ... });
  return new Response(resp.body, { status: resp.status, headers });
} catch (err) {
  return c.text(`Preview proxy error: ${err.message}`, 502);
}
```

Two failure modes exist:

1. **`fetch()` itself rejects** (e.g., immediate connection refused). Caught by the `try/catch` — returns a clean 502.
2. **The socket errors asynchronously AFTER `fetch()` returned** (e.g., Vite is killed and restarted by `install_package` while the proxy is mid-streaming `resp.body` to the client). The error fires on the raw TCP socket's `'error'` event listener — not on the `ReadableStream` in user-space — and there is no registered error handler, so Node escalates it via `throw er` inside `node:events`, killing the process.

The race window is the same one bug-20 addressed: between `servers.set(instance)` and `instance.ready = true`. Bug-20's fix makes the proxy *wait* for ready before forwarding new requests — but any already-in-flight forward that was mid-response when Vite restarts can still hit this.

## Fix

Install a process-level `uncaughtException` (and `unhandledRejection`) guard in `services/api/src/index.ts` that:

1. Matches `ECONNRESET`, `ECONNREFUSED`, and `EPIPE` errors — the three socket-level codes the preview forwarder can produce under Vite-restart races. All three are harmless in this context: the client has already closed its end, or the upstream is restarting.
2. Logs each one as a `warn` with its `code` + `message` so it's visible but not alarming.
3. Re-throws anything else so real bugs still crash-fast and `tsx watch` spawns a fresh process (no silently-broken server).

```ts
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "EPIPE") {
    console.warn(`[api] swallowed async socket error: ${err.code} — ${err.message}`);
    return;
  }
  console.error("[api] FATAL uncaught exception:", err);
  throw err;
});
process.on("unhandledRejection", (reason) => {
  const err = reason as NodeJS.ErrnoException | undefined;
  if (err?.code === "ECONNRESET" || err?.code === "ECONNREFUSED" || err?.code === "EPIPE") {
    console.warn(`[api] swallowed async rejection: ${err.code} — ${err.message}`);
    return;
  }
  console.error("[api] unhandled rejection:", reason);
});
```

A more targeted alternative would be to attach an `error` listener to `resp.body` inside the proxy handler, but this has to be done on *every* fetch in *every* proxy route, is easy to forget, and wouldn't cover the case where the socket errors before user-space code ever touches the ReadableStream. The process-level guard is a broader safety net.

## Acceptance

1. Run a chat turn that triggers `install_package` (e.g. `"install date-fns and use it in App.tsx"`).
2. Observe the Vite dev-server restart sequence in the API log.
3. API process does NOT crash.
4. Subsequent preview requests proxy normally after the restart.
5. Any legitimate uncaught exception (not one of the whitelisted codes) still crashes fast.
