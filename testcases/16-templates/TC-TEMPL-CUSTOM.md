# TC-TEMPL-CUSTOM — Custom (workspace-private) templates CRUD

Covers per-workspace custom templates: create, read, update, delete; visibility scope; sharing.

---

## TC-TEMPL-CUSTOM-001
**Title:** Workspace admin creates custom template from project
**Pre:** Admin; project to publish-as-template
**Steps:**
1. Project → ⋯ → "Save as template"
2. Provide name, description, parameters
3. Save
**Expected:** Custom template stored in workspace_templates; visible to workspace members.
**Severity:** Critical

## TC-TEMPL-CUSTOM-002
**Title:** Custom template not visible outside workspace
**Pre:** Custom in workspace W
**Steps:**
1. User in workspace V hits /templates
**Expected:** Not present in their list.
**Severity:** High

## TC-TEMPL-CUSTOM-003
**Title:** Custom template editable
**Pre:** Existing custom
**Steps:**
1. Edit metadata
**Expected:** Saved.
**Severity:** Medium

## TC-TEMPL-CUSTOM-004
**Title:** Custom template re-snapshot from current project
**Pre:** Project updated
**Steps:**
1. Click "Update template snapshot"
**Expected:** Files re-captured; new version added.
**Severity:** High

## TC-TEMPL-CUSTOM-005
**Title:** Custom template permission: only workspace admins create/edit
**Pre:** Member (non-admin)
**Steps:**
1. Try to create
**Expected:** 403; UI hides controls.
**Severity:** High

## TC-TEMPL-CUSTOM-006
**Title:** Custom template scaffolding
**Pre:** N/A
**Steps:**
1. Scaffold from custom
**Expected:** Same flow as built-in; project created in workspace.
**Severity:** High

## TC-TEMPL-CUSTOM-007
**Title:** Custom template delete
**Pre:** Existing
**Steps:**
1. Admin deletes
**Expected:** Removed; new scaffolding fails 410. Existing projects unaffected.
**Severity:** Medium

## TC-TEMPL-CUSTOM-008
**Title:** Custom template share link (read-only) outside workspace
**Pre:** Setting public-link enabled
**Steps:**
1. Generate share link
**Expected:** Anyone with link can view + scaffold (creates project in their own workspace if logged in).
**Severity:** Medium

## TC-TEMPL-CUSTOM-009
**Title:** Custom template parameters definition
**Pre:** N/A
**Steps:**
1. Define schema with required/optional fields, types
**Expected:** Stored; surfaced at scaffold time.
**Severity:** High

## TC-TEMPL-CUSTOM-010
**Title:** Custom template includes thumbnail
**Pre:** N/A
**Steps:**
1. Upload thumbnail
**Expected:** Stored; surfaced in list.
**Severity:** Low

## TC-TEMPL-CUSTOM-011
**Title:** Custom template versioning
**Pre:** N/A
**Steps:**
1. Update twice
**Expected:** Versions v1, v2; users can scaffold either.
**Severity:** Medium

## TC-TEMPL-CUSTOM-012
**Title:** Custom template plan limit
**Pre:** Plan allows 3 custom templates per workspace
**Steps:**
1. Create 4th
**Expected:** 402; upgrade hint.
**Severity:** Medium

## TC-TEMPL-CUSTOM-013
**Title:** Custom template excludes secrets (.env)
**Pre:** Source project has .env
**Steps:**
1. Save as template
**Expected:** .env stripped; .env.example included if present.
**Severity:** Critical

## TC-TEMPL-CUSTOM-014
**Title:** Custom template visibility toggle (public/private)
**Pre:** Toggle public
**Steps:**
1. Make public
**Expected:** Visible in /templates for everyone (with workspace attribution).
**Severity:** Medium

## TC-TEMPL-CUSTOM-015
**Title:** Custom template moved to marketplace listing (promote)
**Pre:** Public custom
**Steps:**
1. Click "Promote to marketplace"
**Expected:** Marketplace listing draft created from template; admin moderation queue.
**Severity:** Low

## TC-TEMPL-CUSTOM-016
**Title:** Custom template audit log
**Pre:** N/A
**Steps:**
1. Inspect
**Expected:** Create/update/delete events with actor, ts.
**Severity:** Medium

## TC-TEMPL-CUSTOM-017
**Title:** Custom template archived state
**Pre:** Soft archive
**Steps:**
1. Archive
**Expected:** Hidden from default list; restorable.
**Severity:** Low

## TC-TEMPL-CUSTOM-018
**Title:** Custom template duplicate name validation
**Pre:** Existing "Internal Starter"
**Steps:**
1. Try same name
**Expected:** 409 or auto-suffix.
**Severity:** Low

## TC-TEMPL-CUSTOM-019
**Title:** Custom template ID stable across rename
**Pre:** N/A
**Steps:**
1. Rename
**Expected:** ID preserved; share links still resolve.
**Severity:** Low

## TC-TEMPL-CUSTOM-020
**Title:** Custom template source project linkage
**Pre:** N/A
**Steps:**
1. Inspect template row
**Expected:** Stores source_project_id for re-snapshot reference.
**Severity:** Medium
