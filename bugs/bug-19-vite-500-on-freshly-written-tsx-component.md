# Bug 19 — `GET /preview/<pid>/src/components/FeedbackForm.tsx` returns 500 persistently after AI writes the file

**Severity:** 🟠 High (breaks preview iframe rendering and knocks out thumbnail capture)
**Area:** `services/api/src/dev-server/*` — per-project Vite dev server; or upstream, the AI's generated file is using CSS tokens/classes whose CSS vars aren't defined and Vite + plugin fails to transform
**Discovered:** 2026-04-09 round-2 E2E
**Status:** Open — needs live inspection of Vite's error output

## Symptom

After turn 1 of the Supabase feedback app test, `services/api/projects/<pid>/src/components/FeedbackForm.tsx` lands on disk cleanly (readable, no visible syntax error). But every preview iframe reload hits:

```
GET /preview/<pid>/src/components/FeedbackForm.tsx → 500 (17ms)
```

consistently. Other sibling files (`StarRating.tsx`, `supabase.ts`, `StarDisplay.tsx`) return 200. The 500 persists across multiple iframe reloads without recovery.

Knock-on effect: `[Thumbnail] Preview has errors for <pid>, retrying in 5000ms (attempt 1/2)` → `[Thumbnail] Skipping capture for <pid> — Preview has errors after 2 attempts` → `[Thumbnail] Capture returned null`. See also bug-22 (thumbnail skip correlation).

## Likely root causes (need verification)

1. **Tailwind 4 shadcn tokens without CSS variables.** `FeedbackForm.tsx` references `bg-primary`, `text-primary-foreground`, `border-input`, `bg-background`, `text-muted-foreground`, `focus-visible:ring-primary` — these are shadcn/ui tokens backed by CSS custom properties. The fresh scaffold ships `src/index.css` without these variables defined, so at the Tailwind-4 compile level these become `bg-[var(--primary)]` with `--primary` undefined. Tailwind 4 may emit a build error instead of silently failing.
2. **TSX generic arrow-function parsing ambiguity.** The AI wrote `const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {…}`. In .tsx mode, Vite's esbuild/swc loader can mis-parse `<K extends …>` as a JSX tag if the constraint is too loose. Workaround is `<K extends keyof FormData,>` (trailing comma) or constraining with a concrete type. Unlikely here because `keyof FormData` should bias the parser to TS-generic, but worth checking.
3. **ESM import of a type-only re-export.** `import { supabase } from "../lib/supabase"` — if `supabase.ts` exports only types or has a top-level effect that throws (e.g. `createClient(URL, KEY)` with undefined env vars), the import would throw at evaluation. This wouldn't produce a 500 from the `/preview` server though — it would produce a 200 with the file and a runtime error in the iframe.

## Reproduction

1. Create a fresh project.
2. Send the prompt: "Build a feedback form at src/App.tsx: fields for name, email, message, and a 1-5 star rating. On submit, insert a row into a Supabase table called `doable_feedback` using the connected Supabase integration. Show a thank-you state after successful submit. Use Tailwind. If the table doesn't exist, create it first via Supabase."
3. Wait for the AI to finish writing files.
4. Open the preview iframe in Chrome devtools → Network → reload. Observe `FeedbackForm.tsx` → 500.
5. `tmux capture-pane -t doable:0 -p -S -300 | grep "FeedbackForm.tsx"` shows the 500.

## Next steps

1. Read the per-project Vite dev server's stderr at the moment of the 500. The 500 is served by Vite's `/vite-project` plugin in the API server's preview proxy — find where it constructs the 500 response and log the underlying error.
2. If (1) shows Tailwind CSS variable errors, ship a default shadcn-compatible `src/index.css` variable set in the scaffold, or teach the AI prompt to add the CSS variables when it uses those tokens.
3. If (1) shows a TS parse error, tighten the AI's code-gen rules or add an auto-fix step.

## Acceptance

1. After turn 1 on a fresh project, `GET /preview/<pid>/src/components/FeedbackForm.tsx` returns 200.
2. Thumbnail capture succeeds.
3. Iframe renders the form without a Vite error overlay.
