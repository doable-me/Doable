# 10 — Config Management

How an operator picks a backend, tunes a profile, and audits the
result. This chapter specifies the configuration surface — env
vars, DB tables, doable-CLI commands — and how they layer.

## The configuration layers

From lowest precedence (defaults) to highest (operator overrides):

1. **Profile catalog defaults** (`services/api/src/sandbox/profiles/*.ts`)
   — checked-in code, the floor every workspace gets.
2. **Workspace DB settings** (`workspace_sandbox_settings` table) —
   admin-editable per workspace.
3. **Workspace DB rules** (`workspace_sandbox_rules` table) —
   admin-editable per workspace.
4. **Process env** (`DOABLE_SANDBOX_*` vars) — operator escape hatch.
5. **Boot flags** (`--sandbox-backend=bwrap`) — CI / dry-run only.

Higher precedence layers can **tighten** policy (reduce network
allow, reduce memory cap, narrow profile selection) but cannot
loosen the floor. The orchestrator merges these at the start of
each spawn.

## Env vars (process-wide)

| Var | Purpose | Default |
|---|---|---|
| `DOABLE_SANDBOX_BACKEND` | Pin backend (e.g. `bwrap`, `systemd`, `psroot`, `none`) | unset → auto-detect |
| `DOABLE_SANDBOX_FAIL_CLOSED` | Refuse to spawn if the chosen backend's `available()` fails | `true` in prod, `false` in dev |
| `DOABLE_SANDBOX_AUDIT_RETENTION_DAYS` | How long to keep audit_sandbox_spawn rows | 90 |
| `DOABLE_SANDBOX_HARDENING` | `off | dev | staging | prod` — gates fail-closed and a few default tightenings | inherited from `NODE_ENV` |
| `DOABLE_SANDBOX_DRY_RUN` | Build profile + spawn shape but don't actually exec; log what would have happened. Used in CI to assert spawn shapes. | `false` |
| `DOABLE_ALLOW_NO_MAC` | Allow boot when neither AppArmor nor SELinux is present | `0` |
| `DOABLE_SANDBOX_SQUID_AUDIT` | Route outbound HTTPS through Squid for audit | `0` |

## DB schema (extends migration 073)

`workspace_sandbox_settings` adds two columns:

```sql
ALTER TABLE workspace_sandbox_settings
  ADD COLUMN sandbox_backend text NULL,            -- "bwrap" | "systemd" | "psroot" | "sandbox-exec" | "none" | NULL=auto
  ADD COLUMN allowed_profile_keys text[] NOT NULL DEFAULT ARRAY['ai-bash','vite-preview','install','build'];
```

`workspace_sandbox_rules` (existing) stays as-is. Rules join the
profile's network.allow / network.deny additively.

A new table for audit:

```sql
CREATE TABLE audit_sandbox_spawn (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id       uuid,
  user_id          uuid,
  session_id       text,
  profile_key      text NOT NULL,                 -- e.g. "ai-bash"
  backend_id       text NOT NULL,                 -- e.g. "bwrap"
  declared_layers  jsonb NOT NULL,
  composers        text[] NOT NULL,               -- e.g. ['proc-mask','seccomp-bpf','nft-egress']
  command          text NOT NULL,
  argv             jsonb NOT NULL,
  exit_code        integer,
  signal           text,
  duration_ms      integer,
  oom_killed       boolean NOT NULL DEFAULT false,
  timed_out        boolean NOT NULL DEFAULT false,
  network_denied   text[],                        -- hostnames blocked
  started_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_asp_workspace_started ON audit_sandbox_spawn(workspace_id, started_at DESC);
```

Retention is driven by `DOABLE_SANDBOX_AUDIT_RETENTION_DAYS`; a cron
trims old rows.

RLS on both tables follows the workspace-member pattern from
migration 071+073 (members read, admins mutate). The audit table is
read-only from the API; only the orchestrator (running as the API
process) inserts.

## doable-CLI integration

The doable admin TUI lives at
`C:\Users\gj\Documents\workspace\doablechore\tools\admin-cli` (per
memory `reference_doable_admin_tui.md`). It already speaks the
Doable HTTP API. Adding the sandbox surface:

```
doable admin --workspace <ws>
  ├─ workspace
  │   ├─ ai-providers
  │   └─ sandbox                  ← NEW
  │       ├─ settings             — view + edit defaults
  │       ├─ backend              — pin backend, see "available?"
  │       ├─ rules                — list / add / edit / delete
  │       │   ├─ tool             — install:* / bash:* / generic tool patterns
  │       │   └─ network          — host allow/deny lists
  │       ├─ profiles             — show profile X resolved for this workspace
  │       └─ audit                — recent spawn events, denials, OOM, timeouts
```

The CLI calls the existing `/workspaces/:wsId/sandbox/{settings,rules}`
endpoints and two new ones:

- `GET /workspaces/:wsId/sandbox/profiles/:key` — returns the
  effective profile after defaults + workspace overrides.
- `GET /workspaces/:wsId/sandbox/audit?since=...&limit=...` — paged
  audit log read.

## Profile selection per workspace

Workspace admin can ban specific profiles:

```yaml
# What doable CLI writes via PUT /workspaces/:wsId/sandbox/settings
allowed_profile_keys: ['install', 'build', 'vite-preview']
# Notice: no 'ai-bash' — this workspace has chosen to ban AI shell
```

When a caller requests `jailedSpawn(..., "ai-bash")` against this
workspace, the orchestrator refuses with:

```
{ resultType: "denied",
  reason: "Workspace policy prohibits the 'ai-bash' profile." }
```

This is the right way to "turn off the AI shell tool for this
workspace" — at the orchestrator layer, not by editing the SDK.

## Wildcards (the user-requested ergonomics)

Per the kickoff prompt — *"allow everything except some, or deny
everything except some, both for tools and network"* — the rule
matcher (`sandbox/rule-matcher.ts` from migration 073) already
handles this:

- `defaultAction: "allow"` + a `deny`-action rule for `install:*` = allow everything except installs
- `defaultAction: "deny"` + an `allow`-action rule for `install:openai` = deny everything except installing openai
- Same wildcards work for `bash:`, `network:`, `read:` prefixes
  (extends naturally to new tool classes).

`*` (match all) and `?` (match one char) are supported. More
complex patterns can be added (e.g., `**` like globstar) if real
admin needs emerge.

## Observability

What boot-time logs look like (proposed):

```
[sandbox] backend=systemd (resolved from auto-detect)
[sandbox] backend probe: systemd-run --version OK
[sandbox] backend probe: cgroup-v2 delegation OK
[sandbox] declared layers: fs:full pidNs=false netNs=via-cgroup-v2 seccomp=false procMask=false
[sandbox] composers ON for missing layers: proc-mask etc-synth seccomp-bpf nft-egress landlock
[sandbox] hardening=prod fail-closed=true audit-retention=90d squid-audit=off
[sandbox] AppArmor: enabled, profile=doable-ai-bash loaded
[sandbox] Landlock: ABI v3 available
[sandbox] READY
```

In production, the API refuses to start if any of these probes
return `{ok: false}` unless an env override is present. Vigil dashboard
surfaces the resolved matrix as the "Sandbox posture" card.

## Vigil dashboard widgets

- **Sandbox posture** — current backend + composers + hardening
  level, refreshed at API boot.
- **Spawn denials (24h)** — count of `resultType: "denied"` audit
  rows by profile / workspace.
- **OOM kills (7d)** — `oom_killed=true` rows by profile, to
  catch profiles whose memBytes is too low.
- **Timeouts (7d)** — `timed_out=true` rows by profile.
- **Network denies (24h)** — top denied hostnames per workspace.
- **Backend unavailability events** — count of times boot probe
  flipped.

Each card is a thin SQL query against `audit_sandbox_spawn`. None
of it needs a separate metrics pipeline.

## Workspace policy export/import

For operators who manage many workspaces, the doable-CLI can dump
and re-apply policy:

```
doable admin --workspace foo sandbox export > foo-sandbox.yaml
doable admin --workspace bar sandbox import < foo-sandbox.yaml
```

The YAML is a serialization of `workspace_sandbox_settings` +
`workspace_sandbox_rules`. Import does a transactional upsert so
half-applied imports don't leave a workspace in an inconsistent
state.

## Hard floors operators cannot disable

Even with maximum privilege, certain rules cannot be relaxed by
workspace admins or even platform admins (these live in code, not
config):

- `network.deny` includes `169.254.169.254` and known cloud-metadata
  hosts.
- seccomp deny list always includes the high-CVE syscalls (chapter
  08).
- `fs.masks` always includes `/opt/doable`, `/var/lib/dpkg`,
  `/sys/firmware`, `/dev/kmsg`.
- The synthetic `/etc/passwd` cannot be replaced; only the
  in-jail uid mapping is workspace-configurable.

These are floor rules. The motivation: even a malicious platform
admin (or one whose credentials are stolen) should not be able to
turn off tenant isolation.
