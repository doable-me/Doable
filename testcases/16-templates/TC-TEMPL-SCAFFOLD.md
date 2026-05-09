# TC-TEMPL-SCAFFOLD — Scaffold a project from a template

Covers project creation from template, parameter substitution, file tree creation, sandbox safety.

---

## TC-TEMPL-SCAFFOLD-001
**Title:** Scaffold Next.js starter creates expected file tree
**Pre:** Template `nextjs-starter`
**Steps:**
1. Click "Use template"
2. Provide name "MySite"
3. Confirm
**Expected:** New project with package.json, app/, public/, next.config.ts, README. Files match template snapshot.
**Severity:** Critical

## TC-TEMPL-SCAFFOLD-002
**Title:** Scaffold Vite React creates dist-buildable project
**Pre:** Vite template
**Steps:**
1. Scaffold; trigger build
**Expected:** Build succeeds; dist/ produced.
**Severity:** Critical

## TC-TEMPL-SCAFFOLD-003
**Title:** Scaffold Python WSGI starter
**Pre:** Python template
**Steps:**
1. Scaffold
**Expected:** Files: app.py, requirements.txt, Procfile-equivalent. Runtime detected.
**Severity:** High

## TC-TEMPL-SCAFFOLD-004
**Title:** Scaffold every shipped template — smoke test
**Pre:** N templates
**Steps:**
1. For each, scaffold
**Expected:** All produce projects without error; basic file tree present.
**Severity:** High

## TC-TEMPL-SCAFFOLD-005
**Title:** Parameter substitution: {{site_title}} replaced
**Pre:** Template uses placeholders
**Steps:**
1. Provide site_title="My Awesome Site"
**Expected:** Generated files have "My Awesome Site" in place of {{site_title}}.
**Severity:** High

## TC-TEMPL-SCAFFOLD-006
**Title:** Parameter substitution escapes per file type
**Pre:** Param value contains `<` `>` `"`
**Steps:**
1. Scaffold
**Expected:** HTML files escape angle brackets; JS string-context escapes quotes; markdown preserves verbatim. No XSS-able output.
**Severity:** High

## TC-TEMPL-SCAFFOLD-007
**Title:** Required parameters enforced
**Pre:** Template requires `site_title`
**Steps:**
1. Scaffold without
**Expected:** 400 "site_title required".
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-008
**Title:** Default parameter values applied
**Pre:** Template default brand_color=#000
**Steps:**
1. Scaffold without specifying
**Expected:** #000 used.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-009
**Title:** Parameter typed validation (color, url, number)
**Pre:** Schema declares types
**Steps:**
1. Provide invalid color "notacolor"
**Expected:** 400 "Must be a hex color".
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-010
**Title:** Scaffold into existing project (overlay)
**Pre:** Existing project; click "Add template"
**Steps:**
1. Pick template; choose "Merge into existing"
**Expected:** Files merged with conflict prompts. User reviews each conflict.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-011
**Title:** Scaffold into existing project — conflict resolved by skip
**Pre:** Conflict on package.json
**Steps:**
1. Skip conflict
**Expected:** Existing file kept; non-conflicting files added.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-012
**Title:** Scaffold runs install hook (optional)
**Pre:** Template has post-scaffold hook
**Steps:**
1. Scaffold
**Expected:** Hook runs in sandbox (e.g., `pnpm install`); progress streamed.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-013
**Title:** Scaffold hook failure surfaces error
**Pre:** Hook fails (network)
**Steps:**
1. Scaffold
**Expected:** Project still created; install marked failed; user can retry.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-014
**Title:** Scaffold respects plan project quota
**Pre:** Free 5/5
**Steps:**
1. Scaffold
**Expected:** 402; upgrade hint.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-015
**Title:** Scaffold creates Yjs doc / collaboration enabled
**Pre:** N/A
**Steps:**
1. Scaffold
2. Open project
**Expected:** Collaboration ready; second user can join.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-016
**Title:** Scaffold deprecated template warns
**Pre:** Deprecated template
**Steps:**
1. Try
**Expected:** Modal "This template is deprecated; consider <alternative>". Allow proceed.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-017
**Title:** Scaffold path traversal blocked
**Pre:** Hostile template includes `../etc/passwd` file
**Steps:**
1. Scaffold
**Expected:** Sanitizer blocks; scaffold fails or skips that file with warning. No file outside project tree.
**Severity:** Critical

## TC-TEMPL-SCAFFOLD-018
**Title:** Scaffold template with binary assets (images/fonts)
**Pre:** Template includes logo.png
**Steps:**
1. Scaffold
**Expected:** Binary preserved.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-019
**Title:** Scaffold template into specific workspace
**Pre:** User in 2 workspaces
**Steps:**
1. Pick workspace at scaffold time
**Expected:** Project created under chosen workspace.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-020
**Title:** Scaffold creates README customized with project name
**Pre:** N/A
**Steps:**
1. Scaffold "MySite"
**Expected:** README opens with "# MySite" at top.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-021
**Title:** Scaffold shows progress (SSE)
**Pre:** Large template
**Steps:**
1. Scaffold
**Expected:** Progress: copying files, running hook, done.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-022
**Title:** Scaffold cancellation
**Pre:** In-flight
**Steps:**
1. Cancel
**Expected:** Process aborted; partial state cleaned up.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-023
**Title:** Scaffold respects subdomain reservation (no conflict with publish)
**Pre:** N/A
**Steps:**
1. Scaffold; later publish
**Expected:** Slug rules independent; no premature reservation.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-024
**Title:** Scaffold logs audit
**Pre:** N/A
**Steps:**
1. Inspect audit
**Expected:** `project_scaffolded` event with template_id, version, params (redacted).
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-025
**Title:** Scaffold idempotency (avoid double create on click)
**Pre:** User clicks Scaffold rapidly
**Steps:**
1. Click twice within 500ms
**Expected:** Single project created; idempotency token used.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-026
**Title:** Scaffold from URL parameter (deep link)
**Pre:** /templates/<id>/use
**Steps:**
1. Visit URL
**Expected:** Pre-fills scaffold form with template selected.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-027
**Title:** Scaffold respects framework-agnostic init contract
**Pre:** Per devframeworkPRD
**Steps:**
1. Scaffold framework X
**Expected:** Adapter applies framework-specific run/build config; preview proxy + sandbox configured.
**Severity:** High

## TC-TEMPL-SCAFFOLD-028
**Title:** Scaffold preserves file modes (executables)
**Pre:** Template script has +x
**Steps:**
1. Scaffold
**Expected:** Mode preserved or set as runnable in sandbox.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-029
**Title:** Scaffold post-hook sandboxed
**Pre:** Hook
**Steps:**
1. Hook attempts host write
**Expected:** Sandbox blocks; only project tree writable.
**Severity:** Critical

## TC-TEMPL-SCAFFOLD-030
**Title:** Scaffold use_count incremented
**Pre:** N/A
**Steps:**
1. Scaffold
**Expected:** template.use_count++; visible in registry.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-031
**Title:** Scaffold parameter form supports rich types
**Pre:** Template uses select/multiselect/file
**Steps:**
1. View form
**Expected:** Correct widgets per type; validation per type.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-032
**Title:** Scaffold parameter "skip step" for optional groups
**Pre:** Optional step
**Steps:**
1. Skip
**Expected:** Defaults applied; scaffold proceeds.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-033
**Title:** Scaffold pulls latest template version by default
**Pre:** Template v1, v2 exist
**Steps:**
1. Scaffold without version
**Expected:** v2 used.
**Severity:** Medium

## TC-TEMPL-SCAFFOLD-034
**Title:** Scaffold pinned version still usable
**Pre:** N/A
**Steps:**
1. Specify version=1.0
**Expected:** v1.0 used.
**Severity:** Low

## TC-TEMPL-SCAFFOLD-035
**Title:** Scaffold large template under size cap
**Pre:** Template ~50MB; cap 100MB
**Steps:**
1. Scaffold
**Expected:** Works; UI shows progress.
**Severity:** Low
