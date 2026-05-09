# 13 — Path C: Sandbox UID drop, properly re-enabled

**Severity:** HIGH (was a known gap; this closes it)
**Date:** 2026-05-09
**Status:** SHIPPED in setup-v3 (default ON for fresh installs); migration script provided for existing installs

This document is the canonical reference for **why** the per-project sandbox UID drop was disabled, **what** we changed to bring it back safely under an unprivileged API, **what attacks it now blocks**, **what it still does NOT cover**, and **how an operator verifies it landed**.

Cross-refs:
- `servertodo/02-services-as-root.md` — original "everything as root" finding
- `servertodo/05-dovault-spawn-wiring.md` — the wider sandbox wiring problem
- `servertodo/11-security-claims-audit.md` §4 row "Per-project sandbox UID drop" (this finding closes that "available, not default" line)

---

## 1. Why — the gap we're closing

When the v3 setup migrated the API process off `root` and onto an unprivileged `doable` OS user (servertodo/02), one capability went with it: **the API can no longer `chown` project directories to UIDs in the sandbox range (10001-65000)**, because `chown(2)` to a different owner requires `CAP_CHOWN`, which `doable` does not have.

`packages/dovault/dev-uid-allocator.ts` detects `EUID != 0` and returns `null`, which short-circuits the `setpriv --reuid <uid> --regid <uid>` step in `services/api/src/projects/vite-jail.ts`. The result, on every v3 install since the migration:

- Vite dev servers (and any user-controlled child process spawned by them) run as **`doable`**, the same UID as the API.
- That UID can read `/opt/doable/.env` (mode 0600, owned by `doable:doable`), which contains:
  - `DATABASE_URL` with the live postgres password
  - `JWT_SECRET`, `PROJECT_JWT_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY`
  - GitHub / Google / Supabase OAuth client secrets
  - Stripe + Resend keys when configured
  - BYOK provider keys (Anthropic / OpenAI / etc.) if pasted at install
- Nothing prevents one project's process from reading another project's source tree under `services/api/projects/<other-id>/`.
- Outbound from that UID is constrained by nft+Squid (Phase 10), but only by accident — nft keys on `skuid`, and `skuid=doable` is in the *allow* path, not the constrained path.

This is the regression we fix. The dovault systemd backend (cgroup limits, MemoryMax, ProtectSystem, NoNewPrivileges, SystemCallFilter) **was already wired** for build-time spawn; the only missing piece was getting back to a per-project UID at preview time.

---

## 2. What we changed — three pieces

### 2a. `/opt/doable/bin/sandbox-spawn` — privileged wrapper

A small C-style shell wrapper, owned `root:root`, mode `0755`, that:

1. Validates `argv[1]` (UID) is a numeric integer in the range **10001-65000**.
2. Validates `argv[2]` (project_id) matches `^[a-zA-Z0-9_-]{1,64}$`.
3. Validates `argv[3..]` (command) starts with one of an allowlisted set of binaries (`/usr/bin/setpriv`, `/usr/bin/chown`, the project-dir prefix `/opt/doable/services/api/projects/`).
4. Refuses anything else with a clear error written to stderr and a non-zero exit.
5. On success, `execve`'s into the requested command with the supplied UID/project_id; nothing else from the calling environment is forwarded except `PATH`, `HOME`, and a whitelist of `DOABLE_*` and `BUILD_HTTP_PROXY` / `NO_PROXY`.

The wrapper itself is **not setuid** — it relies on being invoked under `sudo` from the `doable` user via the narrowly-scoped sudoers rule below.

### 2b. `/etc/sudoers.d/90-doable-sandbox` — narrow grant

```
# Allow the doable user to invoke the sandbox-spawn wrapper and chown
# a project directory to a sandbox-range UID. Nothing else.
doable ALL=(root) NOPASSWD: /opt/doable/bin/sandbox-spawn *
doable ALL=(root) NOPASSWD: /usr/bin/chown -R [0-9]\:[0-9] /opt/doable/services/api/projects/*
Defaults!/opt/doable/bin/sandbox-spawn !requiretty, env_keep += "DOABLE_* BUILD_HTTP_PROXY NO_PROXY"
```

Mode `0440`, owned `root:root`, validated by `visudo -c` at install time. The chown grant is bounded by a glob on the project-dir prefix; it does not let `doable` chown anything outside `/opt/doable/services/api/projects/`.

### 2c. `DOABLE_DEV_UID_DISABLED=0` (default in setup-v3)

`setup-v3/setup-server-v3.sh` sets `DOABLE_DEV_UID_DISABLED=0` by default once 2a and 2b are installed. The previous comment block (lines 698-709) is updated to reflect that the wrapper now bridges the missing CAP_CHOWN. `dev-uid-allocator.ts` checks for the wrapper at startup and re-enables the allocator path when it is present and executable.

The API logs at boot:

```
[dovault] sandbox UID drop: enabled via sudo wrapper (/opt/doable/bin/sandbox-spawn)
```

…or, if the wrapper is missing or the sudoers rule is wrong:

```
[dovault] sandbox UID drop: DISABLED — wrapper not found or sudoers misconfigured
```

so operators can tell at a glance which posture the install is actually in.

---

## 3. What's now blocked — before vs after

| Attack scenario (vite-jail child running attacker-controlled code) | Before Path C | After Path C |
|---|---|---|
| Read `/opt/doable/.env` (DB password, JWT_SECRET, ENCRYPTION_KEY, OAuth secrets, BYOK keys) | **READ** — same UID as API | **DENIED** — UID 10001+, mode 0600 owned by `doable:doable` |
| Read another project's source under `services/api/projects/<other>/` | **READ** — same UID as API owns all projects | **DENIED** — each project chowned to a distinct sandbox UID |
| Connect to `127.0.0.1:5432` (Postgres) | **CONNECT** with `pg_hba` `local trust` for `doable` user (or password from .env) | **DENIED** — `pg_hba.conf` has no entry for sandbox UIDs; no DB password reachable anyway |
| Outbound TCP to `attacker.example.com` | nft+Squid-constrained but skuid was the API uid (allow path) — **leaked** | **DENIED** — nft `skuid` rule for 10001-65000 routes through Squid; Squid allowlist drops non-allowlisted hostnames |
| Read `/root/*` (legacy v2 install dir, if present) | **READ** when API is root, mode-dependent when API is `doable` | **DENIED** — sandbox UID has no perm bits |
| Read `/etc/shadow`, SSH host keys | DENIED (root-only readable) | DENIED |
| `kill(1, SIGTERM)` — kill the API process | **POSSIBLE** — same UID | **DENIED** — different UID, EPERM |
| Write to other project's directory | **WRITE** (same UID) | **DENIED** — different UID owns the other dir |

Note that the rows the v2 audit (servertodo/01) flagged as critical — `.env` read and other-project read — are the two that flip from READ to DENIED. That is the threat model this fix is designed for.

---

## 4. What's still NOT covered

Path C is not a complete sandbox. Things it deliberately does not address:

- **Kernel CVEs.** A local-priv-escalation in the kernel (e.g. CVE-2022-0847 "Dirty Pipe" class) would bypass UID-based isolation entirely. Mitigation: keep the kernel patched (`unattended-upgrades` is already enabled in setup-v3 Phase 1).
- **Supply-chain attacks within the Squid allowlist.** A malicious npm package fetched from `registry.npmjs.org` (an allowlisted host) executes during `npm install` with the sandbox UID. The UID isolation prevents it from reading `.env` or escaping its own project, but it can still consume CPU, run AI-pipeline-style requests (if BYOK keys are reachable through the proxy — they aren't from the sandbox UID, but it's worth knowing), and exfiltrate the contents of the project itself to another allowlisted host.
- **Denial-of-service via cgroup-evading patterns.** dovault's systemd backend sets `MemoryMax` and `CPUQuota`, but a fork bomb or rapid-respawn loop can still pressure the host before the cgroup catches it. `TasksMax` should be set in the dovault unit template; verify with `systemctl show <unit> | grep -E 'TasksMax|MemoryMax|CPUQuota'`.
- **Same-UID lateral movement when project IDs collide.** UIDs 10001-65000 are allocated round-robin from a finite pool; over time, a UID will be reused for a different project. The chown step on project (re)creation is what enforces fresh ownership; a stale file from a previous tenant under the same UID is theoretically reachable. The allocator clears the project dir on UID reassignment, so this is closed in practice — but it's worth flagging for any future code that allocates UIDs without going through the allocator.
- **Egress to allowlisted hosts that proxy to anywhere.** If `registry.npmjs.org` were to be replaced by a more permissive proxy (e.g. a generic CDN that fetches arbitrary URLs), the Squid allowlist's value drops accordingly. Squid's allowlist should be treated as a **policy** that needs review when the upstream surface changes.
- **The `doable` API user itself.** RCE in the API process still gives the attacker `doable` UID, which CAN read `.env`. Path C protects against vite-jail children, not against an API-process compromise. Application-layer hardening (input validation, AuthN/AuthZ middleware, dependency updates) is the mitigation for that vector.

---

## 5. Verification commands

Run these on the server after installing Path C (either via fresh `setup-v3/setup-server-v3.sh` or via the upgrade script in `setup-v3/upgrade-to-path-c.sh`):

### 5a. Wrapper installed correctly

```sh
ls -l /opt/doable/bin/sandbox-spawn
# expect: -rwxr-xr-x 1 root root <size> <date> /opt/doable/bin/sandbox-spawn
```

If owner is not `root:root` or mode is anything other than `0755`, the wrapper is unsafe — re-run the upgrade script.

### 5b. Sudoers rule installed and valid

```sh
sudo visudo -c -f /etc/sudoers.d/90-doable-sandbox
# expect: /etc/sudoers.d/90-doable-sandbox: parsed OK

ls -l /etc/sudoers.d/90-doable-sandbox
# expect: -r--r----- 1 root root <size> <date> /etc/sudoers.d/90-doable-sandbox
```

### 5c. Wrapper rejects out-of-range UIDs

```sh
sudo -u doable sudo -n /opt/doable/bin/sandbox-spawn 99 abc /tmp/x
# expect: refusal — "UID 99 not in sandbox range 10001-65000"
# exit code: non-zero
```

```sh
sudo -u doable sudo -n /opt/doable/bin/sandbox-spawn 10001 '../../../etc/passwd' /tmp/x
# expect: refusal — "project_id failed validation"
```

### 5d. Live preview process runs as a sandbox UID

Trigger a project preview (open `https://<env>.doable.me/editor/<projectId>`, click Run), then on the server:

```sh
ps -eo user,pid,ppid,cmd | grep -E '(vite|node).*projects/' | grep -v grep
# expect: USER column shows numeric UID in 10001-65000 (or the doable-dev-N username),
# NOT "doable" or "root"
```

Equivalent via `/proc`:

```sh
for pid in $(pgrep -f 'projects/.*vite'); do
  echo "PID $pid: $(awk '/^Uid:/ {print $2}' /proc/$pid/status)"
done
# expect: each UID in 10001-65000
```

### 5e. Sandbox UID cannot read `.env`

```sh
# Pick any sandbox UID (use 10001 if available)
sudo -u \#10001 cat /opt/doable/.env 2>&1 | head -1
# expect: cat: /opt/doable/.env: Permission denied
```

The setup-v3 script also runs this exact assertion at the end of Phase 9 and aborts the install if it succeeds.

### 5f. Sandbox UID cannot reach Postgres

```sh
sudo -u \#10001 psql -h 127.0.0.1 -U doable -d doable -c 'SELECT 1' 2>&1 | head -2
# expect: connection refused or auth failure (no entry in pg_hba for this UID,
# no DB password reachable from the sandbox UID's environment)
```

### 5g. API startup log confirms posture

```sh
journalctl -u doable.service --since "5 minutes ago" | grep -E 'sandbox UID drop'
# expect: [dovault] sandbox UID drop: enabled via sudo wrapper
```

If the log says `DISABLED`, Path C did not land — re-run the upgrade script and check journal for the failure reason.

---

## 6. Rollback

If Path C breaks something on a live install, revert in this order:

1. `sed -i 's/^DOABLE_DEV_UID_DISABLED=0/DOABLE_DEV_UID_DISABLED=1/' /opt/doable/.env`
2. `systemctl restart doable.service`
3. (Optional, only if the wrapper itself is suspect) `rm /opt/doable/bin/sandbox-spawn /etc/sudoers.d/90-doable-sandbox`

Step 1 alone is sufficient for an emergency revert — the allocator stops handing out sandbox UIDs and previews fall back to running as `doable`, the pre-Path-C posture. The wrapper and sudoers rule are inert without `DOABLE_DEV_UID_DISABLED=0`, so leaving them in place after revert is harmless.

---

## 7. Provenance

- Wrapper source: `setup-v3/sandbox-spawn` (committed by teammate-J)
- Sudoers source: `setup-v3/90-doable-sandbox.sudoers` (committed by teammate-J)
- Migration script: `setup-v3/upgrade-to-path-c.sh` (this commit)
- setup-v3 default flip: `setup-v3/setup-server-v3.sh` line ~709 (committed by teammate-K)
- Allocator change: `packages/dovault/src/dev-uid-allocator.ts` (committed by teammate-K)
