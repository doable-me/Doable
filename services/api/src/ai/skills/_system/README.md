# System / Master Skills

This directory is the home for **platform-shipped ("master") skills** — skills
that ship with Doable and are available to **every** AI build session, with no
per-workspace setup and no row in the `context_skills` table.

## How to add a master skill

1. Create a folder here: `services/api/src/ai/skills/_system/<slug>/SKILL.md`
2. Give it valid frontmatter — `name` and a `description` rich in trigger keywords:

   ```markdown
   ---
   name: "inbuilt-database"
   description: "Use the per-app database. Triggers on: database, persist data, store data, save records, PGlite, data.query, data.migrate, CRUD, tables."
   ---

   # ...skill body the model reads when it decides this skill is relevant...
   ```

3. (Optional) add companion files in the same folder — they travel with the skill.

That's it. No code change is needed to ship a new master skill — the loader
auto-discovers every `_system/<slug>/SKILL.md`.

### Adding a skill you already have as a flat `.md` file

Got a single `my-skill.md` (no folder, maybe no frontmatter)? Convert it in two steps:

1. Make a folder named after the skill and drop the file in **as `SKILL.md`**:
   `_system/my-skill/SKILL.md` (the folder name is the slug; the file MUST be
   named `SKILL.md` — a bare `my-skill.md` is NOT discovered).
2. Ensure the file starts with a frontmatter block. If it begins with a `#`
   heading instead, prepend exactly two keys:

   ```markdown
   ---
   name: my-skill
   description: "One line rich in trigger keywords. Triggers on: keyword, keyword, ..."
   ---

   # ...your existing skill content, unchanged...
   ```

The `description` is what the model matches against to decide when to fire the
skill, so make it concrete. Then rebuild/redeploy the API image (the files ship
via the source tree). Done — no code edit required.

## How it ships (the wiring)

- `services/api/src/ai/system-skills.ts` → `getSystemSkillDirs()` resolves this
  `_system/` directory relative to the module (works in dev = `services/api` and
  in the Docker image = `/app`), and returns every subfolder that contains a
  `SKILL.md`.
- `services/api/src/ai/skills-materializer.ts` → `materializeSkillsForSession()`
  **prepends** those dirs to the `skillDirectories` it returns, in both the
  no-DB-skills and with-DB-skills branches. So system skills are always present
  and always first, independent of the DB-backed `context_skills` skills.
- The only two session entry points (`routes/chat/send-handler.ts`,
  `routes/chat/fix-error.ts`) both go through the materializer, so every build
  turn gets these dirs.

## Does the Copilot SDK use them automatically?

**Yes.** The dirs are passed to the Copilot SDK session as `skillDirectories`
(see `ai/providers/copilot-engine.ts`). The SDK **auto-discovers** each skill by
reading its `SKILL.md` frontmatter and surfaces it to the model natively — there
is no manual `<skill>` injection. The model then **auto-invokes** the relevant
skill based on the `description` matching the task. That makes the `description`
the most important field: write it with concrete trigger keywords for the
situations where the skill should fire.

## Current master skills

- `inbuilt-database/` — teaches the per-app PGlite database: `data.migrate` /
  `data.query` / `data.schema` at build time, the `created_by` RLS pattern, the
  `@doable/data` runtime client, and the Database settings tab (view / add /
  edit / delete / export records).
- `business-card-maker/` — print-ready and digital business card design: layouts,
  typography, color, print specs (bleed/DPI/CMYK), and PNG/PDF/SVG export.
- `ecommerce-website/` — conversion-focused, accessible, fast online stores
  (PLP/PDP/cart/checkout) with a design system, Core Web Vitals, WCAG 2.2, and
  PCI-safe (gateway-hosted) payments.
- `greeting-card/` — occasion-appropriate greeting cards and e-cards
  (front/inside/back) with matched tone, typography, color, and print/digital export.
- `magazine-flipbook/` — realistic web magazine/flipbook reader with page-flip
  physics, page curl, shadows, optional sound, and keyboard/touch navigation.
- `resume-cv/` — full-lifecycle resume and CV creation: ATS optimization, keyword
  mapping, achievement writing, and industry-specific formatting.
