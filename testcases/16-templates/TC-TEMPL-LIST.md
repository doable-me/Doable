# TC-TEMPL-LIST — Template registry: list & preview

Covers `/templates` GET, the server-side registry under `services/api/src/templates/`, and template preview UX.

---

## TC-TEMPL-LIST-001
**Title:** /templates returns array of registered templates
**Pre:** Templates registry seeded with Next.js, Vite, Python WSGI, etc.
**Steps:**
1. GET /templates
**Expected:** JSON array with id, name, description, category, framework, thumbnail_url, version, deprecated, stars.
**Severity:** Critical

## TC-TEMPL-LIST-002
**Title:** Templates filtered by framework
**Pre:** N/A
**Steps:**
1. GET /templates?framework=nextjs
**Expected:** Only Next.js templates returned.
**Severity:** High

## TC-TEMPL-LIST-003
**Title:** Templates filtered by category
**Pre:** Categories: starter, blog, e-commerce, dashboard
**Steps:**
1. GET /templates?category=blog
**Expected:** Only blog templates.
**Severity:** Medium

## TC-TEMPL-LIST-004
**Title:** Deprecated templates flagged
**Pre:** Old template marked deprecated
**Steps:**
1. GET /templates
**Expected:** Row has `deprecated:true` and optional `deprecation_reason`. UI shows badge.
**Severity:** Medium

## TC-TEMPL-LIST-005
**Title:** Deprecated templates excluded from default browse
**Pre:** N/A
**Steps:**
1. /templates without filter
**Expected:** Deprecated hidden unless `?include_deprecated=true`.
**Severity:** Medium

## TC-TEMPL-LIST-006
**Title:** Templates sorted by popularity
**Pre:** N/A
**Steps:**
1. GET /templates?sort=popular
**Expected:** Sorted by use_count desc.
**Severity:** Low

## TC-TEMPL-LIST-007
**Title:** Templates sorted by recency
**Pre:** N/A
**Steps:**
1. /templates?sort=newest
**Expected:** Order by added_at desc.
**Severity:** Low

## TC-TEMPL-LIST-008
**Title:** Template thumbnail URL valid
**Pre:** N/A
**Steps:**
1. Inspect each row
**Expected:** thumbnail_url either CDN URL or local /static/templates/<id>.png; 200 OK.
**Severity:** Medium

## TC-TEMPL-LIST-009
**Title:** Template preview page shows screenshots and README
**Pre:** Template detail
**Steps:**
1. /templates/<id>
**Expected:** Preview page with screenshots, sample code, README rendered.
**Severity:** High

## TC-TEMPL-LIST-010
**Title:** Template preview includes file tree
**Pre:** N/A
**Steps:**
1. View detail
**Expected:** Tree shows project structure user gets after scaffold.
**Severity:** Medium

## TC-TEMPL-LIST-011
**Title:** Template preview demo URL (live)
**Pre:** Hosted demo at <id>.demo.doable.me
**Steps:**
1. Click "View demo"
**Expected:** Opens live demo in new tab.
**Severity:** Low

## TC-TEMPL-LIST-012
**Title:** /templates auth — public read
**Pre:** Logged out
**Steps:**
1. GET /templates
**Expected:** 200; list visible (no auth wall).
**Severity:** High

## TC-TEMPL-LIST-013
**Title:** /templates rate limit
**Pre:** N/A
**Steps:**
1. Burst
**Expected:** 429 after threshold.
**Severity:** Low

## TC-TEMPL-LIST-014
**Title:** Template versioned
**Pre:** Template has v1.0, v1.1
**Steps:**
1. GET /templates/<id>?version=1.0
**Expected:** Returns v1.0 spec; default to latest if omitted.
**Severity:** Medium

## TC-TEMPL-LIST-015
**Title:** Template metadata: tags
**Pre:** N/A
**Steps:**
1. Inspect row
**Expected:** tags array (e.g., ['ai', 'rag', 'streaming']); used in search.
**Severity:** Low

## TC-TEMPL-LIST-016
**Title:** Template registry refresh on server start
**Pre:** Add new template file in /templates dir; restart server
**Steps:**
1. GET /templates
**Expected:** New template appears.
**Severity:** Medium

## TC-TEMPL-LIST-017
**Title:** Template registry hot-reload (dev mode only)
**Pre:** Dev server running; add new template
**Steps:**
1. Without restart, hit /templates
**Expected:** Hot-reload picks up new entry; in dev only (security).
**Severity:** Low

## TC-TEMPL-LIST-018
**Title:** Template framework agnostic init verified
**Pre:** Adapter contract per devframeworkPRD
**Steps:**
1. List templates
**Expected:** Each declares framework adapter; runner config loads correctly.
**Severity:** Medium

## TC-TEMPL-LIST-019
**Title:** Template list includes Vite, Python WSGI, Next.js
**Pre:** Default seed
**Steps:**
1. GET /templates
**Expected:** All three present at minimum.
**Severity:** Critical

## TC-TEMPL-LIST-020
**Title:** Template list includes accessibility metadata
**Pre:** N/A
**Steps:**
1. Inspect row
**Expected:** Optional `a11y_score`, `seo_friendly` flags.
**Severity:** Low

## TC-TEMPL-LIST-021
**Title:** Template list endpoint cached
**Pre:** N/A
**Steps:**
1. Hit twice
**Expected:** Cache header set; second hit fast (304 or memoized).
**Severity:** Low

## TC-TEMPL-LIST-022
**Title:** Template badges (NEW, POPULAR, COMMUNITY)
**Pre:** N/A
**Steps:**
1. View
**Expected:** Server returns badges; UI renders.
**Severity:** Low

## TC-TEMPL-LIST-023
**Title:** Template preview accessible via deep link
**Pre:** /templates/blog-starter
**Steps:**
1. Direct URL
**Expected:** 200; full preview.
**Severity:** Medium

## TC-TEMPL-LIST-024
**Title:** Template preview shows estimated build time
**Pre:** N/A
**Steps:**
1. View
**Expected:** Approximate "Builds in ~30s".
**Severity:** Low

## TC-TEMPL-LIST-025
**Title:** Template detail includes parameters schema
**Pre:** Template has params (e.g., site_title, brand_color)
**Steps:**
1. View detail
**Expected:** Form generated from schema with input types/defaults.
**Severity:** High
