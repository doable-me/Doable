# 07 — Jail Profiles

A profile is a serializable description of "what world should this
process see." This chapter catalogs the profiles Doable needs on day
one. The shape comes from chapter 06.

## Why per-purpose profiles

A one-size profile is wrong because Doable spawns processes with
genuinely different needs:

- The **AI bash tool** wants the most aggressive isolation possible —
  it doesn't need network (most of the time), shouldn't see other
  tenants, never needs `/dev/kvm`. Anything beyond "read the project
  files and write to them" is surface area we can drop.
- The **vite preview** is long-running, needs `inotify` on hundreds
  of files, needs to bind a localhost port the reverse proxy
  forwards to, and legitimately needs outbound network (HMR, source
  maps, AI gateway during dev). Its profile is much more permissive
  than the AI bash tool's.
- The **install step** (`pnpm install`, `npm install`) needs
  outbound to the npm registry but nowhere else, and exercises a lot
  of filesystem code (tarball extraction, symlink creation, lifecycle
  scripts when not `--ignore-scripts`).
- The **build step** is install-like but lower-network — only
  artifact upload (in publish flows) and source-map fetches.

Same backend, different profiles. Mixing them up either over-isolates
(vite breaks) or under-isolates (AI bash leaks).

## Profile catalog

Profiles live in `services/api/src/sandbox/profiles/`. Each is a
plain TS file exporting a `SandboxProfile` factory: take the
caller's `SpawnContext` and return a profile customized for that
project.

### `ai-bash` — the tightest

```ts
// services/api/src/sandbox/profiles/ai-bash.ts
export const aiBashProfile = (ctx: SpawnContext): SandboxProfile => ({
  id: "ai-bash",
  fs: {
    rootDir: getProjectPath(ctx.projectId),
    readOnlyBinds: [
      { host: "/usr",     jail: "/usr"     },
      { host: "/bin",     jail: "/bin"     },
      { host: "/lib",     jail: "/lib"     },
      { host: "/lib64",   jail: "/lib64"   },
      { host: "/etc/ssl/certs", jail: "/etc/ssl/certs" },
      { host: NPM_CACHE_DIR, jail: "/.npm-cache" },
    ],
    tmpfs: [
      { jail: "/tmp", sizeBytes: 100 * MB },
      { jail: "/run", sizeBytes: 10 * MB },
    ],
    procOverlay: {
      cpuinfo: { cores: 1, modelName: "Synthetic CPU", mhz: 1000 },
      meminfo: { totalKb: 512 * 1024, availableKb: 256 * 1024 },
      uptimeSec: 1,
      loadavg: [0, 0, 0],
      mask: [
        "/proc/version",   "/proc/partitions", "/proc/modules",
        "/proc/swaps",     "/proc/stat",       "/proc/diskstats",
        "/proc/mounts",    "/proc/mountinfo",  "/proc/mountstats",
        "/proc/interrupts","/proc/cgroups",    "/proc/kallsyms",
        "/proc/kcore",     "/proc/keys",
      ],
    },
    etcSynth: {
      "/etc/passwd": "project:x:65534:65534:project:/work:/bin/sh\nroot:x:0:0:root:/root:/bin/sh\n",
      "/etc/group":  "project:x:65534:\nroot:x:0:\n",
      "/etc/hostname": "project\n",
      "/etc/resolv.conf": "nameserver 127.0.0.1\n",
      "/etc/os-release": 'NAME=Doable\nID=doable\n',
    },
    masks: [
      "/opt/doable", "/home", "/root", "/var/lib/dpkg",
      "/var/log", "/sys/devices", "/sys/class/dmi", "/sys/firmware",
      "/dev/kmsg", "/dev/mem", "/dev/kvm",
    ],
  },
  ns: {
    pid: true, net: "egress-allowlist", uts: true, ipc: true, user: true,
  },
  user: { uid: 65534, gid: 65534, passwd: { 65534: "project:x:65534:65534:project:/work:/bin/sh" } },
  syscalls: {
    capsKeep: [],
    seccompDefault: "errno",
    seccompDeny: [
      "bpf", "keyctl", "io_uring_setup", "io_uring_enter", "io_uring_register",
      "userfaultfd", "perf_event_open", "ptrace", "process_vm_readv", "process_vm_writev",
      "unshare", "setns", "mount", "umount", "umount2", "pivot_root", "chroot",
      "kexec_load", "kexec_file_load", "init_module", "finit_module", "delete_module",
      "create_module", "query_module", "get_kernel_syms", "syslog",
      "_sysctl", "lookup_dcookie", "uselib", "iopl", "ioperm",
    ],
  },
  limits: {
    memBytes: 256 * MB, cpuQuotaPercent: 50, nproc: 64, nofile: 1024,
    cpuTimeSeconds: 60,
  },
  network: {
    defaultAction: "deny",
    allow: [
      "registry.npmjs.org",      // for the model to read package metadata via Doable proxy
      "api.anthropic.com",       // AI provider, if proxied
      "api.openai.com",
      "ghcr.io", "github.com",
    ],
    deny: ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"], // cloud metadata
  },
  env: {
    allowlist: ["PATH", "LANG", "LC_ALL", "HOME", "TERM"],
    inject: {
      HOME: "/work", PWD: "/work", USER: "project", PATH: "/usr/local/bin:/usr/bin:/bin",
    },
  },
  timeoutMs: 60_000,
});
```

Notes:

- `network.deny` lists explicitly include `ipinfo.io` and the cloud
  metadata endpoint — these were exactly the recon URLs the
  2026-05-09 leak touched.
- `etcSynth["/etc/passwd"]` reveals only the synthetic project user
  and root. `cat /etc/passwd` returns 2 lines, not 119.
- `fs.masks` hides `/opt/doable` so tenant lateral-listing is
  impossible.
- `procOverlay.cpuinfo` reports 1 core. The model that "you have 8
  cores at 4.2 GHz" stops working.
- Caps fully dropped. Seccomp denies the high-CVE syscalls (the list
  comes from gVisor's deny set + Docker's default).
- `timeoutMs: 60_000` is the per-call cap. A model loop that calls
  bash 50 times still gets 50 separate 60-second budgets.

### `vite-preview` — long-running, file-watch heavy

```ts
export const vitePreviewProfile = (ctx: SpawnContext): SandboxProfile => ({
  id: "vite-preview",
  fs: {
    rootDir: getProjectPath(ctx.projectId),
    readOnlyBinds: [
      { host: "/usr", jail: "/usr" },
      { host: "/bin", jail: "/bin" },
      { host: "/lib", jail: "/lib" }, { host: "/lib64", jail: "/lib64" },
      { host: "/etc/ssl/certs", jail: "/etc/ssl/certs" },
      { host: NPM_CACHE_DIR, jail: "/.npm-cache" },
    ],
    tmpfs: [
      { jail: "/tmp", sizeBytes: 500 * MB },
      { jail: "/run", sizeBytes: 10 * MB },
    ],
    procOverlay: { /* same shape as ai-bash but with cores=2, mem=1G */ ... },
    etcSynth: { /* same minimal set */ ... },
    masks: ["/opt/doable", "/home", "/root", "/var/lib/dpkg", "/var/log"],
  },
  ns: {
    pid: true,
    /** vite needs network for HMR ws + AI gateway during dev. */
    net: "egress-allowlist",
    uts: true, ipc: true, user: true,
  },
  user: { uid: 9000 + ctx.projectId.charCodeAt(0) % 1000, ... },
  syscalls: {
    capsKeep: [],
    seccompDefault: "errno",
    seccompDeny: [/* same high-CVE list as ai-bash */],
  },
  limits: {
    memBytes: 512 * MB, cpuQuotaPercent: 75, nproc: 256, nofile: 4096,
    /** Long-running — no cpuTimeSeconds cap. */
    cpuTimeSeconds: 0,
  },
  network: {
    defaultAction: "deny",
    allow: [
      "registry.npmjs.org", "registry.yarnpkg.com",
      "esm.sh", "unpkg.com", "cdn.jsdelivr.net",
      "fonts.googleapis.com", "fonts.gstatic.com",
      // No ipinfo / metadata; same denylist as ai-bash
    ],
    deny: ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"],
  },
  env: {
    allowlist: ["PATH", "LANG", "LC_ALL", "HOME", "TERM", "NODE_ENV"],
    inject: {
      HOME: "/work", PWD: "/work", USER: "preview",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      NODE_ENV: "development",
    },
  },
  /** Effectively no timeout — supervised lifecycle managed by api/dev-server.ts */
  timeoutMs: 0,
});
```

Notes:

- Looser than `ai-bash` on resource limits and network, tighter on
  nothing else.
- `user.uid` derived per-project so two tenants' preview processes
  can't read each other's files even if mount-ns drifts.
- `nproc: 256` reflects vite/esbuild legitimately fanning out.

### `install` — registry-only network

```ts
export const installProfile = (ctx: SpawnContext): SandboxProfile => ({
  id: "install",
  fs: { /* same skeleton as vite-preview, plus rw on /.npm-cache */ ... },
  ns: { pid: true, net: "egress-allowlist", uts: true, ipc: true, user: true },
  user: { uid: 9500, gid: 9500, passwd: { 9500: "installer:x:9500:9500::/work:/bin/sh" } },
  syscalls: { /* same high-CVE deny list */ },
  limits: { memBytes: 1 * GB, cpuQuotaPercent: 100, nproc: 512, nofile: 8192, cpuTimeSeconds: 600 },
  network: {
    defaultAction: "deny",
    /** ONLY package registries. No AI providers, no CDN. */
    allow: ["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org"],
    deny: ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"],
  },
  env: { allowlist: ["PATH", "LANG", "HOME"], inject: { ... } },
  timeoutMs: 600_000,  // 10 min — installs can be slow
});
```

Notes:

- The narrowest network allow-list of any profile. If a malicious
  `postinstall` tries to `curl` an attacker server, the syscall
  fails at the nft-egress composer.
- `--ignore-scripts` is enforced by the caller, not the profile,
  because it's an argv flag — but the profile makes the
  belt-and-braces case: even if scripts run, they can't phone home.

### `build` — quiet, lower-network

```ts
export const buildProfile = (ctx: SpawnContext): SandboxProfile => ({
  id: "build",
  fs: { /* same as install but rw also on dist/ */ ... },
  ns: { pid: true, net: "egress-allowlist", uts: true, ipc: true, user: true },
  user: { uid: 9501, gid: 9501, passwd: { 9501: "builder:x:9501:9501::/work:/bin/sh" } },
  syscalls: { /* same high-CVE deny list */ },
  limits: { memBytes: 1 * GB, cpuQuotaPercent: 100, nproc: 512, nofile: 8192, cpuTimeSeconds: 300 },
  network: {
    defaultAction: "deny",
    /** Builds occasionally fetch source maps + sentry source upload. */
    allow: ["registry.npmjs.org", "*.sentry.io"],
    deny: ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"],
  },
  env: { allowlist: ["PATH", "LANG", "HOME", "NODE_ENV"], inject: { NODE_ENV: "production", ... } },
  timeoutMs: 300_000,
});
```

## Workspace overrides

A workspace admin can edit profile fields via the existing
`workspace_sandbox_rules` and `workspace_sandbox_settings` tables
(migration 073), plus a few new columns the implementation will add.
Override surface, in order of precedence:

1. **Per-rule allow/deny** added to a profile's `network.allow` /
   `network.deny` lists.
2. **Default action overrides** —
   `workspace_sandbox_settings.tool_default_action` and
   `network_default_action`.
3. **Backend pin** — `workspace_sandbox_settings.sandbox_backend`
   (new column).
4. **Profile selection cap** — admin can ban specific profiles
   (e.g., "no `ai-bash` for this workspace, AI shell tool is hard
   denied").

The profile resolver in
`services/api/src/sandbox/profile-resolver.ts` reads the default
catalog file, then layers workspace overrides on top, then ctx
overrides on top of that.

## Defaults vs. overrides

| Knob | Default (catalog) | Workspace override | Per-call override |
|---|---|---|---|
| Network policy | Profile's `network.{allow,deny}` | Add to allow/deny | Add (never remove) |
| Default network action | `deny` | `allow` or `deny` | not allowed |
| Memory cap | Profile's `limits.memBytes` | Tighten only | Tighten only |
| CPU quota | Profile's `limits.cpuQuotaPercent` | Tighten only | Tighten only |
| Timeout | Profile's `timeoutMs` | Tighten only | Tighten only |
| `fs.masks` | Profile's masks | Add only | Add only |
| Backend | Auto | Pin specific | Override (ops only) |

Rule of thumb: workspace can make a profile *stricter*, never
*looser*. The catalog defaults are the maximum permission a
profile will ever ask for.

## Test fixtures

Every profile gets a golden-file test:

1. Render the profile to its backend-specific spawn shape
   (for psroot, bwrap, systemd separately).
2. Snapshot the rendered argv + env into `__snapshots__/<profile>.<backend>.shape`.
3. Assert that the procfs mask produces a stable synthetic
   `/proc/cpuinfo` and `/proc/meminfo` output.
4. Run the integration recon test (chapter 12): the actual leak
   prompt from 2026-05-09. Assert: synthetic CPU model returned,
   `/etc/passwd` has 2 lines (project + root), `ls /opt/doable`
   returns ENOENT, `curl ipinfo.io` fails.

This catches every regression *before* a profile change lands on
the deployed host.
