# Finding 01 — World-readable `.env`

**Severity:** CRIT

tl;dr — `/root/doable/.env` is mode 644 and readable by any UID on the host, including sandboxed Vite project UIDs (10001, 10016-10021); leaks DB creds, `JWT_SECRET`, and OAuth client secrets.

## Evidence

File metadata (audited 2026-05-07):

```
-rw-r--r-- 1 root root 3631 /root/doable/.env
```

Parent directory modes:

```
drwx--x--x 1 root root /root          (mode 711)
drwxr-xr-x 1 root root /root/doable   (mode 755)
```

`/root` is `711`, so non-root cannot list it — but `711` still allows traversal into a known path. Combined with `.env` being world-readable, any process that knows the absolute path can `open(2)` it.

Confirmed exploit as a sandboxed UID (matches the UID range that per-project Vite dev servers drop to):

```bash
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- cat /root/doable/.env
```

Output (truncated):

```
DATABASE_URL=postgres://doable:doable@localhost:5432/doable
JWT_SECRET=<redacted>
PROJECT_JWT_SECRET=<redacted or unset — falls back to JWT_SECRET>
GITHUB_CLIENT_SECRET=<redacted>
GOOGLE_CLIENT_SECRET=<redacted>
SUPABASE_SERVICE_ROLE_KEY=<redacted>
...
```

Negative control (sanity check that the sandbox UID is otherwise constrained):

```bash
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- cat /etc/shadow
# cat: /etc/shadow: Permission denied
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- cat /etc/ssh/ssh_host_ed25519_key
# cat: /etc/ssh/ssh_host_ed25519_key: Permission denied
```

So `setpriv` is correctly dropping privileges — the issue is purely `.env` mode bits.

Per-project Vite dev servers run under those UIDs (10001, 10016-10021) and project working directories are `chown`ed to those UIDs. Any AI-generated code executed inside a project's Vite — i.e., **untrusted code by design** — runs with full read access to `/root/doable/.env`.

## Impact

Once a sandboxed UID reads `.env`, the host trust model collapses:

- **DB takeover (loopback-bounded but lethal).** `DATABASE_URL=postgres://doable:doable@localhost:5432/doable` — Postgres listens on `127.0.0.1`, but the attacker's code already runs on `127.0.0.1`. Default `doable:doable` creds = full owner of the application schema. Read every user record, every project, every secret column, modify auth state, plant persistence.
- **JWT forgery.** `JWT_SECRET` mints arbitrary user-auth tokens. Combined with `secureIntegrationsPRD/07-security-findings.md` Finding #2, when `PROJECT_JWT_SECRET` is unset it falls back to `JWT_SECRET` — same key signs both user sessions and project tokens. Forge a token for any user, including platform admin. Finding #3 in the same doc confirms the cross-trust-domain reuse.
- **OAuth account takeover.** GitHub/Google/Supabase client secrets enable acting as Doable's OAuth client: redirect-URI manipulation, code-exchange replay against Doable callback to mint sessions, or — for Supabase service-role key — full bypass of RLS on managed tenant DBs.
- **Lateral movement.** Any third-party API key in `.env` (Cloudflare Tunnel token, deploy keys, Activepieces creds) is now attacker-controlled.
- **Exfil path is open** because of Finding 04 — no `skuid`-keyed egress rules. Sandboxed UID can `curl` the secrets out to any IP.

The sandbox primitive (UID drop) is doing its job; this finding is purely about a single chmod that nullifies it.

## Fix

Ordered by minimum disruption first.

### Option 1 — Immediate hardening (no restart, no user migration)

Verify no non-root process currently has `.env` open via a path that requires the world-read bit:

```bash
lsof /root/doable/.env
# Expect: only root-owned processes (api, web, ws). If true, dropping world-read is safe.
```

Then:

```bash
chmod 600 /root/doable/.env
stat -c '%a %U:%G %n' /root/doable/.env
# Expect: 600 root:root /root/doable/.env
```

Re-run the verification command (see below) to confirm sandbox UIDs are now denied. Services (still running as root, see Finding 02) keep working because root reads regardless of mode.

### Option 2 — After non-root migration (Finding 02)

Once `doable.service` runs as a dedicated `doable` system user:

```bash
chown doable:doable /root/doable/.env
chmod 600 /root/doable/.env
```

Combined with `/root/doable` being moved or chowned to `doable:doable`, root no longer sits in the read path at all.

### Option 3 — Move out of `/root` into a managed env dir

```bash
install -d -o doable -g doable -m 700 /etc/doable
install -o doable -g doable -m 600 /root/doable/.env /etc/doable/env
```

Update the systemd unit to use `EnvironmentFile=`:

```ini
[Service]
User=doable
Group=doable
EnvironmentFile=/etc/doable/env
```

This removes any reliance on app code reading `.env` from the project tree, and the file is no longer adjacent to user-writable project data.

### Option 4 — Strongest: no disk-resident secrets

Use systemd `LoadCredential=` (or `LoadCredentialEncrypted=`) so secrets are decrypted into a tmpfs scoped to the unit's invocation:

```ini
[Service]
LoadCredentialEncrypted=jwt:/etc/doable/jwt.cred
LoadCredentialEncrypted=db:/etc/doable/db.cred
```

App reads from `$CREDENTIALS_DIRECTORY/jwt` etc. No file the sandbox can `open(2)` exists outside the service's mount namespace. Pair with `ProtectSystem=strict`, `PrivateTmp=true`, `NoNewPrivileges=true`.

## Verification

After applying Option 1 (or any later option), repeat the exact exploit command. It must return `Permission denied`:

```bash
sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- cat /root/doable/.env
# Expected: cat: /root/doable/.env: Permission denied
```

Loop the test across every sandbox UID actually in use:

```bash
for uid in 10001 10016 10017 10018 10019 10020 10021; do
  echo -n "uid=$uid: "
  sudo setpriv --reuid=$uid --regid=$uid --clear-groups -- cat /root/doable/.env >/dev/null 2>&1 \
    && echo "FAIL (readable)" || echo "OK (denied)"
done
```

All rows must read `OK (denied)`. Also confirm services still start and authenticate:

```bash
systemctl restart doable        # only if Option 2/3/4 changed unit
systemctl status doable
journalctl -u doable -n 50 --no-pager
```

## References

- [02-services-as-root.md](02-services-as-root.md) — even with `.env` locked down, services running as root keep the secret blast radius wide; Option 2/3/4 here depend on that migration.
- [04-egress-jail.md](04-egress-jail.md) — without `skuid` egress rules, a process that reads `.env` can ship the contents anywhere; both findings together gate full exfil prevention.
- `secureIntegrationsPRD/07-security-findings.md` — Finding #2 (`PROJECT_JWT_SECRET` fallback to `JWT_SECRET`) and Finding #3 (`JWT_SECRET` reused across user-auth and project-token trust domains). Both turn an `.env` leak into immediate token forgery; rotate `JWT_SECRET` after any suspected exposure and split it per trust domain.
