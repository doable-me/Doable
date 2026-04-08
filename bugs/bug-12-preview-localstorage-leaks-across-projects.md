# Bug 12 — Preview `localStorage` leaks across all projects because preview origin is shared

**Severity:** 🟠 High (data leak, false bug reports, breaks persistence testing)
**Area:** `services/api/src/routes/preview-proxy.ts` (preview dev-server mount) — architectural, not a single line
**Discovered:** 2026-04-09 during the 10-turn to-do-list E2E test
**Status:** Partially fixed (localStorage + sessionStorage) — 2026-04-09

## Fix shipped (2026-04-09) — Option 2 (Storage.prototype namespacing)

**File changed:** `services/api/src/routes/preview-proxy.ts`

**What was done:**

The preview HTML proxy now injects a `<script>` as the **first** child of `<head>` (before any `<link>` or user inline scripts) that monkeypatches `Storage.prototype` to transparently prefix every key with `__<projectId>__`:

- `getItem`, `setItem`, `removeItem` — prefix the key on the way through
- `length` getter — only counts keys that start with the prefix, so user code sees an isolated view
- `key(index)` — only enumerates prefixed keys, stripping the prefix before returning
- `clear()` — only removes prefixed keys, so one project can't wipe another's storage

Because both `localStorage` and `sessionStorage` inherit from the same `Storage.prototype`, a single patch covers both. The script is wrapped in a `try/catch` so a future browser quirk can never break the preview entirely.

The injection site is `<head>` open tag (not `</head>` like the existing error-capture/analytics snippets) because scripts injected at `</head>` would run *after* the dark-mode early-apply `<script>` inside user `index.html` — which reads `localStorage.getItem("theme")`. The namespacing script must run first so that even that earliest read sees the partitioned key.

**Smoke test:**

```
$ curl -s http://127.0.0.1:4000/preview/cb795bee-c1fa-460c-acd9-3caeee346ef1/ | head -10
<!doctype html>
<html lang="en">
  <head><script>
(function() {
  try {
    var PREFIX = "__cb795bee-c1fa-460c-acd9-3caeee346ef1__";
    ...
```

A second project (`ac6264be-...`) correctly emits `PREFIX = "__ac6264be-64de-4fad-af8b-6589387af136__"` — the prefix is per-projectId, so the two projects are now fully isolated at the `localStorage` / `sessionStorage` layer.

TypeScript check (`pnpm --filter @doable/api type-check`) passes clean.

**End-to-end verification (2026-04-09):**

1. Poisoned project `cb795bee-…`'s namespaced `localStorage` by running in the preview tab's devtools: `localStorage.setItem("todos", JSON.stringify([{id:"poison-v3",title:"POISON - should NOT appear in v3",completed:false}]))`. The `key(i)` enumeration now correctly reports only this project's keys (`theme`, `todos`) because of the prototype patch.
2. Created a **brand-new** project `30c46a29-b982-44e5-8d86-fe953f9c95f8` and submitted the Turn 1 "Build a to-do list app…" prompt.
3. **Result:** the new project's preview rendered **empty** — `To-Do List / Add your first task to get started / No tasks yet. Add one above!` — not the poisoned "1 task remaining" ghost that every previous run showed immediately on Turn 1. The poison stayed isolated in `cb795bee`'s namespace and did not cross to `30c46a29`.
4. Throughout all 10 turns of the verification run, the ghost task never appeared — confirming Bug 12 is fixed for `localStorage` (and, because the same `Storage.prototype` covers both, `sessionStorage`).

## Still open (out of scope for the Option 2 patch)

The following cross-project leaks are **not** fixed by this patch and remain tracked under this bug:

- **Service Workers** — a project that registers a SW at `/` still intercepts all preview requests for any project on the shared origin.
- **IndexedDB** — databases are named per-origin, not per-path; two projects that both open a DB called `"app"` still share it.
- **Cache API** — `caches.open()` is origin-scoped.
- **BroadcastChannel** — channels are cross-frame within an origin.
- **Cookies scoped to `/`** — still shared.
- **Permission grants** — camera/mic/notifications granted to one project leak to all.

The correct long-term fix for *all* of these is **Option 1 — per-project subdomains** (e.g. `<shortSlug>.preview.doable.me` / `<shortSlug>.preview.localhost:4000`) which gives each project its own browser origin and partitions every storage surface at once. That work is tracked as a follow-up and is not included in this patch.

## Symptom

A **brand-new** project, built from scratch via the dashboard prompt `"Build a to-do list app. Items should have a title, a checkbox, and a delete button. Store them in localStorage so they persist across refreshes."`, renders in the preview with **an already-populated task** — showing "1 task remaining" and a ghost checkbox row, before the user has added anything.

Screenshot evidence: the first Turn-1 screenshot of project `ac6264be-64de-4fad-af8b-6589387af136` shows the header "To-Do List / 1 task remaining" and a single empty-title checkbox row, immediately after the initial build completed. No one had added a task.

## Root cause

All preview dev servers on this box are mounted under a single origin: `http://127.0.0.1:4000/preview/<projectId>/...`. Because origins in browser security model are `scheme://host:port` **without the path**, every project's preview shares the same origin — `http://127.0.0.1:4000`.

Browser `localStorage` is partitioned per *origin*, not per path. So `localStorage.getItem("todos")` from project A and project B hit the same storage bucket.

The AI-generated `useLocalStorage("todos", [])` hook in each project reads whatever was previously written under the key `"todos"` on origin `localhost:4000`, regardless of which project wrote it. A fresh project gets the leftover data from whichever project last ran.

The same applies to:
- `localStorage` (confirmed)
- `sessionStorage`
- IndexedDB
- Cookies (if scoped to `/`)
- Cache API (Service Workers)
- BroadcastChannel
- Any permission grants (notifications, clipboard, camera, etc.) if a user ever granted them

## Impact

1. **False "persistence working" / "persistence broken" bug reports.** Users building a to-do / notes / calc / form app will see leftover state from a previous project and either think the AI mis-built something or, worse, think it built something it didn't. During this E2E run, *every single turn* showed "1 task remaining" with no real tasks — because a prior project's `{id: ..., title: "", completed: false}` was sitting in `localStorage["todos"]`.
2. **Real data leakage between projects.** If project A is shared with user X and project B is shared with user Y, and both users open their projects on the same browser profile, Y can see A's localStorage data in the preview. Not a catastrophic leak (preview is scoped to the logged-in user's projects), but it leaks *across projects owned by the same user* which is still wrong — projects are supposed to be isolated sandboxes.
3. **Breaks E2E testing of persistence.** You can never cleanly test that a newly-built app correctly *initializes* empty state, because storage is never clean.
4. **Service Workers across projects.** If one project registers a Service Worker at `/`, it will intercept requests for *all* subsequent project previews on the same origin. Haven't seen this happen in the wild yet, but the door is open.
5. **Permission pollution.** If project A once got camera permission, project B inherits it silently.

## Reproduction

### Simplest repro (manual, 2 minutes)

1. In any existing Doable project, open the preview and run in the preview iframe's devtools console:
   ```js
   localStorage.setItem("todos", JSON.stringify([{id: "poison", title: "", completed: false}]));
   ```
2. Go back to the dashboard, click **New project**.
3. Prompt: `"Build a to-do list app with localStorage persistence."`
4. Wait for the first turn to complete.
5. Look at the preview. **Expected:** empty list, "Add your first task to get started." **Actual:** the list shows the poisoned task ("1 task remaining" with an empty title).

### Real-world repro (what happened in this run)

1. Fresh browser profile, log in as `uniquegodwin@gmail.com`.
2. Open any older to-do-ish project in the dashboard. Any earlier project that wrote to `localStorage["todos"]` is enough — in this run, a prior `e2e-watch-1775670675627` project left one empty-title entry behind.
3. Click **New project**, submit the Turn 1 prompt from the 10-turn script. This creates project `ac6264be-64de-4fad-af8b-6589387af136`.
4. As soon as the initial `src/App.tsx` streams in and Vite hot-reloads, the preview renders with the leaked task already visible — even though the new App.tsx code correctly defaults to `[]`:
   ```ts
   // services/api/projects/ac6264be-64de-4fad-af8b-6589387af136/src/App.tsx:7
   const [todos, setTodos] = useLocalStorage<Todo[]>("todos", []);
   ```
   and `useLocalStorage` correctly falls back to the initial value only when `localStorage.getItem(key)` is null:
   ```ts
   // services/api/projects/ac6264be-64de-4fad-af8b-6589387af136/src/hooks/useLocalStorage.ts
   const stored = localStorage.getItem(key);
   return stored ? (JSON.parse(stored) as T) : initialValue;
   ```
5. The ghost task persists across all 10 turns of the run — visible in every screenshot from Turn 1 through Turn 10.

## Fix options

### Option 1 — Per-project subdomain origins (recommended, most correct)

Serve each preview under its own subdomain: `http://<projectId>.preview.localhost:4000/` or `http://<shortSlug>.preview.localhost:4000/`. Browsers treat each subdomain as a distinct origin, so localStorage / Service Workers / permissions are cleanly partitioned.

Requires:
- Caddy or equivalent to route `*.preview.localhost` wildcard to the Hono preview handler with the `projectId` extracted from the Host header.
- In production, the same thing under `*.preview.doable.me` via Cloudflare Tunnel (already doing wildcards for publish sites per `project_publish_infra.md`).
- Development: `preview.localhost` isn't hostsfile-resolvable on all OSes. Ship a small `dnsmasq` config or document the workaround. On Windows/macOS, `127.0.0.1 <anything>.localhost` works out of the box on most browsers (Chrome/Firefox implicitly resolve `*.localhost`).

Downside: bigger infra change. Needs CORS for the editor-to-preview messaging.

### Option 2 — Automatic key namespacing via Vite plugin / dev-server middleware

Inject a small script at the top of `index.html` (via the preview mount) that monkeypatches `localStorage` / `sessionStorage` to prefix every key with `__<projectId>__`:

```html
<script>
  (function() {
    var PREFIX = "__{{PROJECT_ID}}__";
    var origGet = Storage.prototype.getItem;
    var origSet = Storage.prototype.setItem;
    var origRemove = Storage.prototype.removeItem;
    var origKey = Storage.prototype.key;
    Storage.prototype.getItem = function(k) { return origGet.call(this, PREFIX + k); };
    Storage.prototype.setItem = function(k, v) { return origSet.call(this, PREFIX + k, v); };
    Storage.prototype.removeItem = function(k) { return origRemove.call(this, PREFIX + k); };
    // ...also patch .length / .key() / clear() / Object.keys semantics
  })();
</script>
```

Pro: zero infra change, works locally and in prod.
Con: fragile (monkeypatching the Storage prototype has edge cases — e.g. `for...in`, `Object.keys(localStorage)`, `storage` events across tabs). Does not fix Service Workers, IndexedDB, or permissions. Code that inspects raw keys will see the prefix.

### Option 3 — `<iframe sandbox="allow-scripts">` without `allow-same-origin`

Wrap the preview in a sandbox iframe that denies same-origin access. Storage is then scoped to a unique opaque origin per iframe load. 

Pro: one-line change. Cleans up storage, cookies, permissions in one stroke.
Con: *aggressive*. Breaks cross-frame messaging with the editor (which needs `postMessage`, OK) but also breaks anything that relies on same-origin fetch cookies, service workers, or `document.cookie`. If any existing previewed app expects persistent cookies or SW registration for offline support, this breaks them. Also breaks dev-tools "open preview in new tab" because the opaque origin dies with the iframe.

### Option 4 — "Clear preview storage" button

Short-term UX band-aid: a button in the editor that dispatches a `postMessage` to the preview iframe which runs `localStorage.clear(); sessionStorage.clear();`. Doesn't solve the underlying cross-project leak, but gives users a hammer when they see weird state.

**Recommended:** Option 1 (subdomains) is architecturally correct and matches what the publish infra already does. Option 4 should ship alongside as an immediate user-facing escape hatch while Option 1 is built.

## Acceptance criteria for a fix

1. Poison `localhost:4000`'s `localStorage["todos"]` as in the simple repro above.
2. Create a fresh project and build a todo app.
3. On first render of the new project's preview, the list should be **empty** — "Add your first task to get started." — not showing leaked data.
4. Deleting items in project A's preview should not affect project B's preview.
5. Two projects, both using `localStorage.setItem("theme", "dark")`, should be able to hold **different** theme values simultaneously.
6. The existing publish flow at `*.doable.me` should still work unchanged (separate origin per subdomain already isolates prod sites; this bug is preview-only).

## Related

- `project_publish_infra.md` memory notes that the publish infra already uses per-project subdomains under `*.doable.me` — the same pattern should apply to preview.
- Bug 9 (`bug-09-scaffold-broken-preview.md`) is adjacent: both are preview-origin issues.
