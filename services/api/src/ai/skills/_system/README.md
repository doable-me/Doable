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

### Easiest: drop a raw `.md` file in and let Doable absorb it

You don't have to build the folder yourself. **Paste a raw `*.md` file directly
into this `_system/` folder** and Doable converts it into a proper
`<slug>/SKILL.md` skill automatically on the next skill load (no restart):

- The folder slug is derived from the file name (`Business Card Maker.md` →
  `business-card-maker/SKILL.md`).
- If the file already starts with a `--- … ---` frontmatter block, it is moved
  verbatim.
- If it has **no** frontmatter, Doable synthesizes `name` + `description` from
  the file's H1 and first paragraph. That works, but the auto-description is a
  rough starting point — **edit the `description` afterward** with concrete
  trigger keywords for sharper matching (the model decides when to fire a skill
  by matching its description).
- A raw file is **never** absorbed over an existing skill of the same slug — if
  `<slug>/SKILL.md` already exists, the drop-in is skipped with a warning so a
  hand-authored skill is always safe. Delete the folder first to re-absorb.

Mechanism: `absorbDropinSkills()` in `services/api/src/ai/system-skills.ts`,
invoked by `getSystemSkillDirs()` on every load. The conversion consumes the
flat file (it becomes `<slug>/SKILL.md`), so it runs once and is idempotent.

> Persistence note: on a running server the absorbed skill lives in the
> container/source tree and works immediately. For it to survive a container
> rebuild, paste the file into the source repo (or a mounted volume) — anything
> written only inside an ephemeral container is lost when it is recreated.

### Manual alternative (full control)

Prefer to author it precisely? Create the folder yourself:

1. `_system/<slug>/SKILL.md` (the file MUST be named `SKILL.md`).
2. Start it with frontmatter:

   ```markdown
   ---
   name: my-skill
   description: "One line rich in trigger keywords. Triggers on: keyword, keyword, ..."
   ---

   # ...your skill content...
   ```

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
