# TC-GH-WEBHOOK — Webhook for push events from GitHub

Covers webhook registration, signature verification, push events updating doable, error handling.

---

## TC-GH-WEBHOOK-001
**Title:** Webhook auto-registered on connect (optional flow)
**Pre:** Repo connected
**Steps:**
1. After connect
**Expected:** Server creates webhook on GH (if scope allows): events=[push], url=https://api.doable.me/github/webhook, secret=random. Stored in project_github_links.webhook_id + secret.
**Severity:** High

## TC-GH-WEBHOOK-002
**Title:** Webhook signature verified on receipt
**Pre:** Webhook configured
**Steps:**
1. GH sends push event with X-Hub-Signature-256
**Expected:** Server verifies HMAC SHA-256 with stored secret; mismatch → 401, no processing.
**Severity:** Critical

## TC-GH-WEBHOOK-003
**Title:** Webhook with bogus signature rejected
**Pre:** Attacker forges
**Steps:**
1. POST /github/webhook with fake sig
**Expected:** 401; logged.
**Severity:** Critical

## TC-GH-WEBHOOK-004
**Title:** Webhook for push triggers project update notification
**Pre:** Verified webhook
**Steps:**
1. Push to remote outside doable
2. Receive webhook
**Expected:** Project marked "Remote has new changes; click Pull"; in-app banner.
**Severity:** High

## TC-GH-WEBHOOK-005
**Title:** Webhook auto-pull (optional setting)
**Pre:** auto_pull=true on link
**Steps:**
1. Push outside doable
**Expected:** Server triggers pull; if no conflicts, applies; UI updates live via WS.
**Severity:** Medium

## TC-GH-WEBHOOK-006
**Title:** Webhook event logged
**Pre:** N/A
**Steps:**
1. Receive event
**Expected:** github_webhook_events row with event_type, sha, ts, raw_payload (truncated).
**Severity:** Medium

## TC-GH-WEBHOOK-007
**Title:** Webhook deduplication (GH delivers retries with same id)
**Pre:** Same X-GitHub-Delivery seen
**Steps:**
1. GH retries
**Expected:** Server detects duplicate; returns 200 quickly; no double processing.
**Severity:** High

## TC-GH-WEBHOOK-008
**Title:** Webhook unhandled event types accepted, no-op
**Pre:** GH sends `pull_request` event
**Steps:**
1. Receive
**Expected:** 200 with "ignored"; no action; logged at debug level.
**Severity:** Low

## TC-GH-WEBHOOK-009
**Title:** Webhook unsubscribe on disconnect
**Pre:** Connected; webhook id stored
**Steps:**
1. Disconnect repo
**Expected:** Server calls GH DELETE /repos/<>/hooks/<id>; row cleaned up.
**Severity:** High

## TC-GH-WEBHOOK-010
**Title:** Webhook secret rotation
**Pre:** Existing webhook
**Steps:**
1. Admin rotates server-side secret
**Expected:** Server updates GH webhook secret; old signatures rejected.
**Severity:** Low

## TC-GH-WEBHOOK-011
**Title:** Webhook URL on staging vs prod
**Pre:** Multi-env
**Steps:**
1. Staging connects; prod connects
**Expected:** Each env registers its own webhook URL; doesn't collide.
**Severity:** Medium

## TC-GH-WEBHOOK-012
**Title:** Webhook receive 10MB payload
**Pre:** Large push
**Steps:**
1. Receive
**Expected:** Accepted; bounded by max_body; processed.
**Severity:** Low

## TC-GH-WEBHOOK-013
**Title:** Webhook delayed processing queued
**Pre:** Burst of events
**Steps:**
1. 100 events in 10s
**Expected:** All accepted with 200 quickly; processing queued; user sees latest state eventually.
**Severity:** Medium

## TC-GH-WEBHOOK-014
**Title:** Webhook ping event handled
**Pre:** New webhook setup
**Steps:**
1. GH sends ping
**Expected:** 200 with `{ok:true}`; no project state change.
**Severity:** Low

## TC-GH-WEBHOOK-015
**Title:** Webhook signing secret encrypted at rest
**Pre:** Inspect storage
**Steps:**
1. Inspect project_github_links.webhook_secret
**Expected:** Encrypted (or hashed for verify-only); plaintext never logged.
**Severity:** Critical

## TC-GH-WEBHOOK-016
**Title:** Webhook retry on user-facing transient error
**Pre:** Server-side processing fails 500
**Steps:**
1. Receive event
**Expected:** Returns 500; GH retries per its policy; on success, processed.
**Severity:** Medium

## TC-GH-WEBHOOK-017
**Title:** Webhook user-agent check (GitHub-Hookshot/...)
**Pre:** N/A
**Steps:**
1. Random UA POSTs to webhook
**Expected:** Even if no UA check, signature alone protects; UA logged for analytics.
**Severity:** Low

## TC-GH-WEBHOOK-018
**Title:** Webhook respects rate limit per project
**Pre:** Many bursts
**Steps:**
1. Burst
**Expected:** Server processes serially per project; backpressure on queue.
**Severity:** Low

## TC-GH-WEBHOOK-019
**Title:** Push event from non-tracked branch ignored
**Pre:** Project tracks `main`; webhook fires for `feature-x`
**Steps:**
1. Receive
**Expected:** No notification to user; logged but no UI banner.
**Severity:** Low

## TC-GH-WEBHOOK-020
**Title:** Webhook can be disabled per project (setting)
**Pre:** Setting webhooks_enabled=false
**Steps:**
1. Open settings; toggle off
**Expected:** Server disables webhook on GH (or marks ignore locally); user must manually pull.
**Severity:** Medium
