# TC-PUBLISH-SUBDOMAIN — Subdomain allocation & publish lifecycle

Covers auto-generated `<slug>.<env>.doable.me` (or `<env>-<slug>.doable.me` per Cloudflare-compatible naming), publish/republish/unpublish, status transitions, and subdomain rules.

---

## TC-PUBLISH-SUBDOMAIN-001
**Title:** Initial publish auto-generates slug from project name
**Pre:** Logged-in user with project "My Cool App" not yet published
**Steps:**
1. Open project, click Publish
2. Confirm default subdomain in dialog
3. Click Publish
**Expected:** Subdomain auto-generated as `my-cool-app` (lowercase, dashes, no spaces). Status transitions creating→building→published. Final URL is reachable.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-002
**Title:** Subdomain prefix from PUBLISH_SUBDOMAIN_PREFIX env
**Pre:** Server has `PUBLISH_SUBDOMAIN_PREFIX=staging-`; project ready to publish
**Steps:**
1. Publish project with slug `acme`
**Expected:** Final hostname is `staging-acme.doable.me` (single-level under zone), not `acme.staging.doable.me`. Resolves over HTTPS without SSL cipher mismatch.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-003
**Title:** Empty PUBLISH_SUBDOMAIN_PREFIX in production
**Pre:** Production server, `PUBLISH_SUBDOMAIN_PREFIX=` (empty)
**Steps:**
1. Publish project with slug `acme`
**Expected:** Hostname is `acme.doable.me`.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-004
**Title:** Status transitions: creating → building → published
**Pre:** Project ready
**Steps:**
1. Click Publish
2. Watch status badge in UI and `deployments` row
**Expected:** Row passes through `creating` → `building` → `published` in deployments table; UI badge updates each step.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-005
**Title:** Status transitions on build failure: creating → building → error
**Pre:** Project with intentional build error (syntax error in entry file)
**Steps:**
1. Click Publish
**Expected:** Status ends at `error` with `error_message` populated. UI shows red banner with first 500 chars of build log. No Caddy config written, no live URL.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-006
**Title:** Republish overwrites previous live artifacts
**Pre:** Project published once with version v1
**Steps:**
1. Edit project, change visible text "Hello v1" → "Hello v2"
2. Click Publish again
3. Refresh public URL (force reload)
**Expected:** Live page shows "Hello v2". Old artifacts under `/root/doable/sites/<sub>/live` replaced. Previous version retained as `previous` symlink (for rollback).
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-007
**Title:** Unpublish removes Caddy config and live files
**Pre:** Project currently published
**Steps:**
1. Open project Settings → Publish → Unpublish
2. Confirm
**Expected:** Public URL returns 404 (or Caddy default). Caddy regex no longer matches the subdomain. `live/` directory removed (or moved to `unpublished/`). `deployments.status='unpublished'`.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-008
**Title:** Subdomain collision rejected
**Pre:** User A publishes `acme`. User B owns different project.
**Steps:**
1. User B tries to publish with subdomain `acme`
**Expected:** API returns 409 Conflict with message "Subdomain already in use". UI shows inline error on the slug field. Suggests alternative `acme-2`, `acme-b`, etc.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-009
**Title:** Reserved subdomain blocked: api
**Pre:** Empty namespace
**Steps:**
1. Try to publish with subdomain `api`
**Expected:** Rejected with 400 "Subdomain reserved". Validation runs server-side regardless of UI.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-010
**Title:** Reserved subdomain blocked: ws
**Pre:** Empty namespace
**Steps:**
1. Try to publish with subdomain `ws`
**Expected:** Rejected with 400 "Subdomain reserved".
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-011
**Title:** Reserved subdomain blocked: www
**Pre:** Empty namespace
**Steps:**
1. Try to publish with subdomain `www`
**Expected:** Rejected with 400 "Subdomain reserved".
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-012
**Title:** Reserved subdomain blocked: admin, app, dashboard, root
**Pre:** Empty namespace
**Steps:**
1. Try each of: `admin`, `app`, `dashboard`, `root`, `console`, `auth`, `login`, `signup`
**Expected:** Each rejected with 400 "Subdomain reserved" and the offending value echoed.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-013
**Title:** Reserved subdomain blocked: staging, prod, dev
**Pre:** Empty namespace
**Steps:**
1. Try each of: `staging`, `prod`, `production`, `dev`, `test`, `qa`
**Expected:** Each rejected with 400 "Subdomain reserved".
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-014
**Title:** Special characters in subdomain stripped/rejected
**Pre:** New publish dialog open
**Steps:**
1. Try `My App!` → expect normalized to `my-app`
2. Try `bro.ken` → expect rejection (dot)
3. Try `under_score` → expect rejection (underscore)
4. Try `space space` → expect normalized to `space-space`
5. Try `Über` → expect rejection (non-ASCII) or punycode-normalized
**Expected:** Validator yields RFC-1123-compliant LDH (letters/digits/hyphen) lowercase only. Empty result rejected with 400.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-015
**Title:** Subdomain length cap (≤ 63 chars)
**Pre:** New publish dialog
**Steps:**
1. Enter slug of 64 chars
**Expected:** Rejected with 400 "Subdomain must be 63 characters or fewer" (DNS label limit).
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-016
**Title:** Subdomain min length
**Pre:** New publish dialog
**Steps:**
1. Enter slug of 1 char
**Expected:** Rejected with 400 "Subdomain must be at least 3 characters".
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-017
**Title:** Subdomain leading/trailing hyphen rejected
**Pre:** New publish dialog
**Steps:**
1. Try `-acme` → reject
2. Try `acme-` → reject
3. Try `--acme--` → reject
**Expected:** All rejected per RFC-1123.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-018
**Title:** Subdomain consecutive hyphens allowed but not at edges
**Pre:** New publish dialog
**Steps:**
1. Try `ac--me` (xn-- prefix excluded)
**Expected:** Allowed unless it begins with `xn--` (which would conflict with punycode). If `xn--` prefix entered, reject.
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-019
**Title:** Trailing slash in published URL handled
**Pre:** Project published, has root index.html
**Steps:**
1. Visit `https://<sub>.doable.me/`
2. Visit `https://<sub>.doable.me` (no slash)
**Expected:** Both serve the same index.html content. No redirect loop.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-020
**Title:** Trailing slash on subroute (no extension) serves directory index
**Pre:** Published project has /about/index.html
**Steps:**
1. Visit `/about` → expect 301 to `/about/`
2. Visit `/about/` → 200, index served
**Expected:** Caddy redirects bare → trailing slash for directory, 200 with content.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-021
**Title:** 404 for missing path on published site
**Pre:** Project published; only `/` exists
**Steps:**
1. Visit `/does-not-exist`
**Expected:** Returns 404 (custom 404.html if present in artifacts, otherwise Caddy default 404). No 500.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-022
**Title:** Re-using a previously unpublished subdomain
**Pre:** User unpublished `acme` 5 minutes ago
**Steps:**
1. Same user republishes another project with slug `acme`
**Expected:** Allowed. Old `unpublished` row archived. New deployment proceeds normally.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-023
**Title:** Cannot reuse another user's unpublished subdomain within cooldown
**Pre:** User A unpublished `acme` 5 minutes ago. Cooldown window is 24h.
**Steps:**
1. User B tries to claim `acme`
**Expected:** Rejected with 409 "Subdomain in cooldown until <timestamp>".
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-024
**Title:** Subdomain exceeds plan quota
**Pre:** User on Free plan with 1 publish allowed; already has 1 published
**Steps:**
1. Try to publish a second project
**Expected:** 402/403 with "Free plan allows 1 published site. Upgrade to publish more." Link to plan upgrade.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-025
**Title:** Anonymous user cannot publish
**Pre:** Logged out
**Steps:**
1. POST /deploy with project_id
**Expected:** 401 Unauthorized.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-026
**Title:** Non-owner cannot publish someone else's project
**Pre:** User A owns project P; user B logged in
**Steps:**
1. User B POST /deploy { project_id: P }
**Expected:** 403 Forbidden.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-027
**Title:** Workspace collaborator with `editor` role can publish
**Pre:** User B is editor on workspace owning project P
**Steps:**
1. User B publishes P
**Expected:** Allowed; deployment row attributes `published_by=userB`.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-028
**Title:** Workspace collaborator with `viewer` role cannot publish
**Pre:** User B is viewer on workspace owning project P
**Steps:**
1. User B clicks Publish
**Expected:** Button disabled; if API forced, 403.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-029
**Title:** Concurrent publish attempts on same project
**Pre:** Project P
**Steps:**
1. User opens 2 tabs and clicks Publish in both within 1s
**Expected:** Second request 409 "Publish already in progress for this project". First succeeds normally.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-030
**Title:** Publish concurrency: different projects, same user
**Pre:** Two projects ready
**Steps:**
1. Trigger publish on both within 1s
**Expected:** Both proceed in parallel; both end up `published`. No artifact path collision.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-031
**Title:** Subdomain rename (re-publish under new slug)
**Pre:** Project published as `oldname`
**Steps:**
1. Open Publish settings, change slug to `newname`, confirm
**Expected:** Old subdomain unpublished and Caddy config removed; new subdomain `newname` becomes live. Both events recorded in deployment history.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-032
**Title:** Slug case-insensitive matching for collision
**Pre:** `Acme` published
**Steps:**
1. Try to publish another project as `acme`
**Expected:** 409. Stored slug always lowercase.
**Severity:** Medium

## TC-PUBLISH-SUBDOMAIN-033
**Title:** Punycode/IDN slug rejected
**Pre:** New publish
**Steps:**
1. Try slug `xn--acme-7za`
**Expected:** 400 "Subdomain may not start with xn--".
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-034
**Title:** Unicode emoji slug rejected
**Pre:** New publish
**Steps:**
1. Slug = `acme🚀`
**Expected:** 400.
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-035
**Title:** Bound services on 127.0.0.1 only (no public bind)
**Pre:** Logged in to server
**Steps:**
1. After publishing, run `ss -tlnp | grep -v 127.0.0.1`
**Expected:** No service listening on 0.0.0.0 or public IP. Caddy listens 127.0.0.1; tunnel egress only.
**Severity:** Critical

## TC-PUBLISH-SUBDOMAIN-036
**Title:** Subdomain ASCII-folding for accents
**Pre:** New publish
**Steps:**
1. Slug typed `café`
**Expected:** Either rejected with clear message OR auto-normalized to `cafe` with explanation. No mojibake stored.
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-037
**Title:** Slug starts with digit allowed
**Pre:** New publish
**Steps:**
1. Slug `4me`
**Expected:** Allowed (RFC-1123 permits leading digit).
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-038
**Title:** Slug all digits allowed
**Pre:** New publish
**Steps:**
1. Slug `12345`
**Expected:** Allowed.
**Severity:** Low

## TC-PUBLISH-SUBDOMAIN-039
**Title:** Subdomain CSRF protection on publish endpoint
**Pre:** Logged in
**Steps:**
1. POST /deploy from origin not on allowlist with valid session cookie
**Expected:** 403 due to CSRF/origin check.
**Severity:** High

## TC-PUBLISH-SUBDOMAIN-040
**Title:** Server restart mid-publish recovers gracefully
**Pre:** Publish in `building` state; restart API service
**Steps:**
1. SIGTERM api; restart
2. Inspect deployment row
**Expected:** Stuck `building` rows older than 10 min reconciled to `error` with message "Publish interrupted". User can re-trigger.
**Severity:** High
