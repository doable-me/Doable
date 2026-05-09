# TC-PUBLISH-CUSTOM-DOMAIN — Custom domain CNAME provisioning, SSL, validation

Covers `/domains` endpoint: attaching customer-owned domains to published sites, CNAME instructions, DNS verification, Cloudflare Custom Hostname API, SSL.

---

## TC-PUBLISH-CUSTOM-DOMAIN-001
**Title:** Add custom domain — happy path
**Pre:** Published site at `acme.doable.me`; user owns example.com
**Steps:**
1. Open Settings → Custom Domain
2. Enter `www.example.com`
3. Click Add
**Expected:** UI displays CNAME instructions (`www.example.com → acme.doable.me`). Status `pending_verification`. Row in `custom_domains` table with `verification_token`.
**Severity:** Critical

## TC-PUBLISH-CUSTOM-DOMAIN-002
**Title:** Custom domain DNS verification polls every 30s
**Pre:** Pending custom domain row created
**Steps:**
1. User adds CNAME at registrar
2. Wait
**Expected:** Server-side verifier polls; once CNAME resolves correctly, status → `verified`. UI updates (no page refresh, via WS or polling).
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-003
**Title:** Custom domain TXT verification fallback
**Pre:** Apex domain (CNAME at apex disallowed by some DNS)
**Steps:**
1. User enters `example.com` (apex)
**Expected:** Instructions show ALIAS/ANAME or `_acme-challenge.example.com TXT <token>` for SSL. CNAME-flattening note shown.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-004
**Title:** Custom domain rejected — already attached to another project
**Pre:** `www.example.com` attached to project A (verified)
**Steps:**
1. User tries to add `www.example.com` to project B
**Expected:** 409 "Domain already in use by another project". Suggest contacting support.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-005
**Title:** Custom domain rejected — invalid hostname
**Pre:** New domain
**Steps:**
1. Enter `not_a_host`
2. Enter `localhost`
3. Enter `192.168.0.1`
**Expected:** Each rejected with 400 "Invalid hostname". Validation matches RFC-1123 hostname regex; rejects bare IP/local names.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-006
**Title:** Custom domain rejected — doable.me suffix
**Pre:** New domain
**Steps:**
1. Enter `mine.doable.me`
**Expected:** Rejected with 400 "Cannot use *.doable.me as a custom domain — that's our zone".
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-007
**Title:** Custom domain wildcard rejected
**Pre:** New domain
**Steps:**
1. Enter `*.example.com`
**Expected:** Rejected with 400 "Wildcards not supported on Free; upgrade to Pro for wildcard support" (or simply 400 if not yet supported).
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-008
**Title:** Cloudflare Custom Hostname API call success
**Pre:** Domain verified
**Steps:**
1. Server posts to CF /custom_hostnames
**Expected:** CF returns ID; saved as `cf_hostname_id`. Status moves to `provisioning_ssl`.
**Severity:** Critical

## TC-PUBLISH-CUSTOM-DOMAIN-009
**Title:** SSL cert issued by CF (HTTP-01 or TXT)
**Pre:** Custom hostname created on CF
**Steps:**
1. Wait for CF cert validation
2. Visit https://www.example.com
**Expected:** Returns site over valid TLS (CF Edge cert). Status → `active`.
**Severity:** Critical

## TC-PUBLISH-CUSTOM-DOMAIN-010
**Title:** SSL cert provisioning fails — show actionable error
**Pre:** DNS misconfigured (CAA blocks Let's Encrypt)
**Steps:**
1. Add domain
**Expected:** Status `ssl_failed`; UI shows "Your DNS CAA records block Let's Encrypt. Add a CAA record permitting `letsencrypt.org` or remove existing CAA". Retry button available.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-011
**Title:** Cloudflare API rate limit handled
**Pre:** Many domains added in burst
**Steps:**
1. Add 50 domains in a minute
**Expected:** Server queues calls; respects CF rate limits with backoff. No 429-induced data loss; eventually all provisioned.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-012
**Title:** Detach custom domain
**Pre:** Domain `www.example.com` active
**Steps:**
1. Click Remove
2. Confirm
**Expected:** CF Custom Hostname deleted; row marked `detached`. Caddy config updated. Visiting https://www.example.com no longer routes to this site.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-013
**Title:** Detach domain frees it for reuse by anyone
**Pre:** Detached above
**Steps:**
1. Another user adds `www.example.com`
**Expected:** Allowed; goes through normal verification flow.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-014
**Title:** Detach forced by admin (DMCA)
**Pre:** Admin moderation
**Steps:**
1. Admin marks domain takedown
**Expected:** Domain detached; user notified. Audit log entry created.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-015
**Title:** Verification timeout after 7 days
**Pre:** Domain pending verification 7+ days
**Steps:**
1. Wait
**Expected:** Status → `expired`. UI shows "Verification expired; please re-add the domain". CF Custom Hostname (if created) cleaned up.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-016
**Title:** Domain verification handles CNAME flattening (Cloudflare DNS)
**Pre:** User uses Cloudflare DNS with CNAME at apex (flattened)
**Steps:**
1. Add `example.com`
2. Add CNAME at apex (CF flattens to A records)
**Expected:** Verifier resolves the apex; sees `acme.doable.me` IP via tunnel; verification passes (using HTTP token in well-known path or special header check).
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-017
**Title:** HTTP token verification at /.well-known/doable-verify
**Pre:** Domain pending
**Steps:**
1. Visit `http://www.example.com/.well-known/doable-verify` (after CNAME)
**Expected:** Site responds with token matching DB. Verifier observes match; status → verified.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-018
**Title:** Verification token rotates on retry
**Pre:** Failed verification
**Steps:**
1. Click "Re-verify"
**Expected:** New token generated; old token invalidated; instructions update.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-019
**Title:** Multiple custom domains on one project
**Pre:** Project P
**Steps:**
1. Add `a.example.com` and `b.example.com`
**Expected:** Both attach. Visiting either serves same site. Plan limit enforced (e.g., max 5 on Pro).
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-020
**Title:** Plan limit on custom domains
**Pre:** Free plan with 0 custom domains allowed
**Steps:**
1. Add custom domain
**Expected:** 402 "Custom domains require a paid plan".
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-021
**Title:** Punycode/IDN custom domain
**Pre:** New custom domain
**Steps:**
1. Enter `xn--bcher-kva.example` (Unicode "bücher")
**Expected:** Accepted; stored in punycode. UI displays Unicode form.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-022
**Title:** Domain DNS check shows current observed records
**Pre:** Custom domain pending
**Steps:**
1. View status
**Expected:** UI shows "Currently resolves to: <IP/CNAME>" — useful for debugging.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-023
**Title:** Domain shows last verification attempt time
**Pre:** Pending or failed
**Steps:**
1. View status
**Expected:** "Last checked: 30s ago" + "Next check in: 30s".
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-024
**Title:** Manual re-check button
**Pre:** Pending
**Steps:**
1. Click "Check now"
**Expected:** Triggers immediate DNS resolve + verify; rate-limited to 1/min/domain.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-025
**Title:** Custom domain validation against allowlist (org-managed)
**Pre:** Workspace policy: only `*.companya.com` allowed
**Steps:**
1. User adds `www.companyb.com`
**Expected:** Rejected by org policy; clear message.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-026
**Title:** HSTS / security headers on custom domain
**Pre:** Active
**Steps:**
1. curl -I https://www.example.com
**Expected:** Headers include `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, optionally CSP.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-027
**Title:** HTTPS redirect from HTTP
**Pre:** Active custom domain
**Steps:**
1. curl http://www.example.com
**Expected:** 308/301 to https.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-028
**Title:** Removing project unattaches custom domain
**Pre:** Project deleted
**Steps:**
1. Delete project
**Expected:** All attached custom domains detached; CF resources cleaned. No orphan rows.
**Severity:** High

## TC-PUBLISH-CUSTOM-DOMAIN-029
**Title:** Unpublishing auto-pauses custom domain (does not delete)
**Pre:** Active custom domain
**Steps:**
1. Unpublish project
**Expected:** Domain preserved in DB but Caddy/route disabled; status `paused`. Re-publishing reactivates.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-030
**Title:** Domain admin audit log
**Pre:** Add/remove a domain
**Steps:**
1. Inspect audit log
**Expected:** Entries for `domain_added`, `verification_succeeded`, `domain_removed` with actor, ts, ip.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-031
**Title:** /domains GET lists per project
**Pre:** Two domains attached to project P
**Steps:**
1. GET /domains?project_id=P
**Expected:** Returns array with hostname, status, verification info, ssl status.
**Severity:** Medium

## TC-PUBLISH-CUSTOM-DOMAIN-032
**Title:** /domains POST validates project ownership
**Pre:** User B not on project P
**Steps:**
1. POST /domains { project_id: P, hostname: ... }
**Expected:** 403.
**Severity:** Critical

## TC-PUBLISH-CUSTOM-DOMAIN-033
**Title:** /domains DELETE forbidden for non-owner
**Pre:** Same as above
**Steps:**
1. DELETE /domains/<id>
**Expected:** 403.
**Severity:** Critical

## TC-PUBLISH-CUSTOM-DOMAIN-034
**Title:** Underscore label rejected
**Pre:** New domain
**Steps:**
1. Enter `_dmarc.example.com`
**Expected:** 400. Underscore prefix labels are non-host names.
**Severity:** Low

## TC-PUBLISH-CUSTOM-DOMAIN-035
**Title:** Trailing dot stripped
**Pre:** New domain
**Steps:**
1. Enter `www.example.com.`
**Expected:** Normalized to `www.example.com`; accepted.
**Severity:** Low
