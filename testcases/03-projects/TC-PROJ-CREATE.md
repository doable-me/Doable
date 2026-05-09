# TC-PROJ-CREATE — Project creation

Endpoint: `POST /projects` on `https://staging-api.doable.me`.
Validations: name 1..100 chars; slug optional, must match SLUG_REGEX (length SLUG_MIN..SLUG_MAX); description max 500; templateId UUID; folderId UUID; workspaceId UUID; prompt max 5000; frameworkId max 50.
Default framework when nothing supplied: `vite-react` (DB column default).
Enabled frameworks (default): `vite-react`, `nextjs-app`. Disabled frameworks return 403.

---

## TC-PROJ-CREATE-001 — Create project with default framework (vite-react)
- **Pre:** authenticated as qa-owner; default workspace exists with at least one slot remaining under plan limit.
- **Steps:** `POST /projects` body `{"name":"Smoke Vite","workspaceId":<wsId>}`.
- **Expected:** 201; response `data.id` is UUID; `data.framework_id === "vite-react"`; `data.status === "creating"`; later `GET /projects/:id` shows status transitioned to `draft`; `GET /projects/:id/files` lists template files (e.g. `index.html`, `src/App.tsx`, `package.json`).
- **Evidence:** save POST response, GET file tree at t+10s.
- **Severity:** smoke

## TC-PROJ-CREATE-002 — Create project explicitly with frameworkId=vite-react
- **Pre:** authenticated as qa-owner.
- **Steps:** `POST /projects` body `{"name":"Vite React Explicit","workspaceId":<wsId>,"frameworkId":"vite-react"}`.
- **Expected:** 201; `data.framework_id === "vite-react"`; project files seeded with Vite template.
- **Severity:** smoke

## TC-PROJ-CREATE-003 — Create project explicitly with frameworkId=nextjs-app
- **Pre:** authenticated as qa-owner.
- **Steps:** `POST /projects` body `{"name":"Next App","workspaceId":<wsId>,"frameworkId":"nextjs-app"}`.
- **Expected:** 201; `data.framework_id === "nextjs-app"`; eventual file tree contains `app/page.tsx`, `app/layout.tsx`, `next.config.ts` (or .js).
- **Severity:** smoke

## TC-PROJ-CREATE-004 — Create project with disabled framework returns 403
- **Pre:** authenticated as qa-owner; `DOABLE_ENABLED_FRAMEWORKS` does NOT include `django`.
- **Steps:** `POST /projects` body `{"name":"X","workspaceId":<wsId>,"frameworkId":"django"}`.
- **Expected:** 403 with body `{"error":"Framework \"django\" is currently disabled by the platform admin."}`; no project row created.
- **Severity:** high

## TC-PROJ-CREATE-005 — Create project with invalid framework id (non-existent)
- **Pre:** authenticated as qa-owner.
- **Steps:** `POST /projects` body `{"name":"X","workspaceId":<wsId>,"frameworkId":"made-up-fw"}`.
- **Expected:** 403 (framework not in enabled set) — message references the disabled framework.
- **Severity:** medium

## TC-PROJ-CREATE-006 — Framework detected from prompt heuristic ("django app")
- **Pre:** authenticated as qa-owner; `django` adapter is currently disabled by default.
- **Steps:** `POST /projects` body `{"name":"PromptDriven","workspaceId":<wsId>,"prompt":"build me a django blog"}`.
- **Expected:** detection returns `django` then enabled-set check returns 403. Verifies the resolution chain: prompt > workspace default > DB default.
- **Severity:** medium

## TC-PROJ-CREATE-007 — Framework detected from prompt heuristic ("nextjs app")
- **Pre:** authenticated as qa-owner.
- **Steps:** `POST /projects` body `{"name":"NextPrompt","workspaceId":<wsId>,"prompt":"build a nextjs marketing site"}`.
- **Expected:** 201; `data.framework_id === "nextjs-app"`.
- **Severity:** medium

## TC-PROJ-CREATE-008 — Workspace default framework applied when no explicit/prompt value
- **Pre:** workspace_ai_settings row sets `default_framework_id = 'nextjs-app'` for the workspace.
- **Steps:** `POST /projects` body `{"name":"WSDefault","workspaceId":<wsId>}`.
- **Expected:** 201; `data.framework_id === "nextjs-app"`.
- **Severity:** medium

## TC-PROJ-CREATE-009 — Empty name rejected
- **Steps:** `POST /projects` body `{"name":"","workspaceId":<wsId>}`.
- **Expected:** 400 with `error:"Validation failed"` and `details.name` non-empty array.
- **Severity:** high

## TC-PROJ-CREATE-010 — Single-character name accepted
- **Steps:** body `{"name":"A","workspaceId":<wsId>}`.
- **Expected:** 201; project created; slug fallback ("project" + base36 timestamp) when generated slug is too short.
- **Severity:** medium

## TC-PROJ-CREATE-011 — 100-character name accepted (boundary upper)
- **Steps:** body `{"name":"A".repeat(100),"workspaceId":<wsId>}`.
- **Expected:** 201.
- **Severity:** medium

## TC-PROJ-CREATE-012 — 101-character name rejected
- **Steps:** body `{"name":"A".repeat(101),"workspaceId":<wsId>}`.
- **Expected:** 400 with `details.name`.
- **Severity:** medium

## TC-PROJ-CREATE-013 — 1000-char name rejected
- **Steps:** body `{"name":"A".repeat(1000),"workspaceId":<wsId>}`.
- **Expected:** 400 with `details.name`.
- **Severity:** low

## TC-PROJ-CREATE-014 — Unicode name accepted ("プロジェクト 🚀")
- **Steps:** body `{"name":"プロジェクト 🚀","workspaceId":<wsId>}`.
- **Expected:** 201; persisted name preserves unicode; slug derived = lowercase ascii fallback (e.g. emojis stripped, fallback `project-<ts>`).
- **Severity:** medium

## TC-PROJ-CREATE-015 — Emoji-only name accepted
- **Steps:** body `{"name":"🎉🎉","workspaceId":<wsId>}`.
- **Expected:** 201; slug fallback used because regex strips emoji.
- **Severity:** low

## TC-PROJ-CREATE-016 — RTL Arabic name accepted ("مشروع جديد")
- **Steps:** body `{"name":"مشروع جديد","workspaceId":<wsId>}`.
- **Expected:** 201; name persisted exactly as provided.
- **Severity:** low

## TC-PROJ-CREATE-017 — RTL Hebrew name accepted ("פרויקט חדש")
- **Expected:** 201.
- **Severity:** low

## TC-PROJ-CREATE-018 — Whitespace-only name rejected
- **Steps:** body `{"name":"   ","workspaceId":<wsId>}`.
- **Expected:** likely 201 (zod.min(1) only checks length, not trimmed length) — assert current behavior, file bug if surprising.
- **Severity:** low

## TC-PROJ-CREATE-019 — Name with newlines and tabs preserved
- **Steps:** body `{"name":"a\nb\tc","workspaceId":<wsId>}`.
- **Expected:** 201; name field stored as-is, but slug normalises to `a-b-c`.
- **Severity:** low

## TC-PROJ-CREATE-020 — Description at 500 chars accepted (boundary)
- **Steps:** description="A".repeat(500).
- **Expected:** 201.
- **Severity:** low

## TC-PROJ-CREATE-021 — Description at 501 chars rejected
- **Expected:** 400 `details.description`.
- **Severity:** low

## TC-PROJ-CREATE-022 — Slug auto-generated from name when omitted
- **Steps:** body `{"name":"My Cool Project","workspaceId":<wsId>}`.
- **Expected:** 201; `data.slug === "my-cool-project"`.
- **Severity:** smoke

## TC-PROJ-CREATE-023 — Auto-generated slug deduplicated within workspace
- **Pre:** existing project in same workspace with slug `my-cool-project`.
- **Steps:** create new project with same name "My Cool Project".
- **Expected:** 201; `data.slug` equals first 38 chars of "my-cool-project" + "-" + base36 timestamp.
- **Severity:** high

## TC-PROJ-CREATE-024 — Explicit slug accepted when valid and unique
- **Steps:** body `{"name":"X","slug":"valid-slug","workspaceId":<wsId>}`.
- **Expected:** 201; `data.slug === "valid-slug"`.
- **Severity:** medium

## TC-PROJ-CREATE-025 — Explicit slug rejected when too short
- **Steps:** body `{"name":"X","slug":"ab","workspaceId":<wsId>}` (assuming SLUG_MIN_LENGTH=3).
- **Expected:** 400 `details.slug`.
- **Severity:** medium

## TC-PROJ-CREATE-026 — Explicit slug rejected when too long
- **Steps:** slug 100 chars (above SLUG_MAX_LENGTH typically 40).
- **Expected:** 400 `details.slug`.
- **Severity:** medium

## TC-PROJ-CREATE-027 — Explicit slug with uppercase rejected (regex enforces lower)
- **Steps:** slug="MyProj".
- **Expected:** 400 `details.slug`.
- **Severity:** medium

## TC-PROJ-CREATE-028 — Explicit slug with special chars rejected
- **Steps:** slug="my proj!".
- **Expected:** 400 `details.slug`.
- **Severity:** medium

## TC-PROJ-CREATE-029 — Explicit slug with underscores rejected (only hyphens allowed)
- **Steps:** slug="my_proj".
- **Expected:** 400 `details.slug` (assuming SLUG_REGEX disallows _; verify against constants).
- **Severity:** medium

## TC-PROJ-CREATE-030 — Explicit slug colliding with existing → server still de-dupes
- **Pre:** existing project with slug "abc".
- **Steps:** create with slug="abc".
- **Expected:** 201; server appends `-<ts>` to keep unique. Verify `data.slug !== "abc"` and starts with `abc`.
- **Severity:** high

## TC-PROJ-CREATE-031 — Slug uniqueness scoped per-workspace
- **Pre:** workspace A has project with slug "abc"; workspace B is empty.
- **Steps:** create slug="abc" in workspace B.
- **Expected:** 201 with slug exactly "abc".
- **Severity:** medium

## TC-PROJ-CREATE-032 — Missing workspaceId → uses user's first workspace
- **Pre:** user has at least one workspace (member+ role).
- **Steps:** body `{"name":"X"}` (no workspaceId).
- **Expected:** 201 in user's first workspace.
- **Severity:** medium

## TC-PROJ-CREATE-033 — User with zero workspaces → 400
- **Pre:** newly-created user with no workspace memberships.
- **Steps:** body `{"name":"X"}`.
- **Expected:** 400 `error:"No workspace found. Please create a workspace first."`.
- **Severity:** high

## TC-PROJ-CREATE-034 — workspaceId points to workspace user is NOT member of → 403
- **Pre:** workspaceId belongs to another user.
- **Steps:** body `{"name":"X","workspaceId":<otherWs>}`.
- **Expected:** 403 `error:"Access denied — requires member role or higher"`.
- **Severity:** high

## TC-PROJ-CREATE-035 — workspaceId is a viewer-only membership → 403
- **Pre:** authed user has role `viewer` in target workspace.
- **Steps:** body `{"name":"X","workspaceId":<viewerWs>}`.
- **Expected:** 403 (viewer < member).
- **Severity:** high

## TC-PROJ-CREATE-036 — Member role can create project
- **Pre:** user has role `member` in workspace.
- **Expected:** 201.
- **Severity:** smoke

## TC-PROJ-CREATE-037 — Admin role can create project
- **Expected:** 201.
- **Severity:** smoke

## TC-PROJ-CREATE-038 — Owner role can create project
- **Expected:** 201.
- **Severity:** smoke

## TC-PROJ-CREATE-039 — Plan limit enforcement on `free` plan (3 projects)
- **Pre:** workspace plan="free" with 3 existing projects.
- **Steps:** create 4th.
- **Expected:** 403 with `error` matching `/Project limit reached \(3 for free plan\)/`.
- **Severity:** high

## TC-PROJ-CREATE-040 — Plan limit enforcement on `pro` plan (25 projects)
- **Pre:** plan="pro" with 25 existing projects.
- **Steps:** create 26th.
- **Expected:** 403 with `/limit reached \(25 for pro plan\)/`.
- **Severity:** medium

## TC-PROJ-CREATE-041 — Plan limit enforcement on `team` plan (100 projects)
- **Expected:** 403 at 101st.
- **Severity:** low

## TC-PROJ-CREATE-042 — Enterprise plan = unlimited (Infinity)
- **Pre:** plan="enterprise".
- **Steps:** create 200 projects.
- **Expected:** all 201; never hits 403.
- **Severity:** low (sample 5)

## TC-PROJ-CREATE-043 — `max_projects_override` overrides plan limit
- **Pre:** workspace plan="free" with `max_projects_override = 50`; 49 existing projects.
- **Steps:** create 50th.
- **Expected:** 201; create 51st → 403 with `/limit reached \(50/`.
- **Severity:** high

## TC-PROJ-CREATE-044 — Soft-deleted projects don't count toward limit
- **Pre:** plan=free, 3 existing projects, hard-delete one (or soft-delete via deleted_at).
- **Steps:** create another.
- **Expected:** 201 if listByWorkspace excludes deleted_at; otherwise 403. Document actual behavior.
- **Severity:** medium

## TC-PROJ-CREATE-045 — Create with invalid templateId UUID → 400
- **Steps:** templateId="not-a-uuid".
- **Expected:** 400 `details.templateId`.
- **Severity:** medium

## TC-PROJ-CREATE-046 — Create with non-existent templateId UUID
- **Steps:** templateId=random valid UUID.
- **Expected:** 201 (zod doesn't check existence) — project created without template seeding. Document.
- **Severity:** low

## TC-PROJ-CREATE-047 — Create with valid templateId from registry
- **Steps:** templateId=`<saas-dashboard.id>`.
- **Expected:** 201; project_files seeded with template's codeFiles.
- **Severity:** high

## TC-PROJ-CREATE-048 — Create from "blank" template
- **Expected:** 201; minimal scaffolding files.
- **Severity:** medium

## TC-PROJ-CREATE-049 — Create from "todo-app" template
- **Expected:** 201; todo-app files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-050 — Create from "landing-page" template
- **Expected:** 201; landing-page files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-051 — Create from "ecommerce-store" template
- **Expected:** 201; ecommerce-store files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-052 — Create from "blog" template
- **Expected:** 201; blog files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-053 — Create from "portfolio" template
- **Expected:** 201; portfolio files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-054 — Create from "pwa-app" template
- **Expected:** 201; PWA manifest + service worker files seeded.
- **Severity:** medium

## TC-PROJ-CREATE-055 — Create from "nextjs-blank" template
- **Expected:** 201; framework_id=nextjs-app; minimal Next files.
- **Severity:** medium

## TC-PROJ-CREATE-056 — Create from "nextjs-todo-app" template
- **Expected:** 201; framework_id=nextjs-app.
- **Severity:** medium

## TC-PROJ-CREATE-057 — Create with folderId that exists in same workspace
- **Pre:** folder created via POST /folders.
- **Steps:** body includes `folderId`.
- **Expected:** 201; project listed under folder.
- **Severity:** high

## TC-PROJ-CREATE-058 — Create with folderId from different workspace → behavior?
- **Pre:** folder belongs to ws-B; user creates project in ws-A.
- **Expected:** Document: either 400 or it silently creates in ws-A with folder_id pointing at the wrong workspace's folder. File bug if no validation.
- **Severity:** medium

## TC-PROJ-CREATE-059 — Create with invalid folderId (random UUID) → behavior?
- **Expected:** likely 201 with folder_id set; FK should later raise on insert if FK is enforced. Document actual.
- **Severity:** low

## TC-PROJ-CREATE-060 — Create with malformed folderId (non-UUID) → 400
- **Steps:** folderId="notuuid".
- **Expected:** 400 `details.folderId`.
- **Severity:** medium

## TC-PROJ-CREATE-061 — Body is not JSON → 400
- **Steps:** raw body `not json`.
- **Expected:** 400 (Hono `c.req.json()` throws).
- **Severity:** medium

## TC-PROJ-CREATE-062 — Body is empty → 400
- **Steps:** body `{}`.
- **Expected:** 400 `details.name` required.
- **Severity:** medium

## TC-PROJ-CREATE-063 — Unauthenticated request → 401
- **Steps:** omit Authorization header.
- **Expected:** 401 from auth middleware.
- **Severity:** smoke

## TC-PROJ-CREATE-064 — Expired JWT → 401
- **Expected:** 401.
- **Severity:** medium

## TC-PROJ-CREATE-065 — JWT signed with wrong secret → 401
- **Expected:** 401.
- **Severity:** medium

## TC-PROJ-CREATE-066 — Status starts as `creating`, transitions to `draft` automatically
- **Steps:** create project, poll GET /projects/:id every 2s for up to 60s.
- **Expected:** at least one tick shows status=`creating`, eventually `draft`. Capture timestamps.
- **Severity:** smoke

## TC-PROJ-CREATE-067 — On scaffold failure status → `error`
- **Pre:** force scaffolder failure (e.g. disk full / inject env to fail).
- **Expected:** status="error" reachable.
- **Severity:** medium

## TC-PROJ-CREATE-068 — Default visibility is "private"
- **Steps:** create project, GET it.
- **Expected:** `data.visibility === "private"`.
- **Severity:** smoke

## TC-PROJ-CREATE-069 — Long prompt (5000 chars) accepted
- **Steps:** prompt = "x".repeat(5000).
- **Expected:** 201.
- **Severity:** low

## TC-PROJ-CREATE-070 — Prompt over 5000 chars → 400
- **Steps:** prompt 5001 chars.
- **Expected:** 400 `details.prompt`.
- **Severity:** low

## TC-PROJ-CREATE-071 — frameworkId longer than 50 chars → 400
- **Steps:** frameworkId="a".repeat(51).
- **Expected:** 400 `details.frameworkId`.
- **Severity:** low

## TC-PROJ-CREATE-072 — Concurrent create requests racing on slug uniqueness
- **Steps:** fire 5 simultaneous creates with same name "Race".
- **Expected:** all 201; each gets unique slug (timestamp suffix prevents collision).
- **Severity:** medium

## TC-PROJ-CREATE-073 — Plan limit racy: at limit-1 with two parallel creates
- **Pre:** plan=free, 2 existing projects (limit 3).
- **Steps:** fire 5 simultaneous creates.
- **Expected:** at most 1 succeeds (going from 2→3). The check is non-atomic — file bug if 2+ succeed (over-quota).
- **Severity:** high
