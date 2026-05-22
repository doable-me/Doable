# Security Policy

This file covers vulnerability reporting and supported versions. For
the **operational security model** (sandbox layers, per-project UID
isolation, network firewalling, runtime hardening, env knobs, etc.),
see [`deployment/README.md`](deployment/README.md) — specifically:

- **§7 Architecture summary → Security model** — the 3-layer sandbox
  (build / dev preview / production runtime)
- **§7 Dev sandbox UID pool (auto-scaling)** — how every dev preview
  AND build runs as a low-privilege Linux UID, with `nft` egress
  firewalling
- **§7 Optional seccomp filter** — `DOABLE_DEV_SECCOMP=on` adds a
  syscall deny-list on top of UID drop
- **§11 Secure Docker Install** — same security primitives provision
  inside the secure Docker image
- **§13 Operator levers — single-page cheatsheet** — every env var
  with default + when to flip + verification commands

The summary: **sandbox is on by default**. AI-generated user code
runs as a per-project Linux UID with kernel-level network egress
blocked except via Squid (npm/PyPI allow-list). Same posture on
bare-metal install (`deployment/server-setup.sh`) and `deployment/docker/docker-compose.secure.yml`.
Both are idempotent — re-running them only fills in what's missing.

## Supported Versions

Only the latest code on the default branch is supported with security fixes.

## Reporting a Vulnerability

Do not open a public issue for security reports.

Report vulnerabilities through one of these private channels:

- GitHub Private Vulnerability Reporting, if enabled on the repository
- Email: security@doable.me

Include the following when possible:

- A short description of the issue and affected area
- Reproduction steps or a proof of concept
- Expected impact
- Any suggested mitigation or fix

## Response Expectations

- Initial acknowledgement within 48 hours
- Triage and severity assessment within 7 days
- Coordinated disclosure after a fix or mitigation is available

## Scope

Security reports are especially helpful for:

- Authentication, authorization, and session handling
- Secrets handling and encryption
- Multi-tenant isolation
- File access and path traversal
- WebSocket, collaboration, and sync behavior
- Supply chain and dependency issues

Please avoid automated scanning noise without a reproducible finding.