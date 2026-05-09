# 03 — Puppeteer Chrome runs as root with sandbox disabled

**Severity:** HIGH

tl;dr: Two leaked headless Chrome trees on dodev are running as `uid=0` with `--no-sandbox --disable-setuid-sandbox`, rendering AI- and user-generated HTML/JS from project preview URLs. A renderer exploit is one bug away from root on the host.

## Evidence

`services/api/src/thumbnails/capture.ts:34-48`:

```ts
let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    const launchPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    ...
    browser = await Promise.race([launchPromise, timeoutPromise]);
  }
  return browser;
}
```

Live state on `dodev.fid.pw` (verified 2026-05-07):

- PID `948350` — Chrome root process, `--user-data-dir=/tmp/puppeteer_dev_chrome_profile-AdG0Ig`
- PID `1613327` — Chrome root process, `--user-data-dir=/tmp/puppeteer_dev_chrome_profile-mKafaK`
- Both trees include child processes `gpu-process`, `network` utility, `storage` utility, `renderer`, `on_device_model` — every one of them carries `--no-sandbox` and runs as `uid=0` (inherited from the api process).
- Headless flag `--headless=new` is passed in addition to puppeteer's defaults.

Use site: `captureProjectThumbnail(projectId, previewUrl)` in the same file. `previewUrl` resolves to the project's internal preview server `http://127.0.0.1:31xx/preview/<projectId>/`. **The HTML/JS at that URL is the project's own app — AI-generated, user-edited, with arbitrary npm dependencies.** Output PNG is written to `thumbnails/<projectId>.png` and served by `services/api/src/routes/thumbnails.ts`.

Sibling Puppeteer dependency: `mcp-servers/pdf-builder/package.json:17` (HTML→PDF for the built-in PDF MCP app). Not currently active in dodev runtime, but inherits the same risk profile when it runs.

Puppeteer version: `^24.39.1` (`services/api/package.json:573`).

## Impact

- **Renderer-to-root in one bug.** Chromium's renderer sandbox is the primary defense against drive-by RCE. With `--no-sandbox` plus `uid=0`, any V8 / Blink / WebGL / codec / font bug in the page being screenshotted is direct code execution as root on dodev.
- **The attacker controls the page content.** Puppeteer is rendering the project's own app preview. Threat surfaces include: malicious AI output (prompt-injected or model-misalignment), malicious user-authored code (a project owner can paste anything), drive-by exploits in transitive npm dependencies the user added, and supply-chain compromise of any package the project loads.
- **Why `--no-sandbox` is there at all.** Chrome's setuid sandbox refuses to start under two conditions: (a) the process runs as root, or (b) the container lacks `SYS_ADMIN` / user-namespace capabilities for the namespace sandbox. On dodev, condition (a) is the active one. Once the api drops root (Finding 02), the setuid sandbox works and the flag must come off.
- **Singleton leak is real.** `getBrowser()` reassigns `browser` when `browser.connected` is false but never closes/kills the old instance. Result: ~250–500 MB RAM wasted per stale tree (we currently have two), plus an indicator that the cleanup path has been broken since whenever the disconnect first happened. Stability + resource hygiene issue independent of the security finding.

## Fix

### 1. Drop the sandbox-disable flags after Finding 02 lands

Once api runs as a non-root user (per `02-services-as-root.md`), Chrome's setuid sandbox starts cleanly. Patch `services/api/src/thumbnails/capture.ts:34-48`:

```ts
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

let browser: Browser | null = null;
let userDataDir: string | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) {
    if (browser.connected) return browser;
    // Old tree disconnected — close it before reassigning.
    try { await browser.close(); } catch {}
    if (userDataDir) { try { await rm(userDataDir, { recursive: true, force: true }); } catch {} }
    browser = null;
    userDataDir = null;
  }

  userDataDir = path.join("/var/lib/doable/thumb", `browser-${randomBytes(6).toString("hex")}`);

  const launchPromise = puppeteer.launch({
    headless: true,
    userDataDir,
    args: [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      // NOTE: --no-sandbox / --disable-setuid-sandbox intentionally REMOVED.
      // Requires services/api to run as a non-root UID (see 02-services-as-root.md).
    ],
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("puppeteer launch timeout")), 30_000),
  );
  const next = await Promise.race([launchPromise, timeoutPromise]);

  next.on("disconnected", () => {
    if (browser === next) {
      browser = null;
      if (userDataDir) { void rm(userDataDir, { recursive: true, force: true }).catch(() => {}); }
      userDataDir = null;
    }
  });

  browser = next;
  return browser;
}
```

### 2. Route Chrome through `dovault.spawn` with a dedicated identity

Allocate a `doable-thumb` system UID outside the 10001–65000 dev-sandbox range (e.g. `999`) so it cannot collide with project sandboxes. Launch Chrome inside a transient systemd scope via `dovault.spawn` (see `05-dovault-spawn-wiring.md`):

```ts
// pseudo: real call goes through dovault.spawn
await dovault.spawn({
  identity: "doable-thumb",
  command: process.execPath, // node
  args: [require.resolve("./thumbnails/run-puppeteer.js"), previewUrl, outPath],
  scope: {
    MemoryMax: "512M",
    CPUQuota: "100%",
    TasksMax: 200,
    ProtectSystem: "strict",
    ProtectHome: true,
    PrivateTmp: true,
    NoNewPrivileges: true,
    ReadWritePaths: ["/var/lib/doable/thumb"],
    SystemCallFilter: "@system-service",
  },
});
```

Run-puppeteer.js is a tiny child entrypoint that calls `getBrowser()`/`captureProjectThumbnail()` and exits. `PrivateTmp=true` plus a fresh `--user-data-dir` per launch means renderer state is never reused across projects.

### 3. Fix the singleton leak (covered in patch #1)

Already in the patch above:

- Close + null the previous `browser` before reassigning.
- `browser.on("disconnected", …)` resets the singleton and removes the old `--user-data-dir`.
- `--user-data-dir` is unique per launch (`randomBytes(6)`), under `/var/lib/doable/thumb`, and removed on disconnect/close.

Cleanup of pre-existing leaks (run once on dodev after deploy):

```bash
pkill -KILL -f "puppeteer_dev_chrome_profile" || true
rm -rf /tmp/puppeteer_dev_chrome_profile-*
```

### 4. Better: scope-shift the screenshot into the project's own runtime

The cleaner trust boundary is to never let the api-side process touch user content with a browser at all. The project's Vite/Next dev server already runs under the project's sandbox UID (10001–65000). Options, in order of preference:

1. **In-page rendering.** Expose a `/__doable/og.png` route in the project's dev adapter that uses an in-page screenshot lib (`html-to-image`, `dom-to-image-more`) to serialize the rendered DOM to PNG, server-side via JSDOM, or client-side and POST-back. No browser process at all on the api side.
2. **Puppeteer inside the project sandbox.** If a real headless render is required, launch puppeteer from the project's own runtime under its sandbox UID. The api just GETs the resulting PNG over the loopback preview URL. Renderer compromise stays inside that project's sandbox, where it already had code execution by definition.

Either way, the api's role shrinks to "fetch a PNG byte stream and persist it" — no Chromium attack surface in the api process.

### 5. PDF builder (`mcp-servers/pdf-builder/package.json:17`)

Same hardening contract applies if/when this MCP app runs in dodev: non-root identity, `dovault.spawn` scope, no `--no-sandbox`, fresh `--user-data-dir` per render, capped memory. Track separately; do not regress on it.

## Verification

```bash
# 1. No Chrome process should still carry --no-sandbox after the rollout.
ps -ef | grep -i chrome | grep -- "--no-sandbox" | grep -v grep
# expected: empty

# 2. Every Chrome process is owned by the dedicated thumb UID, not root.
ps -eo user,pid,comm,args | grep -i chrome | grep -v grep | awk '{print $1}' | sort -u
# expected: only "doable-thumb" (or the chosen UID name); never "root"

# 3. The renderer is sandboxed: NoNewPrivs=1, Seccomp filter set, non-zero Uid.
RPID=$(pgrep -f "chrome.*--type=renderer" | head -1)
grep -E "^Uid:|^Seccomp:|^NoNewPrivs:" /proc/$RPID/status
# expected: Uid != 0; NoNewPrivs: 1; Seccomp: 2 (filter)

# 4. Singleton-leak check: at most one browser tree (~5 procs) live.
pgrep -af "puppeteer_dev_chrome_profile|chrome.*--user-data-dir=/var/lib/doable/thumb" | wc -l
# expected: <= 5

# 5. No stale profile directories left behind in /tmp or /var/lib/doable/thumb.
ls -1 /tmp 2>/dev/null | grep -c puppeteer_dev_chrome_profile || true
# expected: 0
ls -1 /var/lib/doable/thumb 2>/dev/null | wc -l
# expected: <= number of currently live browsers
```

## References

- `services/api/src/thumbnails/capture.ts:34-48` — the leaky launch site, primary patch target.
- `services/api/src/routes/thumbnails.ts` — HTTP route serving the captured PNGs.
- `services/api/package.json:573` — pinned puppeteer `^24.39.1`.
- `mcp-servers/pdf-builder/package.json:17` — sibling Puppeteer dependency, same hardening contract.
- `servertodo/02-services-as-root.md` — root cause for `--no-sandbox`; must land first.
- `servertodo/05-dovault-spawn-wiring.md` — the `dovault.spawn` path used to put Chrome in a hardened scope.
- Chrome sandbox internals: `linux_suid_sandbox_development.md`, `linux_sandboxing.md` (Chromium docs tree).
