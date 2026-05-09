# TC-TEMPL-REGISTRY — Server-side registry & refresh, integrity

Covers `services/api/src/templates/` registry loader, refresh endpoint, integrity checks, deprecation lifecycle.

---

## TC-TEMPL-REGISTRY-001
**Title:** Registry loads on server start
**Pre:** Server start
**Steps:**
1. Inspect logs
**Expected:** "Loaded N templates" log line; /templates returns N.
**Severity:** Critical

## TC-TEMPL-REGISTRY-002
**Title:** Registry refresh endpoint (admin)
**Pre:** Admin user
**Steps:**
1. POST /admin/templates/refresh
**Expected:** Re-scans directory; updates in-memory registry; returns counts.
**Severity:** High

## TC-TEMPL-REGISTRY-003
**Title:** Refresh endpoint forbidden to non-admins
**Pre:** Member
**Steps:**
1. POST /admin/templates/refresh
**Expected:** 403.
**Severity:** Critical

## TC-TEMPL-REGISTRY-004
**Title:** Registry detects added template
**Pre:** Drop new template into dir
**Steps:**
1. Refresh
**Expected:** Listed.
**Severity:** High

## TC-TEMPL-REGISTRY-005
**Title:** Registry detects removed template
**Pre:** Remove dir
**Steps:**
1. Refresh
**Expected:** Disappears from list; existing scaffolded projects unaffected.
**Severity:** Medium

## TC-TEMPL-REGISTRY-006
**Title:** Registry validates template manifest schema
**Pre:** Malformed manifest.json
**Steps:**
1. Refresh
**Expected:** Skipped with warning logged; valid templates still loaded.
**Severity:** High

## TC-TEMPL-REGISTRY-007
**Title:** Registry checksum each template at load
**Pre:** N/A
**Steps:**
1. Load
**Expected:** Stored sha256; mismatch on later check signals tampering.
**Severity:** Medium

## TC-TEMPL-REGISTRY-008
**Title:** Registry registers framework adapter per template
**Pre:** Adapter contract per devframeworkPRD
**Steps:**
1. Inspect loaded template
**Expected:** template.adapter resolved to known adapter id.
**Severity:** High

## TC-TEMPL-REGISTRY-009
**Title:** Registry refresh atomic (no torn state)
**Pre:** Active /templates traffic during refresh
**Steps:**
1. Refresh under load
**Expected:** Readers always see consistent snapshot.
**Severity:** Medium

## TC-TEMPL-REGISTRY-010
**Title:** Registry deprecates old template via manifest flag
**Pre:** Manifest deprecated:true
**Steps:**
1. Refresh
**Expected:** template.deprecated=true surfaced in /templates.
**Severity:** Medium

## TC-TEMPL-REGISTRY-011
**Title:** Deprecated template scaffolding still works (with warning)
**Pre:** Deprecated
**Steps:**
1. Scaffold
**Expected:** Allowed with warning.
**Severity:** Medium

## TC-TEMPL-REGISTRY-012
**Title:** Registry per-template assets path served
**Pre:** N/A
**Steps:**
1. GET /static/templates/<id>/screenshot.png
**Expected:** 200; correct image.
**Severity:** Low

## TC-TEMPL-REGISTRY-013
**Title:** Registry size warning logged
**Pre:** Template > 100MB
**Steps:**
1. Refresh
**Expected:** Warning logged; still loaded but flagged.
**Severity:** Low

## TC-TEMPL-REGISTRY-014
**Title:** Registry parameters schema validated against JSON-Schema
**Pre:** N/A
**Steps:**
1. Inspect
**Expected:** params.schema is valid JSON-Schema; bad schema rejected at load.
**Severity:** Medium

## TC-TEMPL-REGISTRY-015
**Title:** Registry handles symlink-trapped paths
**Pre:** Hostile symlink in template tree
**Steps:**
1. Load
**Expected:** Refused / traversal blocked.
**Severity:** High

## TC-TEMPL-REGISTRY-016
**Title:** Registry supports remote (S3-style) backing (future)
**Pre:** TEMPLATES_BACKEND=remote
**Steps:**
1. Load
**Expected:** Fetches manifests from configured remote; same schema applied.
**Severity:** Low

## TC-TEMPL-REGISTRY-017
**Title:** Registry tracks last_refreshed_at
**Pre:** N/A
**Steps:**
1. GET /admin/templates/status
**Expected:** Returns last_refreshed_at and counts.
**Severity:** Low

## TC-TEMPL-REGISTRY-018
**Title:** Registry warns on duplicate template ids
**Pre:** Two dirs with same id
**Steps:**
1. Refresh
**Expected:** Warning; first loaded wins; admin alerted.
**Severity:** Medium

## TC-TEMPL-REGISTRY-019
**Title:** Registry honors max template count cap
**Pre:** > 1000 templates
**Steps:**
1. Refresh
**Expected:** Loads with pagination; UI lazy-loads.
**Severity:** Low

## TC-TEMPL-REGISTRY-020
**Title:** Registry exposes adapter-bridge link for connector docs
**Pre:** Per native-integrations PRD
**Steps:**
1. Inspect
**Expected:** Each template optionally references connectors used (e.g., Stripe, Supabase).
**Severity:** Low
