# 02 — All Doable services run as root

**Severity:** CRIT

tl;dr: api, web, and ws (plus their child Puppeteer Chrome with `--no-sandbox`) all run as uid=0 on dodev. Any RCE in any of them is instant host root, with no outer container layer to contain it.

## Evidence

`doable.service` has no `User=` / `Group=` directive, so systemd defaults to root:

```ini
# /etc/systemd/system/doable.service (relevant excerpt)
[Service]
Type=forking
ExecStart=/usr/bin/tmux new-session -d -s doable -n api -c /root/doable
# ... no User=, no Group=, no AmbientCapabilities=, no NoNewPrivileges=
```

tmux session and child processes — all uid=0:

```text
$ ps -eo pid,uid,user,cmd | grep -E "tmux|tsx|next-server|ws/dist|chrome"
1964001    0 root  tmux new-session -d -s doable -n api -c /root/doable
1977661    0 root  node .../tsx watch ... services/api/src/index.ts
1964195    0 root  next-server (v15) ...
1967763    0 root  node services/ws/dist/index.js
 948350    0 root  /usr/bin/google-chrome --no-sandbox --disable-setuid-sandbox ...
1613327    0 root  /usr/bin/google-chrome --no-sandbox --disable-setuid-sandbox ...
```

Process file ownership:

```text
$ stat -c '%a %U:%G %n' /root /root/doable /root/doable/.env
711 root:root /root
755 root:root /root/doable
644 root:root /root/doable/.env
```

PRD assumes an outer container that does NOT exist on this host:

- `sandboxagnosticPRD/01-architecture.md` §1.1 specifies an outer Docker `--privileged` wrapper around the entire doable stack as the first containment boundary. dodev runs `doable.service` directly on the bare-metal host via systemd+tmux — there is no outer layer.

Per-project Vite jails do drop UID correctly (`setpriv --reuid=10001..10021 --regid=...`), confirming the api process holds `CAP_SETUID`/`CAP_SETGID` from its root bounding set. The UID drop for sandboxes works; it is the parent that is unconfined.

## Impact

- One RCE in any HTTP handler under `services/api`, `services/web`, or `services/ws` lands the attacker as uid=0 on the host. No privilege boundary to cross.
- Puppeteer renders attacker-influenceable HTML (project preview thumbnails, published-site captures) under Chrome with `--no-sandbox --disable-setuid-sandbox`. A Chromium renderer bug — historically several per quarter — is a direct path from "viewable HTML" to host root. With sandbox flags off there is no SUID-zygote layer to stop it.
- The api process has root's full capability set: it can read every secret on the box (`/etc/shadow`, every `.env`, postgres data dir, cloudflared credentials at `/etc/cloudflared/*.json`, `/root/.ssh/*`), modify any unit file, append to `/root/.ssh/authorized_keys`, restart `cloudflared` to redirect the tunnel, bind privileged ports, load kernel modules, etc.
- Zero blast-radius containment if any transitive dep ships a vuln (node, tsx, hono, pnpm, next, ws, yjs, puppeteer, undici). Supply-chain compromise = host compromise.
- Postgres and caddy already run as their own users — they would survive a doable compromise only in the sense that the attacker would have to switch hats; with root, they can `su postgres` or read the data directory directly.

## Fix

### Option A — full non-root migration (preferred)

Create a dedicated service account outside the dev-uid pool (10001–65000 reserved by `services/api/src/runtime/dev-uid-allocator.ts:46-64`):

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin -u 5000 doableapp
# Note: OS user named `doableapp` to avoid colliding with the postgres role `doable`
# (different namespaces, but humans confuse them; rename here saves later pain).
```

Move the install out of `/root` (root-owned dirs make non-root migration awkward and the optics are bad even if the perms are right):

```bash
mkdir -p /srv/doable
rsync -aHAX /root/doable/ /srv/doable/
chown -R doableapp:doableapp /srv/doable

# Secrets out of the working tree, mode 600:
mkdir -p /etc/doable
mv /srv/doable/.env /etc/doable/env
chown root:doableapp /etc/doable/env
chmod 640 /etc/doable/env
```

Rewrite the unit. Replace `/etc/systemd/system/doable.service`:

```ini
[Unit]
Description=Doable platform (api + web + ws)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=forking
User=doableapp
Group=doableapp
WorkingDirectory=/srv/doable
EnvironmentFile=/etc/doable/env

ExecStart=/usr/bin/tmux new-session -d -s doable -n api -c /srv/doable
ExecStop=/usr/bin/tmux kill-session -t doable

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false   # node JIT needs W^X off; revisit if --jitless is acceptable
ReadWritePaths=/srv/doable /var/log/doable

[Install]
WantedBy=multi-user.target
```

**Critical caveat — sandbox spawn requires CAP_SETUID/CAP_SETGID.** `vite-jail` shells out to `setpriv --reuid=<devuid> --regid=<devuid>` and the dev-uid pool starts at 10001. As `doableapp` (uid=5000) without capabilities, that `setpriv` will EPERM. Three options, in decreasing order of preference:

1. **Delegate to systemd-run via polkit (preferred, per `sandboxagnosticPRD/06-migration-plan.md` Phase 1 / dovault.spawn).** The api calls `systemd-run --uid=<devuid> --gid=<devuid> --scope ...` over the user-bus or system-bus with a polkit rule that authorizes only `doableapp` to spawn scopes inside a fixed uid range (10001–65000) with a fixed unit name prefix. The api itself stays unprivileged. This is the design dovault.spawn already targets — finishing 05-dovault-spawn-wiring.md collapses this caveat to nothing.

2. **Tiny setuid-root wrapper.** Ship a ~30-line C binary `/usr/local/libexec/doable-spawn-jail` that argv-validates `(uid in 10001..65000, project-dir prefix == /srv/doable/projects/, command basename == vite|node)` and `execve`s `setpriv`. Owned `root:doableapp`, mode 4750. Strictly smaller attack surface than granting the api ambient caps — but still a custom setuid binary that needs review.

3. **AmbientCapabilities on the unit (last resort).** Add `AmbientCapabilities=CAP_SETUID CAP_SETGID` and `CapabilityBoundingSet=CAP_SETUID CAP_SETGID` to the systemd unit. The api process then runs as uid=5000 but can `setuid()` to anyone. This is *better* than running as root (no CAP_SYS_ADMIN, no CAP_DAC_OVERRIDE, no CAP_NET_BIND_SERVICE, no CAP_CHOWN), but it still means an api RCE can become any uid on the box. Do this only if (1) and (2) are blocked.

Postgres role vs OS user: keep the postgres role named `doable` (per `setup-server.sh`); name the OS account `doableapp`. Different namespaces, but the rename avoids a foot-gun where `sudo -u doable psql` does the wrong thing depending on context.

Update `setup-server.sh` to create `doableapp`, install to `/srv/doable`, install `/etc/doable/env`, and drop the new unit. Fresh hosts should never produce a root-running stack again.

### Option B — partial split (NOT recommended, documented for completeness)

Run web + ws as `doableapp`, leave api as root because of the spawn-caps requirement. Two systemd units, two tmux sessions (or split the unit into three).

Why this is weak: api is the largest HTTP surface (Hono routes, Copilot SDK, AI provider clients, Puppeteer driver, project file IO). It is the *most* likely RCE target, not the least. Hardening web+ws while leaving api as root reduces the lateral surface but not the primary one. Only adopt this as a stepping stone if Option A's caveat (1)/(2)/(3) all need design time and you want web/ws hardened this week.

## Verification

```bash
# Unit declares the non-root identity and hardening
systemctl show doable.service -p User,Group,AmbientCapabilities,CapabilityBoundingSet,NoNewPrivileges,ProtectSystem,ProtectHome,PrivateTmp
# Expect: User=doableapp Group=doableapp NoNewPrivileges=yes ProtectSystem=strict ...

# All three long-lived processes run as doableapp
ps -eo pid,user,cmd | grep -E "tsx watch|next-server|node .*ws/dist" | grep -v grep
# Expect: USER column = doableapp on every row

# OS account exists and is locked-down
getent passwd doableapp
# Expect: doableapp:x:5000:5000::/nonexistent:/usr/sbin/nologin

# Per-project sandbox UID drop still works after the migration
# (open a project preview in the UI first, then:)
ps -ef | grep -E "vite.*<projectId>" | grep -v grep
# Expect: UID column in 10001..10021 (NOT 5000, NOT 0)

# Secrets file is not world-readable and not owned by the runtime user
stat -c '%a %U:%G %n' /etc/doable/env
# Expect: 640 root:doableapp /etc/doable/env

# Nothing on /root is required at runtime
lsof -p "$(pgrep -f 'tsx watch.*services/api')" | grep -E "/root/" || echo "clean"
# Expect: clean
```

## References

- `sandboxagnosticPRD/01-architecture.md` §1.1 — outer container layer (not deployed; this finding exists because §1.1 is missing on dodev)
- `sandboxagnosticPRD/06-migration-plan.md` Phase 1 — dovault.spawn wiring; resolves the CAP_SETUID caveat above
- `services/api/src/runtime/dev-uid-allocator.ts:46-64` — dev-uid pool 10001..65000; `doableapp` uid must stay outside this range
- `setup-server.sh` — must be updated to create `doableapp`, lay out `/srv/doable` and `/etc/doable/env`, and install the hardened unit
- Sibling findings: `servertodo/01-env-secrets.md`, `servertodo/03-puppeteer-hardening.md`, `servertodo/05-dovault-spawn-wiring.md`
