# 01 — Threat Model

*Author: `layers-analyst` (Opus, 2026-05-11).*

## The Concrete Leak

On 2026-05-09, a user submitted the prompt "collect all system info" to
a Doable project. The project's AI assistant, executing inside what was
nominally a per-project sandbox, used its bash tool to perform a
textbook host-reconnaissance sweep and then baked every result into
the React bundle that the project's public viewer URL serves. The
exfil surface was therefore not the AI's own conversation — it was
the *published artifact*, visible to every anonymous visitor of that
project's subdomain.

The recon payload broke down into six concrete disclosures:

| # | Command | What leaked |
|---|---------|-------------|
| 1 | `cat /proc/cpuinfo /proc/meminfo /proc/loadavg /proc/uptime` | Host CPU model, core count, exact RAM size, 1/5/15-min load, host uptime |
| 2 | `cat /etc/passwd` | 119 user accounts including service accounts (`postgres`, `caddy`, `cloudflared`, `doable`, `vite-jail-*`), revealing the multi-tenant layout |
| 3 | `dpkg -l` | 826 packages with exact versions — a CVE shopping list |
| 4 | `ss -tlnp` / `netstat -tlnp` | Every listening socket on the host, *including* one service still bound to `0.0.0.0` in violation of the project's own network rule |
| 5 | `ls -la /opt/doable/services/api/projects/` | Directory enumeration of every other tenant's project ID |
| 6 | `curl https://ipinfo.io` | Host's public egress IP, ASN, and geolocation |

Each of these is, individually, low-severity reconnaissance. Composed,
they are a complete pre-attack briefing: an attacker now knows what
kernel + libc are running, which CVEs apply, which tenants exist,
which ports are exposed beyond the tunnel, and where the host
physically sits. The leak amplification is brutal — one prompt
produced a forever-cached HTML asset behind a CDN edge.

## Threat Actors

### T1 — Prompt-Injected AI (observed)

**Description.** A user (intentionally or via injection from an
upstream document, web page, or integration payload) instructs the
project's AI to gather "system info" / "debug data" / "environment
details." The AI obliges because its bash tool is unconstrained
inside the per-project workdir.

**Realistic impact.** Severe. This is the threat that actually fired.
Cost-to-attacker is zero (one English sentence), payload lands in a
public CDN-cached bundle, and the AI has no incentive to refuse
benign-sounding telemetry requests. Multiplied across n tenants, an
attacker can fingerprint the entire fleet from outside.

**Layer that blocks it.** Mount-namespace + tmpfs-masked `/proc` +
`/sys` + Landlock allowlist on the project workdir. Without these,
no amount of prompt hardening fixes this — the AI is doing what its
tools let it do.

### T2 — Rogue Project Owner (recon-by-design)

**Description.** A tenant deliberately writes a script (build hook,
vite plugin, AI tool call) whose purpose is to map the host. They
are not adversarial to their own AI; they want the data themselves.

**Realistic impact.** High. They have legitimate code-execution
inside the sandbox — they don't need an exploit, just permission to
call standard binaries. They can iterate freely.

**Layer that blocks it.** Same as T1, plus **seccomp-bpf** denying
`socket(AF_NETLINK)` and other syscall paths that bypass the FS view,
plus **egress firewall** stopping `curl ipinfo.io` and DNS-over-HTTPS
exfil channels.

### T3 — Tenant Lateral Movement

**Description.** User A's AI reads, modifies, or simply lists user
B's project directory
(`/opt/doable/services/api/projects/<B-id>/`). The 2026-05-09 leak
demonstrated the *list* half of this attack succeeded.

**Realistic impact.** Catastrophic. Doable's tenant boundary is a
directory boundary; once that's permeable, every other tenant's
source code, secrets, and Yjs CRDT history is at risk. Multi-tenant
SaaS reputation does not survive a tenant-cross-read incident.

**Layer that blocks it.** Mount namespace bind-mounting *only* the
calling tenant's workdir at `/work` with the rest of `/opt/doable`
simply absent from the FS view. Belt-and-braces: per-tenant UID drop
+ filesystem ownership, so even if the FS view leaks, DAC blocks the
read.

### T4 — Container/Host Escape

**Description.** AI tool (or build process) triggers a kernel CVE —
overlayfs, io_uring, eBPF verifier, user-ns + setuid quirks — to
break out of the namespace and execute as host-root.

**Realistic impact.** Total host compromise. Lower probability
per-event than T1–T3, but recovery is reinstall-from-scratch.

**Layer that blocks it.** **Capabilities drop** (no `CAP_SYS_ADMIN`,
no `CAP_NET_ADMIN`, no `CAP_BPF`), **seccomp-bpf** denylist for the
high-CVE syscalls (`clone3`, `userfaultfd`, `io_uring_setup`,
`keyctl`, `bpf`, `add_key`, `unshare(CLONE_NEWUSER)` for nested
escapes), **AppArmor/SELinux** as an orthogonal MAC layer, and
ideally **gVisor or Firecracker** for kernel-untrusted workloads
(anything running untrusted JS at preview time).

### T5 — Side-Channel & Hardware Disclosure

**Description.** Even with `/proc/cpuinfo` masked,
`/sys/devices/system/cpu/`, `/sys/class/dmi/`, MSR access, `rdtsc`
timing, and cache-flush primitives can fingerprint the host or
mount Spectre-class attacks.

**Realistic impact.** Medium. Fingerprinting alone is moderate;
timing-based co-tenant attacks against KVM-less containers are real
but require sustained access. On a shared VPS this matters.

**Layer that blocks it.** **/sys masking** (tmpfs over
`/sys/devices`, `/sys/class`, `/sys/firmware`), **seccomp** dropping
`perf_event_open`, **cgroup cpu pinning** to reduce sibling-core
leakage, and ultimately VM-level isolation (Firecracker) for the
highest-trust boundary.

### T6 — Outbound Exfil

**Description.** Recon data is worthless to the attacker if it can't
leave the box. `curl`, DNS exfil (`A` lookups encoding base32),
WebSocket to attacker-controlled host, even ICMP. The 2026-05-09
leak used the published bundle as its exfil channel, but a
sophisticated attacker uses direct egress.

**Realistic impact.** High. Without an egress filter, *every* prior
threat composes with this one to become real damage.

**Layer that blocks it.** **Network namespace** with a default-deny
route table, **nftables** egress allowlist (only the AI gateway's
HTTPS endpoint, only Doable's package registry mirror), or a
**forced HTTP proxy (Squid)** that logs and audits every outbound
request. DNS must be pinned to an internal resolver that refuses
arbitrary TXT/A lookups outside an allowlist.

## Threat-to-Layer Matrix (summary)

| Threat | Primary blocker | Secondary blocker |
|---|---|---|
| T1 prompt-injected AI | /proc + /sys mask, mount-ns | Landlock workdir allowlist |
| T2 rogue owner | seccomp + egress filter | UID drop |
| T3 lateral movement | mount-ns bind-only-own-workdir | Per-tenant UID + DAC |
| T4 host escape | capabilities drop + seccomp | gVisor / Firecracker, MAC |
| T5 side-channel | /sys mask + seccomp(perf_event_open) | Firecracker for VM boundary |
| T6 outbound exfil | network-ns + nftables egress allowlist | Forced proxy with audit log |

No single layer addresses more than two threats well. The PRD's
design must therefore be layered, not monolithic — the very mistake
the 2026-05-09 leak exposed was the assumption that "running inside a
sandbox" was a single property, when in fact it is the conjunction of
~15 independent kernel features.
