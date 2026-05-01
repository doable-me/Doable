# Sandboxing Comparison: Doable vs Open Design vs Open Cowork

**Date:** 2026-04-30
**Method:** Three parallel Opus sub-agents read each codebase end-to-end (server, client, IPC, preview surfaces), then this report synthesizes their findings.

---

## TL;DR

| Dimension | **Doable** | **Open Design** | **Open Cowork** |
|---|---|---|---|
| Shape | Web SaaS (Cloudflare Tunnel → 127.0.0.1) | Local-first daemon + web UI (+ optional Electron) | Electron desktop app |
| Server-side code-exec sandbox | **nsjail / unshare / systemd-cgroups / Win32 Job Objects** (pluggable, auto-detected) | **None — explicitly delegated to the underlying CLI** (`claude --bypassPermissions`, `codex --full-auto`, etc.) | None server-side; **WSL2 / Lima VM** locally for shell exec, host fallback if missing |
| Per-project runtime jail | **dovault**: Node Permission Model + systemd cgroups + `IPAddressDeny=any` + ConfigGuard, around Vite | n/a (artifacts are static HTML) | n/a (artifacts are PPTX/DOCX/PDF files) |
| Permission policy gate | `createPolicySandbox` allow/deny commands, traversal regexes, rate limits, URL allowlist | None — relies on agent CLI's own gate, then bypasses it | `path-guard` denylists + dangerous-cmd regex |
| Live preview iframe | `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-fullscreen"` | `sandbox="allow-scripts"` (null origin, **stricter**) | No iframes — generated artifacts open in OS viewers |
| MCP-App / sub-app iframe | `sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"` (null origin) | n/a | n/a |
| CSP | Only on **published** *.doable.me sites (Caddy); none on the app itself | None anywhere | **Yes**, in `index.html` meta (`'self'` + `wasm-unsafe-eval`) |
| Electron sandbox (where applicable) | n/a | `contextIsolation:true, nodeIntegration:false, sandbox:true` | `contextIsolation:true, nodeIntegration:false, sandbox:true` + preload IPC allowlist (16 events) |
| Plugin / skill isolation | None for MCP servers (host stdio children); skill files are static prompt material run by the docore-jailed agent | None — skills are file-based prompt material, not executed | None — plugins/skills are descriptors; execution funnels through VM/native exec |

**Bottom line:**

- **Doable has the strongest server-side sandbox of the three** by a wide margin (kernel-level isolation + a per-project Vite jail + an LLM-permission policy engine).
- **Doable's client-side sandbox is comparable to Open Cowork's and weaker than Open Design's** — Open Design uses a stricter null-origin (`sandbox="allow-scripts"`) iframe for the artifact preview; Doable's main editor preview keeps `allow-same-origin`.
- **Open Cowork has the cleanest Electron renderer hardening** (sandbox + contextIsolation + CSP meta + IPC channel allowlist + no `<webview>` / no `<iframe>`), but its in-app plugin/skill execution has no JS-level sandbox — it leans on WSL2/Lima for OS-level isolation, with a brittle `native` fallback.
- **Open Design intentionally has no server-side sandbox at all** — its design philosophy is "the agent CLI already has one, we won't reinvent it" (`docs/architecture.md:322`). It compensates with a strict null-origin iframe for artifacts and a textbook-correct Electron shell, plus an SSRF block on the BYOK proxy.

---

## 1. What each project actually is

| | **Doable** | **Open Design** | **Open Cowork** |
|---|---|---|---|
| Form factor | Multi-tenant web SaaS (you VPS deployment, Cloudflare Tunnel) | Local-first daemon + Next.js UI + optional Electron | Electron desktop app for Win/macOS |
| What it executes | AI-generated React/Vite projects per user, MCP-App UI cards, MCP servers | Whichever code-agent CLI the user has on `PATH`; output is HTML `<artifact>` chunks | Local Claude/OpenAI/Gemini/etc. agents producing PPTX/DOCX/XLSX/PDF artifacts |
| Where untrusted code runs | On a shared server | On the user's machine (their UID) | On the user's machine (in WSL2/Lima VM if present) |
| Threat model that matters | Tenant ↔ tenant escape; AI ↔ host escape; preview ↔ host page | None claimed for server side; iframe ↔ host page; SSRF via BYOK proxy | Renderer ↔ host; agent ↔ host filesystem outside workspace |

Because Doable runs untrusted AI code on a *shared, server-hosted* machine while the other two run it on the *user's own* machine, Doable carries the heaviest sandboxing burden and the highest blast-radius if it fails.

---

## 2. Server-side execution sandbox

### Doable — kernel-level, pluggable, two-stack

Two independent sandboxes:

**A. `packages/docore` — sandboxes the Copilot CLI agent**

Pluggable backend registry, auto-detected by priority:

| Backend | Priority | Mechanism |
|---|---|---|
| `nsjail` | 100 | Linux namespaces + cgroups + seccomp; user 65534, RO mounts of `/usr`,`/lib`,`/bin`, mem/CPU/PID/fsize caps |
| `unshare` | 90 | `systemd-run --scope` + `unshare --pid --mount --ipc --uts --fork --kill-child` |
| `systemd` | 80 | `systemd-run` cgroup limits only |
| `jobobject` | 60 | Win32 Job Objects via inline P/Invoke C# (Windows) |
| `none` (DirectBackend) | 0 | Direct `spawn`, dev fallback |

Plus an in-process **policy engine** (`packages/docore/src/sandbox.ts: createPolicySandbox`) that runs *before* every Copilot SDK permission (`write`, `read`, `shell`, `url`, `mcp`, `custom-tool`) — allowlist/denylist commands, traversal regexes, rate limits, URL allowlist, per-user overrides. Default denylist (`packages/docore/src/policy/defaults.ts`) blocks `docker`, `kubectl`, `sudo`, etc.

**B. `packages/dovault` — sandboxes the per-project Vite dev server**

Three layers stacked on every project's runtime:

1. **ConfigGuard** — overwrites `vite.config.ts`, `postcss.config.js`, `tailwind.config.ts` with safe templates and deletes shadow variants.
2. **ProcessJail** — Node.js Permission Model: `--experimental-permission --allow-fs-read=<jail> --allow-fs-write=<jail>`, resolves npm bin scripts to apply flags.
3. **ResourceLimiter** — `systemd-run --scope -p MemoryMax -p CPUQuota -p TasksMax -p IPAddressDeny=any -p IPAddressAllow=localhost`, plus `ProtectSystem=strict ProtectHome=true PrivateTmp=true NoNewPrivileges=true`.

**Notable absences:** No Docker-based sandbox (despite a stale CLAUDE.md hint). No Firecracker, gVisor, Bubblewrap, isolated-vm/vm2. macOS has no real isolation — falls through to `DirectBackend`. MCP servers themselves are not sandboxed (host stdio children).

### Open Design — explicitly none

`docs/architecture.md:322` states the policy verbatim: *"We inherit the agent's permission model on purpose — we don't invent our own sandbox, because Claude Code's `--permission-mode` / Codex's sandboxing / Cursor's containment already exist and are maintained."*

What the daemon does in practice (`apps/daemon/src/agents.ts`):

- Plain `child_process.spawn` of the user's CLI binary, `cwd` = `.od/projects/<id>/`. No nsjail, Docker, vm2, isolated-vm, Worker, seccomp.
- Maximum-permission flags passed deliberately: `claude --permission-mode bypassPermissions`, `codex --full-auto`, `gemini --yolo`, `opencode --dangerously-skip-permissions`, `qwen --yolo`, `copilot --allow-all-tools`. **The product actively disables the agent's own guards.**
- HTTP-layer path-traversal guard (`projects.ts: resolveSafe/validateProjectPath/sanitizePath`) — but only for the API surface, not for the spawned agent.
- One real defense: BYOK-proxy SSRF block (`server.ts:1970-1988`) rejects loopback, link-local, RFC1918, non-http(s). **No DNS rebinding defense** (string match on hostname only).
- Daemon binds to `127.0.0.1` only — the principal trust assumption.

### Open Cowork — VM-level, OS-delegated

No traditional backend. Code execution funnels through `src/main/sandbox/`:

- `wsl-bridge.ts` → `wsl -d <distro> -- bash -c …` → in-VM `wsl-agent/index.ts` runs `/bin/bash` and `claude`.
- `lima-bridge.ts` → `limactl shell …` → `lima-agent/index.ts` (macOS).
- `native-executor.ts` — fallback on host with only path-prefix confinement (`isPathWithinRoot`) and a regex denylist (`path-guard.ts`).
- Skills/plugins are descriptors; their execution still runs through the WSL/Lima/native path.

**Honest gap:** the `native` fallback is brittle — if WSL2/Lima aren't installed, the AI agent runs against the host with only a denylist. The README acknowledges this.

---

## 3. Client-side sandbox

### Doable

| Surface | iframe attribute | Origin |
|---|---|---|
| Live editor preview (`apps/web/src/modules/editor/preview/preview-panel.tsx:285`) | `allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-fullscreen` | Same-origin (preview shares origin via API proxy) |
| MCP-App UI cards (`apps/web/src/modules/editor/chat/mcp-ui-resource.tsx:372`) | `allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox` (no `allow-same-origin`) | **Null origin** — JSON-RPC postMessage to host |
| Email preview (`apps/web/src/app/(dashboard)/admin/email-panel.tsx:749`) | `sandbox=""` (max lockdown) | Null origin |
| Visual-edit bridge | `postMessage` with `visual-edit:` prefix filter; inline injected script |
| Storage isolation | `services/api/src/routes/preview-proxy/injected-scripts.ts:40-50` namespaces `localStorage` keys `__<projectId>__` |
| CSP / Trusted Types / Web Workers | **None on the app itself** (`apps/web/next.config.ts` has zero security headers). CSP exists only on **published** *.doable.me sites via Caddy. |

### Open Design — strictest of the three for artifacts

| Surface | iframe attribute | Origin |
|---|---|---|
| Artifact preview (`apps/web/src/components/FileViewer.tsx:911`) | `sandbox="allow-scripts"` | **Null origin** — cannot read host cookies/`localStorage`/parent DOM |
| Present mode (`FileViewer.tsx:932`) | `sandbox="allow-scripts"` | Null origin |
| Design-system preview (`PreviewModal.tsx:278`) | `sandbox="allow-scripts allow-same-origin"` | Repo-vendored content only |
| postMessage bridge | `od:slide` / `od:slide-state` typed envelopes; `targetOrigin: '*'` (acceptable for null-origin) |
| Markdown chat | `renderMarkdownToSafeHtml` escapes/whitelists protocols before `dangerouslySetInnerHTML` |
| CSP / `frame-ancestors` / `X-Frame-Options` | **None** anywhere — daemon and Next.js `layout.tsx`/`vercel.json` set zero headers |
| Electron | `contextIsolation:true, nodeIntegration:false, sandbox:true` (`apps/desktop/src/main/runtime.ts:128`) |

### Open Cowork — no untrusted iframe surface at all

Grep for `<iframe`, `webview`, `sandbox=` across `src/renderer` returns **zero matches**. Generated artifacts are produced as files on disk and surfaced via `shell.showItemInFolder`. The renderer is a pure React app, no embedded untrusted content.

| Mechanism | Detail |
|---|---|
| Electron BrowserWindow (`src/main/index.ts:410-415`) | `nodeIntegration:false, contextIsolation:true, sandbox:true`, custom preload |
| CSP (`index.html:5`) | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ws: wss: https:` |
| Navigation hardening (`src/main/index.ts:481-505`) | `setWindowOpenHandler`/`will-navigate` deny external; route to `shell.openExternal` |
| `<webview>` | implicitly disabled (no `webviewTag: true`) |
| Preload (`src/preload/index.ts:41-110`) | `contextBridge.exposeInMainWorld` + `ALLOWED_CLIENT_EVENTS` allowlist (16 channels); blocks unauthorized events |
| `openExternal` sanitization | strips `attach`/`attachment` from `mailto:`; main-side rejects non-http(s)/mailto |

---

## 4. Trust-boundary diagrams (compact)

**Doable**
```
LLM/user → API tool call → project-files.resolveFilePath/validatePath
        → writeProjectFile → disk
        → Vite jailed by dovault (Permission Model + cgroups + IPAddressDeny)
        → preview-proxy (UUID-only projectId gate)
        → iframe sandbox in browser
        ↑ permission gate before tools: createPolicySandbox
```

**Open Design**
```
Browser → daemon (127.0.0.1) → validateProjectPath
        → spawn(<user CLI> --bypassPermissions) UNSANDBOXED
        → writes files in .od/projects/<id>/
        → static HTML served at /projects/<id>/raw/
        → null-origin iframe (sandbox="allow-scripts")
BYOK:   browser → /api/proxy/stream → SSRF block (no DNS rebind defense) → upstream
```

**Open Cowork**
```
Renderer → contextBridge (16-channel allowlist) → ipcMain handler
        → sandbox-adapter: WSL bridge / Lima bridge / native (fallback)
        → in-VM agent runs claude / bash
        → produces files; shell.showItemInFolder
```

---

## 5. Do we (Doable) need client-side sandboxing?

**Yes — and we already have some, but it's the weakest of our defenses.** The judgment call is whether to *strengthen* it. Three concrete claims:

### 5.1 The main editor preview is currently the loosest surface

`preview-panel.tsx:285` grants `allow-same-origin`. Because the preview is served via the same-origin preview proxy, granting this lets the iframe's JS read the parent's same-origin storage, run `fetch` against the API with the user's cookies, and (in principle) talk back to the API as the user. The `allow-same-origin` was deliberate (storage namespacing relies on same-origin storage), but it materially weakens the sandbox vs. Open Design's null-origin model.

**Mitigation options (in order of pain):**
- Move preview to a separate origin (e.g. `preview-<projectId>.doable.me`) and drop `allow-same-origin`. This is the same playbook used for published sites today.
- Add a strict `Content-Security-Policy` and `frame-ancestors` header on the preview-proxy responses (`services/api/src/routes/preview-proxy/proxy-handler.ts`).
- Require an in-iframe service worker / postMessage broker for storage instead of relying on `localStorage` shims with namespacing.

### 5.2 The MCP-App iframes are already correct

`mcp-ui-resource.tsx:372` is null-origin with strict `sandbox`, JSON-RPC postMessage, OTel-traced host shell — comparable to Open Design's posture and arguably better-instrumented.

### 5.3 We have *zero* CSP / Trusted Types / `frame-ancestors` on `apps/web` itself

`apps/web/next.config.ts` declares no security headers. Open Cowork sets a CSP meta tag in `index.html`. Open Design has none either, but Open Design's blast radius is one user's machine — ours is multi-tenant. **Adding a baseline CSP to the Next.js app is a low-cost, high-value win** and would close the gap on what is otherwise our strongest area (server-side isolation).

### 5.4 Are our sandboxing better or worse?

| Layer | Verdict |
|---|---|
| Server-side code execution | **Doable wins by a wide margin.** Pluggable kernel-level isolation + per-project Vite jail + policy engine. Open Design has none on purpose; Open Cowork has WSL/Lima with a `native` fallback. |
| Per-project runtime isolation | **Doable wins** (dovault is unique). |
| LLM permission gating | **Doable wins.** `createPolicySandbox` is more comprehensive than path-guard regexes (Open Cowork) or "delegate to CLI" (Open Design). |
| Live-preview iframe strictness | **Open Design wins.** Null-origin `allow-scripts` only. Doable grants `allow-same-origin` for the editor preview. |
| Sub-app / MCP-App iframe | **Doable's MCP-App iframe is on par with Open Design's artifact iframe** and better-instrumented. |
| Top-level app CSP | **Open Cowork wins.** Doable and Open Design have none on the app; Cowork has a CSP meta. |
| Electron renderer hardening | n/a for Doable. Open Cowork and Open Design both ship the secure trifecta. |
| MCP server / plugin isolation | **All three are weak.** Doable runs MCP servers as host stdio children; Open Design and Open Cowork treat plugins/skills as descriptors with no JS sandbox. This is a category gap across the industry. |
| Macros for non-Linux deploys | **Open Cowork wins.** WSL/Lima is real isolation on Windows/macOS. Doable falls through to `DirectBackend` on macOS; on Windows we rely on Job Objects (memory/CPU caps but not filesystem isolation). |

---

## 6. Recommended next steps for Doable

Listed in order of leverage / effort. None of these are required by this report — they are options the user can redirect.

1. **Add a baseline CSP** to `apps/web` via `next.config.ts` headers, especially `frame-ancestors 'self'`, `connect-src` allowlist, `script-src 'self' 'wasm-unsafe-eval'`. Lowest effort, biggest defense-in-depth gain.
2. **Move the editor preview to a separate origin** (e.g. `preview-<projectId>.doable.me`) and drop `allow-same-origin` from the live-preview iframe. Brings us to Open-Design parity on the artifact surface and unlocks tighter `frame-ancestors`.
3. **Remove the stale "Docker fallback" line from CLAUDE.md memory** — the project actually uses nsjail/unshare/systemd/jobobject. Memory drift will mislead future sessions.
4. **Sandbox MCP servers.** They're currently host stdio children. Even reusing dovault's Node Permission Model + cgroups for MCP-server child processes would close a real gap.
5. **macOS isolation story.** Doable is unprotected on macOS deploys. If macOS is in scope, copy Open Cowork's Lima approach.
6. **DNS-rebind defense in any future BYOK / proxy code** — a lesson worth borrowing from Open Design's gap, not its strengths.

---

## 7. References

### Doable
- `packages/docore/src/isolator.ts` — `ProcessIsolator`, backend registry
- `packages/docore/src/backends/{nsjail,unshare,systemd,jobobject,direct}.ts`
- `packages/docore/src/sandbox.ts` — `createPolicySandbox`
- `packages/docore/src/policy/defaults.ts` — DEFAULT_DANGEROUS_COMMANDS
- `packages/dovault/src/{vault,process-jail,config-guard}.ts` and `backends/systemd.ts`, `backends/win-heap.ts`
- `services/api/src/projects/vite-jail.ts` — `spawnJailedVite`
- `services/api/src/ai/{docore-bridge,project-files}.ts`
- `services/api/src/routes/preview-proxy/{proxy-handler,injected-scripts}.ts`
- `services/api/src/services/caddy-domains.ts` — published-site CSP
- `apps/web/src/modules/editor/preview/preview-panel.tsx:285`
- `apps/web/src/modules/editor/chat/mcp-ui-resource.tsx:372`
- `apps/web/src/lib/mcp-app/host.ts`
- `apps/web/src/app/(dashboard)/admin/email-panel.tsx:749`

### Open Design (`C:\Users\gj\Documents\workspace\DigForDo\open-design`)
- `docs/architecture.md` (sections 5 + 9 — explicit security model, line 322)
- `apps/daemon/src/agents.ts` — per-CLI bypass-permissions argv
- `apps/daemon/src/server.ts:1970-1988` — SSRF block; `:1820-1900` — spawn
- `apps/daemon/src/projects.ts:170-197` — path traversal guard
- `apps/web/src/runtime/srcdoc.ts` — iframe wrapper, storage shim, deck bridge
- `apps/web/src/components/FileViewer.tsx:911,932` — null-origin sandbox iframe
- `apps/web/src/components/PreviewModal.tsx:278`
- `apps/web/src/artifacts/markdown.ts` — `renderMarkdownToSafeHtml`
- `apps/desktop/src/main/runtime.ts:128` — Electron sandbox

### Open Cowork (`C:\Users\gj\Documents\workspace\DigForDo\open-cowork`)
- `src/main/index.ts:410-415` — BrowserWindow webPreferences
- `src/main/index.ts:481-505` — navigation hardening
- `src/main/index.ts:1144-1195` — IPC dispatch
- `src/preload/index.ts:41-110` — contextBridge allowlist (`ALLOWED_CLIENT_EVENTS`)
- `index.html:5` — CSP meta
- `src/main/sandbox/sandbox-adapter.ts` — mode selection
- `src/main/sandbox/path-guard.ts:23-76` — denylists
- `src/main/sandbox/{wsl-bridge,lima-bridge,native-executor}.ts`
- `src/main/sandbox/{wsl-agent,lima-agent}/index.ts`
- `src/main/sandbox/sandbox-bootstrap.ts`

---

*Generated by 3 parallel Opus sub-agents (one per project) plus a synthesis pass.*
