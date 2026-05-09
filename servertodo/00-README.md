# Doable dodev.fid.pw — Server Recovery Plan

## TL;DR

Bare-metal Ubuntu 24.04 host (`143.110.188.13`) running Doable as `root` via `doable.service` → tmux (`api`, `web`, `ws`). Per-project Vite dev servers correctly drop UID (10001, 10016-10021), so the sandbox primitive works. However, defense-in-depth gaps mean a sandboxed UID can still read `/root/doable/.env` (mode 644), exfiltrate, or escalate. App-layer JWT/secret-handling issues compound the blast radius — see `secureIntegrationsPRD/07-security-findings.md`.

## Severity matrix

| #  | File                                   | Severity | Title                                     |
|----|----------------------------------------|----------|-------------------------------------------|
| 01 | 01-env-secrets.md                      | CRIT     | World-readable .env                       |
| 02 | 02-services-as-root.md                 | CRIT     | All services run as root                  |
| 03 | 03-puppeteer-hardening.md              | HIGH     | Puppeteer Chrome `--no-sandbox` as root   |
| 04 | 04-egress-jail.md                      | HIGH     | No `nft skuid` rules + Squid inactive     |
| 05 | 05-dovault-spawn-wiring.md             | HIGH     | vite-jail bypasses `dovault.spawn`        |
| 06 | 06-app-layer-findings-pointer.md       | INFO     | Pointer to app-layer audit                |
| 07 | 07-next-server-setup-checklist.md      | TODO     | Forward-looking checklist for new server  |
| 08 | 08-v3-flow.md                          | TODO     | v3 setup flow + operator CLI              |

## Recommended fix order

1. **01** — `chmod 600 /root/doable/.env` (immediate, no restart needed; verify with `lsof` first).
2. **02** — Migrate `doable.service` off `root` to a dedicated `doable` system user; chown app dir.
3. **04** — Land `nft` egress rules keyed on `skuid` for sandbox UIDs (10001, 10016-10021), bring Squid online for outbound HTTP allowlist.
4. **05** — Route every per-project Vite spawn through `dovault.spawn` so sandbox UID drop, cgroup, and egress jail are enforced uniformly.
5. **03** — Drop Puppeteer `--no-sandbox`; run Chrome under a dedicated UID with seccomp/AppArmor.
6. **06** — App-layer pass per `secureIntegrationsPRD/07-security-findings.md` (PROJECT_JWT_SECRET fallback, JWT_SECRET cross-domain reuse, etc.).

## Audit method

- SSH key at `~/Documents/itdept` (key-only auth, no password).
- Service introspection: `systemctl status doable`, `systemctl cat doable`, `ps -eo pid,uid,gid,cmd`.
- Process credential check: `cat /proc/<pid>/status | grep -E '^(Uid|Gid|Groups|CapEff)'`.
- Listener audit: `ss -tlnp` (verify nothing on `0.0.0.0`).
- Filesystem audit: `stat /root /root/doable /root/doable/.env`, `ls -la`.
- Sandbox UID readability test: `sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- cat /root/doable/.env` (returned full contents — bug).
- Negative control: same `setpriv` against `/etc/shadow` and `/etc/ssh/ssh_host_*_key` returned `Permission denied` (good).
- Egress jail: `nft list ruleset`, `systemctl status squid`.

## Reading order

- [01-env-secrets.md](01-env-secrets.md) — `.env` is mode 644; sandbox UIDs read DB creds + JWT_SECRET + OAuth secrets.
- [02-services-as-root.md](02-services-as-root.md) — api/web/ws all run as uid=0; one RCE = full host compromise.
- [03-puppeteer-hardening.md](03-puppeteer-hardening.md) — Chrome launched with `--no-sandbox` from a root-owned process for thumbnail generation.
- [04-egress-jail.md](04-egress-jail.md) — No `skuid`-keyed egress filtering; Squid declared in plan but inactive on host.
- [05-dovault-spawn-wiring.md](05-dovault-spawn-wiring.md) — Some spawn paths bypass `dovault.spawn`, so sandbox guarantees aren't uniform.
- [06-app-layer-findings-pointer.md](06-app-layer-findings-pointer.md) — Cross-link to existing app-layer audit.

## Cross-reference

- `secureIntegrationsPRD/07-security-findings.md` — app-layer findings; specifically Finding #2 (`PROJECT_JWT_SECRET` fallback to `JWT_SECRET`) and Finding #3 (`JWT_SECRET` shared across user-auth and project-token trust domains). Server-layer fix without app-layer fix still leaves token-forgery paths intact once `.env` leaks.
