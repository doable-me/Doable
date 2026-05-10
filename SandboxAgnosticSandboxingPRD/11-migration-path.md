# 11 — Migration Path

How to get from today's "AI bash reads `/proc/cpuinfo` directly" to
the architecture in chapter 06, without breaking the system in
between.

## Principles

1. **No big-bang.** Every phase ships independently, can be rolled
   back independently.
2. **Dual-write or shadow first.** New code runs alongside old code
   for one release before the old code is removed.
3. **Observability before enforcement.** Every new layer is shipped
   in audit-only mode first, then flipped to enforce after stable
   for ~7 days.
4. **One workload at a time.** AI-bash first (highest risk, smallest
   blast radius if the new path is wrong). Then install. Then build.
   Then preview (highest blast radius if broken).

## Phase 0 — foundation (one PR, no behavioral change)

**Goal:** land the abstraction without touching call-sites.

- Add `SandboxProfile` type + JSON schema + zod validator
  (`packages/dovault/src/profile.ts`).
- Extend `SandboxBackend` interface (`declaredLayers()` etc.).
- Refactor each existing backend (`direct`, `systemd`, `bubblewrap`,
  `psroot`, `sandbox-exec`, `apple-container`, `gvisor`, `win-heap`,
  `windows`) to the new interface. `buildSpawn` returns the same
  shape `wrapSpawn` did, plus `declaredLayers()`.
- Six composers in `packages/dovault/src/composers/` —
  initially no-ops; just the file scaffolds and tests.
- New audit table `audit_sandbox_spawn` (Migration 074).
- API startup probe + Vigil "Sandbox posture" card.

**Acceptance:** all existing tests pass. No call-sites changed.
Sandbox posture card shows the resolved backend at boot.

## Phase 1 — AI bash tool (the actual leak fix)

**Goal:** route the AI's `bash` calls through the orchestrator with
the `ai-bash` profile.

Steps:

1. Implement `services/api/src/sandbox/orchestrator.ts` (the
   `jailedSpawn` function).
2. Implement profile catalog at
   `services/api/src/sandbox/profiles/ai-bash.ts` (chapter 07).
3. Implement composers needed for the `ai-bash` profile:
   `proc-mask`, `etc-synth`, `seccomp-bpf`. Each loaded only when
   the resolved backend's `declaredLayers()` reports the layer as
   absent.
4. Register a Doable-owned `bash` tool with
   `overridesBuiltInTool: true` in
   `services/api/src/ai/providers/copilot-tool-loader.ts` (chapter
   13). Its handler calls `jailedSpawn(cmd, ctx, "ai-bash")`.
5. Keep the existing `onPreToolUse` deny-on-suspicious-cat regex
   as a defense-in-depth filter.
6. Ship to **dodev** (143.110.188.13) first; smoke test:
   - The 2026-05-09 leak prompt no longer leaks (see chapter 12).
   - Legitimate AI sessions still work (write files, list project
     files, etc.).
7. Audit-only mode for 3 days on dodev: log denials but don't
   enforce. Confirm no false-positives.
8. Flip to enforce, ship to **staging** and **zantaz**.

**Rollback:** flag `DOABLE_SANDBOX_AI_BASH=off` in env. The Doable
tool unregisters; SDK's built-in `bash` resumes.

## Phase 2 — install + build

**Goal:** route `install_package` and the publish build through the
orchestrator with the `install` / `build` profiles.

Steps:

1. Replace the raw `spawn(pm, args, ...)` in
   `services/api/src/ai/tools/install-package.ts:236-242` with
   `jailedSpawn(pm, args, ctx, "install")`.
2. Same in the duplicate impl at `copilot-tools.ts:222`.
3. Replace the legacy `vault.spawn` in `deploy/builder.ts:373-384`
   with `jailedSpawn(..., "build")`.
4. Implement the `nft-egress` composer so the install profile's
   "only npm registry" allowlist actually fires.
5. Audit-only on dodev for 3 days. Watch for false-positives —
   esp. installs that need a registry beyond npmjs (yarn registry,
   sentry source upload).
6. Flip to enforce, promote to staging, then zantaz.

**Rollback:** same env flag pattern, per-workload
(`DOABLE_SANDBOX_INSTALL=off`).

## Phase 3 — vite preview

**Goal:** route the long-running vite preview through the
orchestrator with the `vite-preview` profile.

This is the biggest behavioral change because vite has been
"effectively jailed" via the old `Vault.spawn` path for a long time.
The migration must preserve every legitimate behavior — HMR, file
watching, npm install during dev, etc.

Steps:

1. Map the existing `vite-jail.ts` SpawnOptions
   (`lockConfigs:false, blockChildProcess:false, blockOutboundNet:false`)
   into the `vite-preview` profile. The profile is more permissive
   than `ai-bash` on these axes but more restrictive on
   `network.deny` and `fs.masks`.
2. Ship behind a feature flag — `DOABLE_SANDBOX_VITE_PREVIEW=on`
   on dodev only.
3. Run for 7 days. Watch for HMR breakage, inotify limits, npm
   install timeouts, source-map fetch failures.
4. Tune the profile based on actuals.
5. Promote to staging when no regressions for 3 days.
6. Promote to zantaz when no regressions on staging for 7 days.

**Rollback:** flag flip; old path is dual-wired during this phase
specifically because preview is long-running and breaking it would
be very visible.

## Phase 4 — network egress (the real one)

**Goal:** replace today's `HTTP_PROXY=0.0.0.0:1` env poisoning with
per-net-ns nft + Squid audit.

Steps:

1. Land the `nft-egress` composer (was a no-op until now if profile
   didn't request egress-allowlist).
2. Configure dnsmasq on each host with a default-deny resolver +
   per-profile allowlist.
3. Add Squid as transparent audit proxy on `DOABLE_SQUID_AUDIT=1`.
4. Migrate profiles to `network.defaultAction: "deny"` with their
   allow lists (already shaped this way in chapter 07).
5. Audit-only on dodev for 7 days.
6. Enforce + promote.

**Rollback:** profile-level flag —
`network.defaultAction: "allow"` reverts to today's wide-open
behavior.

## Phase 5 — opt-in stronger backends

**Goal:** make gVisor / apple-container / firecracker actually
available to operators who opt in.

Steps:

1. Make `runsc` install part of `setup-server.sh` opt-in via
   `INSTALL_GVISOR=1`.
2. Implement profile-class-aware backend selection — `ai-bash`
   prefers gVisor when present; `vite-preview` stays on bwrap
   (gVisor's perf cost is bad for inotify storms).
3. Ship documentation for setting `DOABLE_SANDBOX_BACKEND=gvisor`
   (operator level) or per-workspace.

## Phase 6 — cleanup

**Goal:** remove the legacy code paths after dual-write proves
stable.

Steps:

1. Remove `Vault.spawn` and its callers (replace with
   `jailedSpawn`).
2. Remove the legacy SpawnOptions compatibility shim.
3. Remove the `HTTP_PROXY=0.0.0.0:1` env poisoning hack.
4. Delete the deprecated regex bash-deny block in
   `copilot-engine.ts:120-129` — once the Doable-owned `bash` tool
   has been the only path for a release cycle. (Keep the
   plan-mode gating; that's independent.)

## Risk register

| Risk | Mitigation |
|---|---|
| AI bash sandbox breaks a legitimate workflow we didn't anticipate | Audit-only mode + 3-day soak before enforce |
| nft-egress drops a legitimate hostname not in the allowlist | Per-workspace admin can add allow rules within 1 minute via doable CLI |
| Backend `available()` false-positive on prod | Boot probe + fail-closed in prod (`DOABLE_SANDBOX_FAIL_CLOSED=true`) |
| Migration 074 (audit table) collides with other migrations | Reserve the slot now; ship as part of Phase 0 |
| Performance regression for the AI shell tool | Profile setup is ~10-30 ms; AI calls are seconds. Acceptable. |
| Performance regression for vite preview | Phase 3 explicitly soaks on dodev for 7 days before promotion |
| Operator misconfigures sandbox_backend in workspace settings | `available()` returns `{ok: false}` → orchestrator falls back to auto-detect with a logged warning. |

## Sequence diagram (one phase, e.g. Phase 1)

```
Day  0: PR landed on main, dual-wire (old path still default), audit-only
Day  1: Vigil card shows actual layer matrix; flag DOABLE_SANDBOX_AI_BASH=audit on dodev
Day  1-3: Run recon test harness against dodev daily; check audit log for false-positives
Day  4: Flip dodev to enforce
Day  5-7: Watch audit log for new false-positives
Day  8: Flip staging to enforce
Day  9-14: Watch staging audit log
Day 15: Flip zantaz to enforce
Day 16-30: Watch zantaz audit log
Day 31: Mark phase 1 stable in PRD; begin Phase 2
```

Each subsequent phase follows the same shape. The full migration is
~3 calendar months end-to-end if no critical regressions show up,
which is the right tempo for security-sensitive infrastructure
change.

## Out-of-band remediation

Two things need to be done *outside* the phased plan because they
fix the current leak now, not after Phase 1 lands:

1. **Delete or restrict the projects that leaked.** Projects
   `ae6930ab-...` and `61f90528-...` (and any others with
   "system info dashboards") expose host data in their build
   bundle. They should be hidden from public view, possibly
   regenerated.
2. **Add the recon regex to the existing `onPreToolUse` hook** as a
   stopgap — deny `cat /proc/cpuinfo`, `cat /etc/passwd`,
   `curl ipinfo.io`, `ls /opt/doable`, etc. This is what we
   discussed earlier as option (a). User explicitly said skip (a) in
   favor of (b), so this is **not** the path. Phase 1 lands instead.

The audit + dovault rework is the durable fix. The phased plan
above lands it without breaking the system in flight.
