# 05 — Current State: dovault and Doable's existing sandboxing

*Author: `dovault-auditor` (Opus, 2026-05-11).*

This chapter audits the dovault package and every Doable code path
that does (or claims to do) sandboxed process execution. Findings are
grounded in the source — file/line citations throughout.

## Package layout

`packages/dovault/src/` (`index.ts`, `vault.ts`, `process-jail.ts`,
`config-guard.ts`, `resource-limiter.ts`, `tracer.ts`, `types.ts`)
plus nine backends under `backends/`. Public entry is
`createVault(options?)` (`packages/dovault/src/index.ts:78-80`).

Three independent layers — Config Guard, Process Jail (Node
Permission Model), Resource Limiter — composed by `Vault.spawn`
(`packages/dovault/src/vault.ts:108-225`). Resource limits are
pluggable via the `ResourceBackend` interface
(`packages/dovault/src/backends/types.ts:13-53`).

## Backends (what each one actually does)

Every backend implements
`wrapSpawn(cmd, args, opts) -> {command, args, env?}` and optionally
`wrapExec` (FS-jailed exec). Resource-limiter chooses one at
construction (`packages/dovault/src/resource-limiter.ts:180-216`).

### `direct.ts` — no-op (`direct.ts:1-21`)
Priority 0. `wrapSpawn` returns `{command, args}` unchanged. No FS,
PID, NET, USER, syscall, or cgroup isolation. Always-available
fallback (`direct.ts:13-15`).

### `systemd.ts` — Linux cgroup v2 + ProtectSystem (`systemd.ts:1-136`)
Priority 80. Real isolation, but conditional.
- `wrapSpawn`: emits
  `systemd-run --scope -p MemoryMax -p CPUQuota -p TasksMax` plus
  optional `IPAddressDeny=any` / `IPAddressAllow=localhost`
  (`systemd.ts:38-57`). Layers: cgroups, NET via cgroup-v2 BPF. No
  FS, no PID, no USER, no syscall.
- `wrapExec` (`systemd.ts:91-135`) adds `ProtectSystem=strict`,
  `ProtectHome=true`, `ReadWritePaths=<jail>`, `PrivateTmp=true`,
  `NoNewPrivileges=true`. Adds FS jail, USER (NoNewPrivs), tmp
  isolation. Still no PID namespacing, no syscall filter.
- Poisons HTTP_PROXY/HTTPS_PROXY to `0.0.0.0:1` as
  defense-in-depth (`systemd.ts:62-69`).

### `bubblewrap.ts` — Linux unprivileged namespaces (`bubblewrap.ts:1-108`)
Priority 65, available when `bwrap` is on PATH
(`bubblewrap.ts:29-37`).
- Real PID/UTS/IPC/USER namespaces via
  `--unshare-pid --unshare-uts --unshare-ipc --unshare-user`
  (`bubblewrap.ts:69-74`). FS namespace via
  `--ro-bind /usr /lib /lib64 /etc`, `--proc`, `--dev`,
  `--tmpfs /tmp`, with `--bind <jail> <jail>` when a jail is set
  (`bubblewrap.ts:79-82`).
- NET via `--unshare-net` (`bubblewrap.ts:77`).
- Resource caps are **advisory** — uses
  `prlimit --as=<bytes> --nproc=<n>` because bwrap has no cgroup
  support (`bubblewrap.ts:86-90`). CPU quota cannot be enforced.
- No syscall filter (no seccomp).

### `psroot.ts` — Windows AppContainer wrapper (`psroot.ts:1-137`)
Priority 70. Available only when `psroot.exe` resolves on PATH or via
`DOABLE_PSROOT_PATH` / vendored copy (`psroot.ts:25-56`, `83-86`).
- Delegates everything to external `psroot.exe spawn ...` which is
  supposed to wrap the child in a Windows AppContainer + Job Object
  (`psroot.ts:88-126`). The TS code itself does no isolation —
  composes CLI args. All FS/USER/NET enforcement happens inside
  `psroot.exe`, a vendored third-party binary.
- Claims: FS (AppContainer named-object), USER (AppContainer SID),
  NET (none/outbound/full toggle), tasks (Job Object). No syscall,
  no cgroups.

### `sandbox-exec.ts` — macOS Seatbelt SBPL (`sandbox-exec.ts:1-99`)
Priority 50. Wraps `/usr/bin/sandbox-exec -p <profile>`
(`sandbox-exec.ts:46-50`). Profile is `(deny default)` with explicit
allow for `/usr`, `/System`, `/Library/Frameworks`, `/private/var/db/dyld`,
`/dev`, plus the jail subpath (`sandbox-exec.ts:76-91`).
- Layers: FS (Seatbelt subpath rules), NET. No PID, USER, cgroups,
  syscall.
- Apple deprecated `sandbox-exec` in macOS 10.15 (file flags this;
  `sandbox-exec.ts:12-14`).

### `apple-container.ts` — macOS 15+ Apple Silicon VM (`apple-container.ts:1-108`)
Priority 45, **opt-in only**: requires darwin / arm64 / kernel
major ≥ 24 / `DOVAULT_PROFILE=hardened` / `which container`
(`apple-container.ts:35-48`). Wraps
`container run --rm --memory --cpu -v <jail>:/work -- <cmd>`
(`apple-container.ts:71-94`). Real VM-backed Linux guest. **In
practice almost never active** — almost no production host satisfies
the gate.

### `gvisor.ts` — Linux user-space syscall interception (`gvisor.ts:1-72`)
Priority 40, opt-in only (`DOVAULT_PROFILE=hardened` or
`DOVAULT_BACKEND=gvisor`, plus `which runsc`; `gvisor.ts:35-49`).
Wraps `runsc do -- <cmd>` (`gvisor.ts:51-71`).
- **The TS code does not pass resource limits through.** The file
  admits: `runsc do` runs without an OCI bundle, so `ResourceLimits`
  are not threaded (`gvisor.ts:23-28`). Only syscall-interception
  layer is active.

### `win-heap.ts` — V8 heap limit only (`win-heap.ts:1-55`)
Priority 40. Sets `NODE_OPTIONS=--max-old-space-size=<MB>`
(`win-heap.ts:30-41`). Limits JS heap only, not RSS. Zero true
isolation.

### `windows.ts` — Job Objects via PowerShell P/Invoke (`windows.ts:1-389`)
Priority 60. Most ambitious cross-platform backend. Materializes a
cached PowerShell wrapper (`windows.ts:145-159`) that:
- Creates a Win32 Job Object via `Add-Type` C# P/Invoke
  (`windows.ts:227-308`),
- Sets `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` for memory + active
  procs + `KILL_ON_JOB_CLOSE` (`windows.ts:317-342`),
- Sets `JOBOBJECT_CPU_RATE_CONTROL_INFORMATION` for CPU rate hard
  cap (`windows.ts:344-360`),
- Poisons HTTP_PROXY (`windows.ts:78-85`) and sets
  `--max-old-space-size` (`windows.ts:88-90`).
- **No FS jail** — `wrapExec` admits as much (`windows.ts:136-139`).

## Public interface

`index.ts` exports `Vault`, `createVault`, `ConfigGuard`,
`ProcessJail`, `ResourceLimiter`, `Tracer`, and every backend class
(`packages/dovault/src/index.ts:12-50`).

Spawn contract is
`Vault.spawn(command, args, SpawnOptions): Promise<JailedProcess>`.
`SpawnOptions` (`types.ts:46-89`): `cwd`, `jail` (FS root for
Permission Model), `lockConfigs` (default true), `blockChildProcess`
(default true), `blockOutboundNet` (default true), `readOnlyPaths`,
`env`, `resourceLimits`, `stdio`. Execution order is documented at
`vault.ts:96-107`: (1) lock configs, (2) wrap with `node
--experimental-permission --allow-fs-read/write`, (3) wrap with
backend, (4) spawn.

The Process Jail uses Node's `--experimental-permission` model
(`process-jail.ts:144-191`). Critically, requires resolving the
target command to a `.js` entry point (`process-jail.ts:64-79`) — if
resolution fails, Permission Model is silently skipped
(`vault.ts:179-187`).

Callers choose a backend three ways
(`resource-limiter.ts:180-216`):
1. Pass `ResourceBackend` instance directly to constructor.
2. Set `VaultOptions.backend` to a name string (e.g. `"systemd"`).
3. Auto-detect — sorted by `priority` descending, first
   `available()` wins.

Auto-detect priority: systemd 80 > psroot 70 > bubblewrap 65 >
windows 60 > sandbox-exec 50 > apple-container 45 > gvisor 40 /
win-heap 40 > direct 0.

## Which Doable code paths actually go through dovault

### Vite dev server — partially jailed
`services/api/src/projects/vite-jail.ts` instantiates a singleton
`createVault(...)` (`vite-jail.ts:47-63`) and calls `vault.spawn(...)`
(`vite-jail.ts:260-273`).

But the SpawnOptions disable three of the four security flags:
- `lockConfigs: false` (`vite-jail.ts:268`) — "AI legitimately edits
  vite.config.ts / postcss.config.js"
- `blockChildProcess: false` (`vite-jail.ts:269`) — "Vite spawns
  esbuild/workers legitimately"
- `blockOutboundNet: false` (`vite-jail.ts:270`) — "dev server needs
  outbound for npm installs / HMR ws"

So the Vite path only gets: resource limits (memory 256M / CPU 50% /
128 tasks) plus the Node Permission Model FS jail (if
`process-jail.ts` can resolve the script). Network wide open from
dovault's perspective; protections come from cgroups via systemd-run.

`vite-jail.ts` wraps in setpriv (`vite-jail.ts:162-171`) for UID-drop
and optionally `systemd-run --scope --SystemCallFilter=...`
(`vite-jail.ts:191-213`) — but those compositions are done **outside
dovault**. Windows short-circuits the jail entirely via `shouldJail()`
returning false on win32 (`runtime/hardening-level.ts:24-31`).

`servertodo/05-dovault-spawn-wiring.md` is more pessimistic — it
documents that on the deployed Linux VPS the systemd backend is
silently inactive: `DOVAULT_BACKEND` is unset, `/proc/<vitepid>/status`
shows `NoNewPrivs: 0`, `Seccomp: 0`, full `CapBnd: 000001ffffffffff`,
no `run-r*.scope` cgroup. The code path *exists*; the production
wiring is broken.

### AI bash tool — NOT jailed
The Copilot SDK's built-in `bash` tool is exposed
(`copilot-engine.ts:120,185`) and only filtered against `cat >` /
heredoc patterns (`copilot-engine.ts:120-129, 184-193`). When bash IS
called, it runs in the **Copilot SDK's own process**, which is the
API process — no dovault.spawn, no setpriv, no resource limits. No
grep hit on `vault.exec` / `vault.spawn` anywhere under
`services/api/src/ai/`. This is the host-info-leak gap.

### `install_package` tool — NOT jailed (two implementations)
`services/api/src/ai/tools/install-package.ts:236-242` uses
`spawn(pm, args, { cwd, shell: true, ... })` — raw
`child_process.spawn`. No dovault. The duplicate in-line
implementation in `copilot-tools.ts:222` does the same. Both add
`--ignore-scripts` which removes the postinstall RCE surface — but
the install runs as the API user with full network, full FS, full
syscall access.

### Build pipeline — jailed (similar to Vite)
`services/api/src/deploy/builder.ts` mirrors vite-jail: singleton
`getBuildVault()` (`builder.ts:63-84`), then `vault.spawn(...)`
(`builder.ts:373-384`). Build defaults: memory 1G, CPU 100%, 512
tasks (`builder.ts:40-44`). Also setpriv-wrapped on Linux with
`acquireDevUid` (`builder.ts:318-346`). Network intentionally open:
"TODO(Wave 26+): add an allow-list" (`builder.ts:36-38`).

## Resource limits / cgroups: is `resource-limiter.ts` actually used?

Yes — but only as the dispatcher. `Vault.spawn` always calls
`this.resourceLimiter.spawn(...)` (`vault.ts:197-204`). Actual
enforcement lives entirely inside the chosen backend's `wrapSpawn`.
Dispatcher provides defaults `{ memoryMax: "200M", cpuQuota: "50%",
tasksMax: 64 }` (`resource-limiter.ts:58-62`).

It's not a stub — but effectiveness is gated by backend availability,
and per the servertodo, the deployed host's vite-jail likely falls
back to `direct` because `DOVAULT_BACKEND` is unset and auto-detection
rules silently degrade.

## Concrete gaps

1. **AI `bash` tool is unjailed.** No `vault.exec` wrap, no UID drop,
   no cgroup. `/etc/passwd`, `.env` files at 0644, all sibling tenant
   project dirs are readable by AI-issued `cat`. Filter is a regex
   against `cat >` only — `cat /root/doable/.env` is not blocked.
2. **`install_package` (both copies) runs raw.** Both bypass dovault
   entirely. `--ignore-scripts` removes RCE-via-postinstall, but not
   registry-redirect / dependency-confusion outbound exfil.
3. **vite-jail bypass on the deployed host.** Per
   `servertodo/05-dovault-spawn-wiring.md`, `DOVAULT_BACKEND` unset →
   auto-detect, but the API runs as root with no per-user systemd
   cgroup delegation → `systemd-run --scope` silently fails to wrap,
   leaving previews with `CapBnd=000001ffffffffff`. UID drop only;
   no cgroup, no `NoNewPrivs`, no syscall filter.
4. **No nft egress jail.** systemd `IPAddressDeny` path unused
   (`blockOutboundNet: false` everywhere). Proxy poisoning is
   HTTP-only. AF_INET sockets, DNS, raw TCP all reachable.
5. **No syscall filter in any default-active backend.** Only opt-in
   `gvisor` provides one, and doesn't thread resource limits through.
   systemd backend never emits `SystemCallFilter=` — vite-jail
   re-adds it manually only when `DOABLE_DEV_SECCOMP=on` (default
   off).
6. **`ProcessJail` resolution is fragile.** If `buildJailedCommand`
   can't find the script's `.js` entry, Permission Model is silently
   skipped with only an audit-log warning (`vault.ts:179-187`).
   `--experimental-permission` cannot be set via `NODE_OPTIONS`, so
   any caller using non-Node binaries gets zero Permission-Model
   enforcement.
7. **`windows` backend has no FS jail.** Its own `wrapExec` says so
   (`windows.ts:131-140`). Doable on Windows further short-circuits
   via `shouldJail() === false` (`hardening-level.ts:30`).
8. **Backend selection is invisible at runtime.** Only builder and
   vite-jail log `Vault initialized (backend=...)` once at first use.
   No startup check, no policy-enforced fail-closed when production
   lands on `direct`. Operators have to grep logs after first request.
9. **`config-guard` defaults are vite-react-only.** `DEFAULT_TEMPLATES`
   only covers Vite/Tailwind/PostCSS. `Vault` constructor never wires
   `frameworkId`.
10. **Resource-limiter's `available()` checks are coarse.**
    `SystemdBackend.available` only checks `systemd-run --version`
    exists; does NOT check cgroup delegation. Result: false-positive
    availability when running as root without `Delegate=yes`, exactly
    the production failure mode in servertodo #05.

## Backend-selection mechanism

Three knobs (`packages/dovault/src/resource-limiter.ts:180-216`):
- `VaultOptions.backend` string. Forced selection.
- `DOVAULT_PROFILE=hardened` env — gates `gvisor` and
  `apple-container`.
- `DOVAULT_BACKEND=gvisor` env — alternative gate for gvisor.

No explicit `DOVAULT_BACKEND=systemd` handling — only string-match in
`detectBackend`. The decision lives entirely in `detectBackend()`;
callers `vite-jail.ts:47-63` and `builder.ts:63-84` never pass
`backend:`. Hardcoded priority in `resource-limiter.ts:181-192`. OS
detection inside each backend's `available()`.

The `DOABLE_HARDENING` env (`runtime/hardening-level.ts:13-32`) is a
**separate** kill switch above dovault — `off` skips `vault.spawn`
entirely and raw-spawns. `relaxed` is documented but not actually
distinguished from `full` in `shouldJail()`.

## Five most important things to fix (ordered by impact)

- **Wrap the AI `bash` tool through `vault.exec` (or block it
  entirely).** Today it reads `.env`, `/etc/passwd`, sibling tenant
  directories with zero containment. Highest-impact gap.
- **Make `DOVAULT_BACKEND` explicit and fail-closed in production.**
  `vault.spawn` must refuse to use `direct` when
  `NODE_ENV=production`. Add startup probe that crashes the API if
  cgroup delegation isn't actually working (today
  `systemd-run --version` exists ≠ scope creation works).
- **Route `install_package` (both copies) and the build's
  `pnpm/npm install` through `vault.exec` with a per-tenant network
  allow-list.** With `--ignore-scripts` on, remaining surface is
  registry exfil and dependency-confusion — solvable only with egress
  allow-list actually enforced at the cgroup/nft layer, not just
  `HTTP_PROXY` env injection.
- **Add a `SystemCallFilter`-emitting layer to the default systemd
  backend** (not the optional `DOABLE_DEV_SECCOMP=on` switch). Deny
  `@debug @module @mount @raw-io @reboot @swap @privileged @keyring`.
  Near-zero cost; caps every preview + build, not just opt-in ones.
- **Make backend selection observable and pluggable.** Replace
  auto-detect ladder with explicit configuration (`DOVAULT_BACKEND=`
  required in prod). Log resolved backend + every limit applied at
  API startup, before any spawn.
