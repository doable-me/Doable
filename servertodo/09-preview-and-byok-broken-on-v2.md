# Preview + BYOK AI broke on a v2 install — root causes & fix

**Date:** 2026-05-09 — observed during the operator audit on a fresh v2 install. The findings below apply to **any** v2 install with the same configuration (`HTTP_PROXY` set globally + non-root API user), not just that one host.

User report: "creating apps stuck compiling, switches between 2 statuses, ends up in timeout. preview does not work. I added an LLM provider, it does not work."

## Root causes (3 compounding bugs)

### 1. `HTTP_PROXY` set globally on the API process

`setup-server-v2.sh` (and the original v3 draft) wrote `HTTP_PROXY=http://127.0.0.1:3128` into `/opt/doable/.env`. tsx loads .env into the API process environ, so every Node `fetch()` from the API server transparently went through Squid.

Squid had a small allowlist (`registry.npmjs.org`, `github.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, ...) but did NOT include AI provider hosts (`api.minimax.io`, `api.openai.com`, `api.anthropic.com`, ...). So every BYOK AI call returned `TCP_DENIED/403` to the SDK, which swallowed the error to `{}` (`[Chat] Hook error (model_call): {}`).

**Fix in v3:** keep `BUILD_HTTP_PROXY=...` (used by `vite-jail.ts` and `runNpmInstall` to inject into child build/scaffold processes), but DO NOT set `HTTP_PROXY` / `HTTPS_PROXY` at the parent process level. Plus expand Squid allowlist to common AI provider hosts as defense-in-depth for child build processes that might call out.

### 2. Per-project sandbox UID drop fails silently when API isn't root

`services/api/src/projects/dev-server-start.ts` does:
```ts
const sandboxUid = acquireDevUid(projectId);  // returns 10001+
if (sandboxUid !== null) {
  spawn("chown", ["-R", `${sandboxUid}:${sandboxUid}`, projectPath], { stdio: "ignore" });
  // ch.on("error", () => resolve());  ← silent skip
  console.log(`[DevServer] Project ${projectId} sandbox uid=${sandboxUid} (chown applied)`);
}
```

When the API runs as `doable` (UID 997, the v3 hardened default), `chown` to UID 10001+ fails with EPERM (CAP_CHOWN required). The error is silently swallowed and the misleading "(chown applied)" log fires regardless. Then `setpriv --reuid=10001` runs vite as UID 10001 against a `doable:doable`-owned project tree → vite can't write its `.vite` cache → exits code 1.

The frontend retries `/preview-url`, the allocator hands out 10002, 10003, ... — preview is "stuck compiling" forever.

**Fix in v3:**
- `services/api/src/runtime/dev-uid-allocator.ts` now returns `null` when `process.geteuid() !== 0`, so the spawn falls back to running as the API user (the dev process inherits doable's UID and can read/write its own project tree).
- Also added `DOABLE_DEV_UID_DISABLED=1` env opt-out for hosts where the operator wants to force-skip even if they're root.
- Future hardening path: add a `/etc/sudoers.d/90-doable-chown` NOPASSWD rule for `chown -R [0-9]*:[0-9]* /opt/doable/services/api/projects/*` and rewire `dev-server-start.ts` to invoke `sudo chown` instead of bare chown — that re-enables the per-project UID drop without requiring root for the parent.

### 3. Scaffold's `npm install` produces incomplete `node_modules`

When the global `HTTP_PROXY` was set (root cause 1), npm install during `createProject()` was forced through Squid. registry.npmjs.org was allowed but some downloads completed partial → `node_modules` ended up with ~20 entries instead of ~370, missing the `vite` package itself. Exit code was still 0, so the framework adapter's `runNpmInstall` resolved successfully and the scaffold flow continued. The dev server then crashed with `MODULE_NOT_FOUND: vite`.

After removing the global proxy, manual `npm install --no-audit --no-fund --legacy-peer-deps` adds 367 packages in 11s with no errors.

**Fix in v3:** root cause 1's fix removes the global proxy, so `runNpmInstall` runs without proxy interference. Optional follow-up: add a post-install verification in `file-manager.ts:createProject` that the framework's critical-binary file (e.g. `node_modules/.bin/vite` for vite-react) exists, and re-run install if missing.

## Smoke test on a future install

After running the new setup script, verify:

```bash
# 1. API process env should NOT have HTTP_PROXY (only BUILD_HTTP_PROXY).
sudo cat /proc/$(pgrep -f 'tsx.*services/api/src/index')/environ | tr '\0' '\n' | grep -i proxy
# Expected: BUILD_HTTP_PROXY=...  (no HTTP_PROXY=, no HTTPS_PROXY=)

# 2. acquireDevUid should return null for the doable user.
# Trigger a preview-url request and tail the API log:
#   - Should NOT see [vite-jail] setpriv wrap when API runs as non-root.
#   - Should see DOABLE_HARDENING=full ... skipping vault.spawn jail (that's fine).

# 3. After adding a BYOK provider via Settings > AI and starting a chat:
#   - tail Squid access.log — there should be NO TCP_DENIED entries for the
#     provider's hostname. (The API process bypasses Squid; child build
#     processes hit the expanded allowlist.)

# 4. Preview should reach "ready in" within 30s on the first request:
curl -fsS -H "Authorization: Bearer $TOK" \
  https://${DOABLE_ENV}-api.doable.me/projects/$PID/preview-url
# Expected: { "data": { "running": true, "url": "/preview/$PID/" } }
```

## Files changed for this fix

- `services/api/src/runtime/dev-uid-allocator.ts` — `acquireDevUid` returns null when `geteuid() !== 0` and supports `DOABLE_DEV_UID_DISABLED=1` opt-out
- `setup-v3/setup-server-v3.sh` — `.env` no longer sets `HTTP_PROXY`/`HTTPS_PROXY` globally; sets `DOABLE_DEV_UID_DISABLED=1`; Squid allowlist expanded with common AI provider hosts

## Diagnostic commands used (preserve for posterity)

```bash
# Find what's actually running (v2 uses tmux inside doable.service):
sudo systemctl status doable.service
TMUX_PID=$(pgrep -f 'tmux.*doable' | head -1)
sudo nsenter -t $TMUX_PID -m -- sudo -u doable tmux capture-pane -t doable:api -p -S -300 | tail -100

# Check Squid denials (the smoking gun for AI not working):
sudo tail -n 200 /var/log/squid/access.log | grep TCP_DENIED

# Check sandbox UID chown failure:
TMUX_PID=$(pgrep -f 'tmux.*doable' | head -1)
sudo nsenter -t $TMUX_PID -m -- ls -la /opt/doable/services/api/projects/<id>
# If owner is doable:doable but logs say "sandbox uid=10001 (chown applied)" — chown failed.
```
