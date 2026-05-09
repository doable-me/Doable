# servertodo/15 — Egress policy shift: default-allow + filters

## Summary

Squid's `/etc/squid/squid.conf` (written by `setup-v3/setup-server-v3.sh`,
Phase 6) has been shifted from a strict `dstdomain` whitelist to a
**default-allow policy with SSRF and executable-URL filters**.

Reason: the AI in Doable needs to browse arbitrary public sites for
design inspiration (Dribbble, Behance, Awwwards, Pinterest, etc.). The
old whitelist made every such fetch fail with HTTP 403, breaking the
"look at a real site and reproduce the layout" workflow.

## Old vs new policy

| Aspect | Old (strict whitelist) | New (default-allow + filters) |
| --- | --- | --- |
| Default action | `http_access deny all` | `http_access allow all` |
| npm/github/AI providers | allowed | allowed (`trusted_dst`) |
| Random public site (e.g. `dribbble.com`) | **blocked** | allowed |
| RFC1918 (10/8, 172.16/12, 192.168/16) | blocked | **blocked** |
| Loopback 127/8, IPv6 ::1 | blocked | **blocked** |
| Link-local 169.254/16 (cloud metadata) | blocked | **blocked** |
| IPv6 unique-local fc00::/7, link-local fe80::/10 | blocked | **blocked** |
| `*.exe`/`*.sh`/`*.dmg` over **HTTP** | blocked | **blocked** (urlpath_regex) |
| `*.exe`/`*.sh`/`*.dmg` over **HTTPS** | blocked (hostname-implied) | not enforced at proxy — see HTTPS caveat |

## What's still blocked

1. **Private IP ranges** (RFC1918): `10.0.0.0/8`, `172.16.0.0/12`,
   `192.168.0.0/16`. Prevents the AI / sandbox UID from probing the LAN
   the host sits in.
2. **Loopback** `127.0.0.0/8` and IPv6 `::1`. Prevents the proxy from
   being abused to reach other loopback-bound services on the host
   (e.g., the Doable API itself, Postgres, the Caddy admin endpoint).
3. **Link-local** `169.254.0.0/16` and IPv6 `fe80::/10`. Blocks AWS/GCP/
   Azure instance metadata SSRF (`169.254.169.254`).
4. **IPv6 unique-local** `fc00::/7`. IPv6 equivalent of RFC1918.
5. **Executable file extensions in URL paths** — `.exe`, `.msi`, `.dmg`,
   `.deb`, `.rpm`, `.pkg`, `.app`, `.bat`, `.cmd`, `.com`, `.scr`,
   `.ps1`, `.psm1`, `.psd1`, `.bash`, `.sh`, `.bin`, `.elf`, `.jar`,
   `.war`, `.vbs`, `.wsf`, `.hta`, `.cpl`, `.msc`, `.class`, `.so`,
   `.dylib`. **HTTP only.**

## HTTPS caveat (the honest one)

When a client speaks HTTPS through Squid, it issues a `CONNECT
host:443` and then opens an opaque TLS tunnel. Squid sees only the
hostname; it cannot inspect the URL path or response body. So:

- `urlpath_regex` for `*.exe` works on **plain HTTP** (rare today —
  most CDNs are HTTPS-only).
- The same path filter does **nothing** on HTTPS.

The only way to fix that is **SSL Bump** — Squid acts as a MITM,
terminates the client TLS, opens its own outbound TLS, and inspects
plaintext between the two. We **deliberately do not enable SSL Bump**:

- Requires installing a Squid CA cert into every sandbox UID's trust
  store (system store, plus Node's `NODE_EXTRA_CA_CERTS`, plus any
  language-specific stores).
- Breaks **HSTS** sites by design — clients with hardcoded HSTS pins
  (browsers, some npm registries, some GitHub paths) will refuse the
  bumped cert.
- Operationally heavy: cert rotation, CRL/OCSP, and a Squid that
  terminates TLS becomes a juicy target if compromised.

## Defense-in-depth: Path C sandbox

The realistic threat model leans on **sandbox isolation**, not proxy
filtering. Even if the AI downloads `https://evil.com/payload.bin`
over HTTPS:

1. The sandbox UID (10001..10100) only has shell `/usr/sbin/nologin`.
2. The nft skuid egress jail (Phase 10 of `setup-server-v3.sh`) blocks
   all outbound from the sandbox UID except loopback, DNS, and
   tcp/3128 (Squid). No reverse shells.
3. The dovault.spawn supervisor only ever execs `node` running vite —
   `chmod +x payload.bin && ./payload.bin` is not in the spawn graph.
4. The sandbox home is on a noexec-mountable path (servertodo/13) and
   the UID has no `sudo`, no `su`, no setuid binaries reachable.

So a downloaded binary has nowhere to run. It's bytes on disk, then
GC'd when the sandbox is recycled.

See `servertodo/13-sandbox-path-c.md` for the full Path C model.

## How to revert (future toggle, NOT yet implemented)

If a future incident requires switching back to strict whitelist mode
in a hurry, the intended interface is an env var read by
`setup-server-v3.sh`:

```bash
DOABLE_EGRESS_STRICT=1 ./setup-v3/setup-server-v3.sh
```

When set, Phase 6 would emit the old `http_access allow allowed_dst /
http_access deny all` block instead of the new policy. **This toggle
is documented but not yet implemented** — for now, reverting means a
manual git revert of the Phase 6 heredoc.

## Threat model

| Actor / scenario | Blocked? | By what |
| --- | --- | --- |
| AI fetches `dribbble.com` for design inspiration | **allowed** | default `http_access allow all` |
| AI fetches `169.254.169.254` (cloud metadata) | **blocked** | `acl link_local dst 169.254.0.0/16` |
| AI fetches `http://10.0.0.5/admin` (LAN scan) | **blocked** | `acl rfc1918` |
| AI fetches `http://127.0.0.1:5432` (host Postgres) | **blocked** | `acl loopback_dst dst 127.0.0.0/8` |
| AI fetches `http://example.com/payload.exe` (HTTP) | **blocked** | `acl blocked_exec_exts urlpath_regex` |
| AI fetches `https://example.com/payload.exe` (HTTPS) | **NOT blocked at proxy** | sandbox UID can't exec it (Path C) |
| AI fetches `https://api.openai.com/v1/...` (HTTPS) | **allowed** | `trusted_dst` |
| Compromised sandbox UID tries reverse shell to `1.2.3.4:9999` | **blocked** | nft skuid jail (Phase 10) — no outbound except 3128/DNS/loopback |
| Compromised sandbox UID tries DNS exfil | partially mitigated | systemd-resolved, no arbitrary nameserver — but DNS-over-Squid is not enforced |

## How to verify (post-deploy)

From a sandbox UID on the host (e.g., `setpriv --reuid=10001 --regid=10001 --init-groups bash`):

```bash
# 1. Public site over HTTPS — should succeed.
curl -x http://127.0.0.1:3128 -I https://example.com/
# expect: HTTP/1.1 200 (or whatever example.com returns)

# 2. HTTP exec URL — should 403.
curl -x http://127.0.0.1:3128 -I http://example.com/installer.exe
# expect: HTTP/1.1 403 Forbidden  (Squid TCP_DENIED)

# 3. RFC1918 — should 403.
curl -x http://127.0.0.1:3128 -I http://10.0.0.1/
# expect: HTTP/1.1 403 Forbidden

# 4. Cloud metadata — should 403.
curl -x http://127.0.0.1:3128 -I http://169.254.169.254/latest/meta-data/
# expect: HTTP/1.1 403 Forbidden

# 5. Trusted host — should succeed.
curl -x http://127.0.0.1:3128 -I https://registry.npmjs.org/
# expect: HTTP/1.1 200
```

Watch `/var/log/squid/access.log` for `TCP_DENIED/403` entries while
running the negative tests.

## Files changed

- `setup-v3/setup-server-v3.sh` — Phase 6 squid.conf heredoc rewritten.
- `servertodo/15-egress-policy-shift.md` — this document.

Out of scope (intentionally untouched):

- nft skuid jail (Phase 10) — still applies; sandbox UIDs can only
  egress via Squid + DNS.
- SSL Bump — explicitly NOT introduced.
- `servertodo/04`, `09`, `10`, `11`, `12`, `13`, `14` — unchanged.
