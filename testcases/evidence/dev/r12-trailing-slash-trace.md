# BUG-R10-TRAILING-SLASH-AUTH-DROP-001 — Causal Trace (Tracer R12)

- **Filed**: 2026-05-15
- **Tracer**: oh-my-claudecode:tracer (Opus)
- **Bug source**: `testcases/bugs/BUG-R10-TRAILING-SLASH-AUTH-DROP-001.md`

## Observation (precise)

`curl -L -H "Authorization: Bearer <jwt>" https://dev-api.doable.me/templates/` returns HTTP 308 → curl/Node fetch follows the `Location` header → second request returns 401. The same request without the trailing slash returns 200. (Bug report, `testcases/bugs/BUG-R10-TRAILING-SLASH-AUTH-DROP-001.md:14-22`).

## Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible / why down-ranked |
|------|------------|------------|-------------------|--------------------------------------------|
| 1 | **H1** — Hono app-level middleware emits the 308 (`services/api/src/index.ts:289-319`) | **~95%** | Strong (primary source artifact + author comment explicitly naming this exact bug class) | The 308 is generated in app code; comment at line 301 acknowledges header drop on these redirects |
| 2 | H4 — Auth header dropped due to cross-origin redirect | **~3%** | Weak (no evidence target host differs) | Redirect target preserves Host via `x-forwarded-host` (line 313). Same origin. Down-ranked. |
| 3 | H5 — undici (Node 22) strips Authorization on same-origin redirects | **~2%** | Weak (contradicted by docs; only strips cross-origin) | undici only strips on cross-origin redirects per WHATWG spec; this is same-origin. Down-ranked. |
| 4 | H2 — Cloudflare Tunnel synthesises the 308 | **~0%** | Disconfirmed | `cloudflared` ingress in `setup-server.sh:1000-1017` is a plain L4-ish pass-through (`hostname → service: http://127.0.0.1:4000`). No path normalization. |
| 5 | H3 — Caddy issues the redirect | **~0%** | Disconfirmed | Caddyfile at `setup-server.sh:1103-1131` only matches `*.${DOMAIN}` subdomains and serves static published sites on `:8080`. `dev-api.doable.me` bypasses Caddy entirely — the tunnel routes API traffic straight to `127.0.0.1:4000` (Hono). |

## Evidence For

### H1 (Hono app middleware emits 308)
- `services/api/src/index.ts:289-319` registers `app.use("*", …)` middleware that:
  - Matches any method ≠ OPTIONS where `path.length > 1 && path.endsWith("/")`
  - Excludes `/preview/`, `/thumbnails/`, `/design-comments/`, `/health/`
  - Rebuilds the URL stripping trailing slash (line 307: `url.pathname = path.replace(/\/+$/, "")`)
  - Sets `Cache-Control: no-store` and returns `c.redirect(url.toString(), 308)` (lines 315-316).
- `/templates/` matches the conditions (not excluded), so this middleware fires.
- Comment on lines 300-302 explicitly states: *"a permanent redirect (which Cloudflare/Caddy can cache and which some clients dropped the Authorization header on)"* — the engineer who excluded `/design-comments/` already documented this header-drop behaviour for that path.
- Mount order (`services/api/src/index.ts:174-319`): tracing → logger → admin headers → secureHeaders → cors → **308 redirect (line 289)** → rate limit. The redirect runs **before** any route-scoped auth gate. So the FIRST request returns 308 unauthenticated (no auth check). The followed request to `/templates` should then hit `templateRoutes.use("/", authMiddleware)` (`services/api/src/routes/templates.ts:24`).

### H4 / H5 (cross-origin or undici)
- None — these are speculation. No evidence collected in code or config that the redirect target differs in scheme/host from the original.

## Evidence Against / Gaps

### H1
- Gap: I did not execute a live `curl -v -L` against `dev-api.doable.me` from this trace (no shell access to dev box from this session). The redirect chain is inferred from source. However, the bug report **already captured the observed behaviour** (`HTTP=308` on `/templates/`), which closes the inferential gap.

### H2 (Cloudflare Tunnel)
- `setup-server.sh:1000-1017` shows `ingress` blocks that simply forward by `hostname` to a 127.0.0.1 port. No `originRequest`, no path normalization, no redirect emission. Tunnels don't synthesize 308s; they reverse-proxy whatever the origin returns.

### H3 (Caddy)
- `setup-server.sh:1103-1131` shows Caddy listening only on `:8080` with `bind 127.0.0.1` and handling only subdomain-matched static sites. API traffic does not pass through Caddy.

### H4 (cross-origin)
- The redirect handler reuses `x-forwarded-host` (line 313) and `x-forwarded-proto` (line 310), so the `Location` stays on `https://dev-api.doable.me`. Same origin. Browsers and modern fetch keep auth on same-origin redirects.

### H5 (undici Node 22)
- WHATWG fetch (which undici implements) strips Authorization across **cross-origin** redirects. Same-origin redirects preserve it. The reported 401 suggests EITHER: (a) some clients (curl with default flags? older Node?) drop it anyway, or (b) the followed request reaches auth middleware that rejects for a different reason. Bug report says "Node fetch follows the 308 by default but … loses the Authorization header along the way" — observation-level claim, not yet bisected per-client.

## Rebuttal Round

**Best challenge to H1**: "If the redirect is same-origin and preserves Host, why does Authorization disappear? Curl by default preserves Authorization across same-host redirects, and undici/fetch does too. So perhaps the 401 isn't due to dropped auth at all — maybe the followed request hits a *different* code path that 401s for unrelated reasons (e.g., a stale CSRF token, missing cookie, query-string difference)."

**Why H1 still stands**:
1. The bug report observed `200` on `/templates` (no slash) and `401` on the followed-from-`/templates/` request. Same JWT, same client, same path after redirect. The only variable is "did the redirect drop the header?" — which the author already documented for the `/design-comments/` carve-out at line 301.
2. Curl behaviour: by default, curl does **not** include the original headers on the redirected request unless `--location-trusted` is used. `curl -L -H "Authorization: …"` follows redirect but `-H` headers are sent on the first request only; on the followed request, curl applies its default header policy (strips Authorization if it considers the redirect a different host *or* if the version is conservative). The bug repro at `BUG-R10…md:18` uses plain `-L`, so curl's own conservative same-host policy is likely culprit. This actually **converges** H1 + H5 onto the same mechanism: *redirect happens (H1's fault) and then client header policy (curl/undici) drops auth*.
3. Removing the 308 entirely (or registering both `/templates` and `/templates/` handlers) makes both the redirect AND the client header-drop irrelevant. H1 is the root cause; H5 is the proximate "why does the second request 401" mechanism.

## Convergence / Separation Notes

- **Convergence**: H1 (server emits 308) and H5 (client drops Authorization on redirect) describe the **same** observed failure mode, but at different layers. The server emits an unnecessary redirect; the client (correctly or incorrectly) handles redirects conservatively. Either fix breaks the chain, but the fix on the server side (H1) is both cheaper and applies universally to all clients.
- **Separation preserved**: H4 (cross-origin) and H2/H3 (CDN/proxy) remain distinct hypotheses and were independently ruled out.

## Redirect Chain (end-to-end)

1. Client (curl/Node fetch): `GET https://dev-api.doable.me/templates/` with `Authorization: Bearer <jwt>`.
2. Cloudflare Tunnel forwards to `http://127.0.0.1:4000` (`setup-server.sh:1001-1002`). Path preserved, headers preserved (including `x-forwarded-host: dev-api.doable.me`, `x-forwarded-proto: https`).
3. Hono `app` enters middleware chain. Tracing → logger → admin → secureHeaders → cors run.
4. **Trailing-slash middleware fires** (`services/api/src/index.ts:289-319`): path is `/templates/`, method is GET, not in exclusion list. Builds `https://dev-api.doable.me/templates` and returns 308 with `Cache-Control: no-store`. **No auth check runs.**
5. Client receives 308, reads `Location: https://dev-api.doable.me/templates`.
6. Client follows redirect. Depending on client/version, Authorization header **may be dropped** (curl default policy on `-L`; undici behaviour subject to spec). The bug report observes it IS dropped under the test clients used.
7. Hono receives `GET /templates` without Authorization. Passes trailing-slash check, reaches `templateRoutes`. `templateRoutes.use("/", authMiddleware)` (`services/api/src/routes/templates.ts:24`) rejects with 401.

## Current Best Explanation (provisional, 95% confidence)

Hono's app-level trailing-slash normalization middleware (`services/api/src/index.ts:289-319`) issues a 308 redirect for `GET /templates/`. The followed request is then made by the client *without* Authorization (a known and already-documented behaviour of the trailing-slash carve-out for `/design-comments/` at line 301), and the second request returns 401 from `templateRoutes.use("/", authMiddleware)` at `services/api/src/routes/templates.ts:24`. Root cause is server-emitted 308; proximate failure is client header drop on redirect.

## Critical Unknown

Whether the second-request header drop is universal across clients (curl, undici, browser fetch, SDK fetch) or only affects a subset. This determines whether documentation alone is sufficient (Option D) or a server fix is required (Options A/B/C). Bug report `:26-27` already notes "behavior is inconsistent across runtimes" — implying universal-fix is the safer answer.

## Discriminating Probe

Run, against dev-api.doable.me, with a valid qa-owner JWT:

```bash
TOKEN=<valid jwt>
curl -v -L --header "Authorization: Bearer $TOKEN" \
  https://dev-api.doable.me/templates/ 2>&1 | \
  grep -E '^(> Authorization|< HTTP|< Location|> GET)'
```

This shows (a) the 308 with Location, (b) whether curl re-sends `> Authorization:` on the followed request, (c) the second-response status. Repeat with `node --eval "fetch('https://dev-api.doable.me/templates/', {headers:{Authorization:'Bearer ${TOKEN}'}}).then(r=>r.status).then(console.log)"` to capture undici behaviour. ~30 seconds total. Collapses the H1-vs-H5 separation question.

## Recommended Fix

### Option B — Re-register the trailing-slash variant inside Hono (RECOMMENDED)

The cleanest fix is to remove the carve-out asymmetry by making the trailing-slash middleware **strip the slash internally** (rewrite, not redirect) instead of issuing a 308. Concretely:

- **Edit point**: `services/api/src/index.ts:289-319` — replace the `c.redirect(…, 308)` (line 316) with an internal path rewrite that calls `next()` against the canonical path. Hono supports this via `c.req.path` rewriting through a new `Request` clone, or simply by mounting all sub-routers with `strict: false` (as `/design-comments/` already does per the comment at line 297-299, citing **BUG-WSI-003**).

- **Why preferred**:
  - Zero client-side observable change beyond "auth now works on `/templates/`".
  - Pattern is already established in this codebase (`design-comments` and `/health/` are carved out).
  - No 308 means no client-side header policy comes into play — fixes all clients (curl, undici, browsers, future SDKs).
  - No DNS/Caddy/Tunnel changes needed; no infra rollout risk.
  - Single-file change; idempotent; reversible.

- **Cost**: ~1 hour to convert all sub-routers to `new Hono({ strict: false })`, plus regression check that no route relies on the strict distinction. The two carve-outs already in the codebase (`/preview/`, `/thumbnails/`) stay untouched because they're for static-file/dev-server paths where the slash is semantic.

### Option A — Disable redirect, return 404 instead

Reject: regresses the original bugs 7 and 13 cited in the comment at lines 274-276 ("clients that built URLs with a base+path concatenation hit 404s inconsistently"). Worse UX than today.

### Option C — Strip trailing slash in Caddy / Cloudflare rewrite

Reject:
1. Caddy isn't in the API path (`setup-server.sh:1103-1131` only handles `:8080` for static sites).
2. Cloudflare Tunnel's `ingress` block (`setup-server.sh:1000-1017`) is forwarded by hostname, no rewrite primitive there.
3. Would require a new Cloudflare Worker or a Caddy layer in front of the tunnel — large infra change for a small bug.

### Option D — Document as WONTFIX, require canonical paths in SDKs

Reject as primary, but should be a complementary mitigation in `API.md` regardless. R10 already adopted this partially (`scripts/r10-api-matrix.ts` test was changed to drop the slash, per `BUG-R10…md:36-37`).

## Justification (cost/risk vs benefit)

Option B is **lowest-cost, highest-benefit**: 1 file edit, well-established pattern in this same file (lines 297-303 already carved out `/design-comments/`), zero infra change, fixes all clients including future SDKs. Risk is bounded: regression check is "all sub-routers still resolve their routes". The 308-emission path has caused at least two prior bugs already documented in the comment chain (BUG-API-001 line 308, BUG-WSI-003 line 297-302). Removing the redirect entirely (by switching to `strict: false` per-router) collapses the entire bug class instead of patching individual paths.

## Uncertainty Notes

- 5% residual uncertainty: I did not run the live curl probe; reasoning is from source + bug-report observation. Probe above closes this.
- Unknown: whether *every* sub-router can safely move to `strict: false`. Some routes may rely on strict pattern matching (e.g., `/foo` vs `/foo/`). A quick grep of `new Hono(` across `services/api/src/routes/**` should enumerate the surface; expected to be <30 files.
- Unknown: whether any external caller (mobile SDK, third-party integration) depends on the 308 as a stability contract. Highly unlikely — 308 is a permanent redirect specifically signalling "use the new URL"; clients that rely on it would have already switched to the no-slash variant.
