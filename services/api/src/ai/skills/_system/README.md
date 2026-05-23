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
