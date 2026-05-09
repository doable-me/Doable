# TC-AI-CHAT-PWA — Doable AI builds a Progressive Web App via 5 chat turns

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`
Runner: `testcases/evidence/run-granular-turn.sh`

This test verifies that the Doable AI chat surface can build, iteratively, a small but real Progressive Web App: localStorage-backed notes UI, manifest, service worker, offline page, and `beforeinstallprompt` install button. Each turn is a separate POST → SSE → diff → preview probe; the runner records source-SHA diff on the dev server and HTTP probes the preview URL until 200/non-empty.

Pre:
- Owner JWT present in `testcases/evidence/_tokens-env1.json` (key `qa-owner`).
- A draft project (vite-react framework) created in qa-owner's workspace.
- AI provider configured for owner's workspace.

## Turn-by-turn prompts and acceptance regexes

| Turn | Prompt summary | ACCEPT regex (matched against post-turn `src/App.tsx`) | SSH side-check |
|------|----------------|--------------------------------------------------------|----------------|
| 1 | Build tiny notes PWA: empty list, textarea, Save button, localStorage persist, Tailwind, offline banner via `navigator.onLine`. | `navigator.onLine\|localStorage\|textarea\|notes\.map` | n/a |
| 2 | Add `/public/manifest.json` with name, short_name, start_url, display=standalone, theme_color, placeholder PNG icons. | `manifest\.json\|standalone\|theme_color` | `find /opt/doable/services/api/projects/<id>/public -name manifest.json` must return a path |
| 3 | Register a service worker `/public/sw.js` that caches the app shell; register from `main.tsx`. | `serviceWorker.register\|sw\.js\|cacheName` | `find ... -name sw.js` must return a path |
| 4 | Service worker serves a custom `offline.html` when fetch fails. | `offline.html\|catch.*fetch\|caches.match` | n/a |
| 5 | Add an "Install App" button that calls `beforeinstallprompt.prompt()` when supported. | `beforeinstallprompt\|prompt\(\)\|deferredPrompt` | n/a |

## Steps

1. POST `/projects/:id` to ensure project exists; reuse or create vite-react draft.
2. For each turn 1..5, invoke `run-granular-turn.sh` with `ENV_NAME=env1 API_BASE_URL=https://zantaz-api.doable.me PROJECT_ID=<id> TURN=<N> PROMPT=<...> ACCEPT_PHRASES=<regex> TEST_NAME=app-pwa`.
3. Runner side-effects per turn:
   - SSE stream captured to `<id>.turn<N>.sse.jsonl` and per-event timing TSV.
   - Source SHA diff (BEFORE/AFTER) → list of files mutated.
   - `App.tsx` cat'd if changed; ACCEPT regex grep'd against it.
   - Preview URL probed up to 60s until HTTP 200 with body > 200 bytes.
4. Additional SSH check after turn 2: list `<projects>/<id>/public` to confirm `manifest.json` present.
5. Additional SSH check after turn 3: list `<projects>/<id>/public` to confirm `sw.js` present.
6. Optionally GET `<API>/preview/<id>/manifest.json` and `<API>/preview/<id>/sw.js` to confirm Caddy/Vite serves the files.

## Acceptance

- Each turn's runner summary line shows at least one positive ACCEPT hit (`+<phrase>`) for App.tsx-level prompts, OR the SSH check succeeds for public/-asset turns.
- Preview returns 200 with non-empty body within 60s after at least one of turns 1, 3, 5.
- No turn aborts with `Copilot SDK error: AI is not configured` (otherwise this is BUG-WEB-AI-001 territory).

## Failure modes

- **app-tsx-not-mutated** — diff shows no `src/App.tsx` change for turn 1 → BUG-PWA-NOTES-NO-MUTATION
- **manifest-missing** — turn 2 finishes but `find ... manifest.json` empty → BUG-PWA-MANIFEST-MISSING
- **sw-missing** — turn 3 finishes but `find ... sw.js` empty → BUG-PWA-SW-MISSING
- **offline-page-missing** — turn 4 finishes but `offline.html` not in /public → BUG-PWA-OFFLINE-MISSING
- **install-button-missing** — turn 5 ACCEPT regex no hit on `beforeinstallprompt` → BUG-PWA-INSTALL-MISSING
- **preview-stuck** — preview probe times out after 60s → BUG-AI-CHAT-PREVIEW-STUCK
- **mode-rejected** — POST returns 400 with mode error → confirm default `mode=agent` accepted by send-handler.

## Severity

Smoke for the PWA story (gates the "AI can build a real PWA" claim against env1).
