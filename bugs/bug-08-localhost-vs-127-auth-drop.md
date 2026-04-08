# Bug 8 — `localhost` ≠ `127.0.0.1` origin mismatch drops auth on navigation

**Severity:** 🟡 Medium (real-user footgun, small blast radius)
**Area:** web app `NEXT_PUBLIC_APP_URL` / auth session storage / documentation
**Discovered:** 2026-04-08 during ui-driver Phase 1
**Status:** Open

## Symptom

A user logged in at `http://localhost:3000` and then navigates (or bookmarks, or clicks a shared link) to `http://127.0.0.1:3000`:

1. They arrive at the new origin with no auth state (localStorage is origin-scoped; `localhost` and `127.0.0.1` are different origins to the browser).
2. The app kicks them through `/auth/callback`.
3. Depending on callback behavior, they may get re-authenticated silently, or they may end up back at login.

ui-driver hit this during the 2026-04-08 audit: ~"navigating to 127.0.0.1:3000 dropped localStorage and kicked a /auth/callback round-trip. I'm using `localhost` for the UI."

## Root cause

Browsers treat `localhost` and `127.0.0.1` as different origins. The app stores the session in `localStorage` with keys:

```
doable_access_token
doable_refresh_token
doable_auth_user
```

These are written to whichever origin the user first logged in on. Visiting the other origin → no keys → logged-out state.

## Context: CLAUDE.md says bind 127.0.0.1 only

The project rule in `CLAUDE.md` is that all services MUST bind to `127.0.0.1` (never `0.0.0.0`, never public interfaces). That's a network security rule about *binding*, not a rule about what URL the user types. Those are different concerns that the current docs conflate.

- Binding: `127.0.0.1` only ✓ (security)
- User-facing URL: `localhost` ← the canonical name

Both resolve to the same listener, so a `127.0.0.1`-bound service answers requests made to `http://localhost:3000/`. The user just needs to pick one name and stick with it.

## Fix

### Option A — pick `localhost` as canonical and redirect

Add a middleware or Next.js redirect that 308-redirects `127.0.0.1:3000` → `localhost:3000`:

```ts
// middleware.ts
import { NextResponse } from "next/server";
export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (host === "127.0.0.1:3000") {
    const url = new URL(req.url);
    url.host = "localhost:3000";
    return NextResponse.redirect(url, 308);
  }
}
```

Any user who bookmarked or shared a `127.0.0.1` URL gets forwarded cleanly. Their login on `localhost` keeps working; `127.0.0.1` entries land them in the right place.

### Option B — pick `127.0.0.1` as canonical and redirect the other way

Harder because `localhost` is what Next.js dev defaults print in the terminal (`Local: http://localhost:3000`). Reversing the redirect flies against the grain of the dev experience.

### Option C — document it

Add a section to `CLAUDE.md` or a new `DEV.md` that says: "Always use `http://localhost:3000` for dev. The services bind to `127.0.0.1` for security, but you type `localhost`." Lowest-cost fix.

## Recommendation

Option A + Option C. The redirect catches the footgun; the docs prevent people from re-introducing it.

## Related

- `NEXT_PUBLIC_APP_URL` in `.env` is currently `http://localhost:3000` — that's the canonical form the app already assumes. A user arriving at `127.0.0.1` is fighting the existing config.
- Anywhere the frontend constructs absolute URLs from `NEXT_PUBLIC_APP_URL`, they'll be `localhost` — which is consistent, until someone types `127.0.0.1` directly.

## Reproduction

1. Open `http://localhost:3000`. Log in. Verify `localStorage.doable_access_token` is set.
2. Open a new tab at `http://127.0.0.1:3000`.
3. Observe: no auth state, kicked through `/auth/callback`.
