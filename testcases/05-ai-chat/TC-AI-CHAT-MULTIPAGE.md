# TC-AI-CHAT-MULTIPAGE — multi-page React Router app via AI chat

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`

- **Pre:** owner JWT in `_tokens-${ENV}.json`; fresh project from `POST /projects` with `framework_id=vite-react`; AI provider configured for owner workspace.
- **Why:** verifies that the AI can produce a non-trivial *multi-route* React app (router + nav + pages + 404), and that follow-up turns can layer features (sidebar widgets, login flow, layout extraction, theme persistence) without regressing existing routes.

## Turns (granular, runner = `testcases/evidence/run-granular-turn.sh`)

| # | Prompt (excerpt) | ACCEPT_PHRASES regex | Expected change set |
|---|---|---|---|
| 1 | Build multi-page React Router app with /, /about, /dashboard, /settings, /* (404), top nav, active highlight | `BrowserRouter\|Routes\|Route\|NavLink\|react-router-dom` | `package.json` (adds react-router-dom), `src/App.tsx`, `src/main.tsx`, `src/components/Navigation.tsx`, `src/pages/{Home,About,Dashboard,Settings,NotFound}.tsx` |
| 2 | Add sticky sidebar on /dashboard with 5 widget cards (Revenue/Users/Sessions/Errors/Latency) + trend arrows | `dashboard\|sticky\|Revenue\|Users\|Sessions` | `src/pages/Dashboard.tsx` (+sidebar component or inline) |
| 3 | Add /login (email+password+Sign in, no real auth); empty-email inline error; success → navigate(/dashboard) | `useNavigate\|/dashboard\|/login\|password\|Sign in` | `src/pages/Login.tsx`, `src/App.tsx` (route registered), `src/components/Navigation.tsx` (link added) |
| 4 | Global Layout wrapper with `<Outlet />`; nav lives in layout; remove from individual pages | `Outlet\|Layout\|layout` | `src/components/Layout.tsx`, `src/App.tsx` (route tree wraps in `<Layout>`), pages slim down |
| 5 | /settings: theme select (light/dark/auto) → applies class to `<html>` + `localStorage` persist | `theme\|setTheme\|document.documentElement\|localStorage` | `src/pages/Settings.tsx` (+useState/useEffect) |

## Acceptance

- **Per-turn package.json check:** `dependencies` (or `devDependencies`) MUST include `react-router-dom`. If turn 1 doesn't add it → file BUG-MULTI-DEPS.
- **Router primitive flexibility:** `BrowserRouter`, `HashRouter`, or `MemoryRouter` from `react-router-dom` are all acceptable. The seed accept-phrase string mentions `BrowserRouter` for clarity but a HashRouter result is **not** a bug — sandboxed previews under `/preview/{id}/` actually work *better* with HashRouter because it sidesteps base-path rewrites. Update ACCEPT_PHRASES to `Router\b` if you want a single-pattern check.
- **Active route highlight:** must render a different style/className when current route matches (NavLink with `isActive`, `useLocation()`, or styled `Link`).
- **404 catch-all:** route `path="*"` registered.
- **Preview HTTP probe:** `${API_BASE_URL}/preview/{id}/` → HTTP 200 with body > 200 bytes within 60s of SSE `[DONE]`. The probe in `run-granular-turn.sh` requires the bearer token; if running outside the runner script, include `Authorization: Bearer ${TOK}`.

## Known runner limitations

- The chat endpoint is rate-limited to **20 requests / 120s** per token (zantaz env). A 5-turn run finishing inside 5 minutes is feasible only if each turn streams `[DONE]` in <24 s on average. SSE timeouts that don't return `[DONE]` *still consume a slot*. Pad the test to ~3 minutes between turns or use a budget of ≥7 minutes for a clean 5-turn run.
- Current `ACCEPT_PHRASES` for turn 1 includes `BrowserRouter`; if the model picks `HashRouter` (perfectly valid for the sandbox), the per-turn accept-hits string will show `-BrowserRouter` even though the app is correct. See note above.

## Run log

`testcases/99-runlog/env1/app-multipage.md` (per-env results, summary CSV, BUG-MULTI-* references).
