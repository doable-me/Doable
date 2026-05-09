# TC-PUBLISH-CADDY-TUNNEL — Caddy config writes & Cloudflare tunnel route updates

Covers integration touchpoints with Caddy server config and Cloudflare Tunnel route management performed during publish/unpublish.

---

## TC-PUBLISH-CADDY-TUNNEL-001
**Title:** Caddy config regex matches new subdomain after publish
**Pre:** Publish slug `acme`
**Steps:**
1. After publish, visit `https://acme.<env>.doable.me`
**Expected:** Caddy regex `^([^.]+)\.<env>\.doable\.me$` (or per setup-server.sh convention) matches. Static files served from `/root/doable/sites/acme/live/`.
**Severity:** Critical

## TC-PUBLISH-CADDY-TUNNEL-002
**Title:** Caddy config writer is idempotent
**Pre:** Same publish twice
**Steps:**
1. Publish, then immediately republish
**Expected:** Caddy config not duplicated; reload still succeeds; one site block per subdomain.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-003
**Title:** Caddy reload via `caddy reload` (zero downtime)
**Pre:** Active traffic during publish
**Steps:**
1. Publish
**Expected:** Existing connections drained; new connections served from new config; no downtime.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-004
**Title:** Caddy reload failure rolls back artifacts
**Pre:** Caddy config write fails
**Steps:**
1. Publish
**Expected:** New artifact placed but live symlink not swapped; Caddy reload not attempted; publish status=error with reason. Old live continues to serve.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-005
**Title:** Caddy bind 127.0.0.1 only — no public bind
**Pre:** Inspect process state
**Steps:**
1. ss -tlnp | grep caddy
**Expected:** All listeners on 127.0.0.1 (and ::1 if needed). Nothing on 0.0.0.0.
**Severity:** Critical

## TC-PUBLISH-CADDY-TUNNEL-006
**Title:** Cloudflare Tunnel routes `*.doable.me` to local Caddy
**Pre:** Tunnel config inspectable
**Steps:**
1. Check `/etc/cloudflared/config.yml` ingress rules
**Expected:** Wildcard rule `hostname: '*.doable.me' service: http://127.0.0.1:80` (or Caddy port). Catch-all to 404.
**Severity:** Critical

## TC-PUBLISH-CADDY-TUNNEL-007
**Title:** Cloudflare Tunnel systemd auto-starts on boot
**Pre:** Reboot server
**Steps:**
1. systemctl is-enabled cloudflared
**Expected:** `enabled`; tunnel up after boot. Visiting site works without manual intervention.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-008
**Title:** Caddy SNI hostname matched correctly
**Pre:** Multiple subdomains
**Steps:**
1. curl --resolve to test SNI on multiple
**Expected:** Each gets its own site content. No cross-routing.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-009
**Title:** Tunnel disconnect graceful handling
**Pre:** Active publishing
**Steps:**
1. Restart cloudflared mid-publish
**Expected:** Public access drops briefly; backend publish continues; on reconnect URLs work.
**Severity:** Medium

## TC-PUBLISH-CADDY-TUNNEL-010
**Title:** Caddy regex respects PUBLISH_SUBDOMAIN_PREFIX
**Pre:** PREFIX=`staging-`
**Steps:**
1. Inspect Caddy config
**Expected:** Regex matches `^staging-([^.]+)\.doable\.me$`; non-prefixed hosts not matched.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-011
**Title:** Custom domain Caddy block separate from wildcard
**Pre:** `www.example.com` attached
**Steps:**
1. Inspect Caddyfile
**Expected:** Per-hostname block `www.example.com { ... reverse_proxy or root … }` distinct from wildcard.
**Severity:** Medium

## TC-PUBLISH-CADDY-TUNNEL-012
**Title:** Cloudflare API call to add tunnel hostname for custom domain
**Pre:** New custom domain added
**Steps:**
1. Add domain
**Expected:** Tunnel hostname created via CF API; or tunnel wildcard route used if matching policy.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-013
**Title:** Caddy config validated before reload
**Pre:** Publish triggers config write
**Steps:**
1. Run `caddy validate` step
**Expected:** Validation passes; reload only after validation OK. On invalid, abort and rollback.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-014
**Title:** Caddy log format includes subdomain for analytics
**Pre:** Logs in JSON
**Steps:**
1. Inspect /var/log/caddy/access.log
**Expected:** Each request logged with `host` field; can be aggregated per subdomain.
**Severity:** Low

## TC-PUBLISH-CADDY-TUNNEL-015
**Title:** /etc/caddy directory permissions
**Pre:** Inspect
**Steps:**
1. ls -la /etc/caddy
**Expected:** Owned by caddy:caddy or root:caddy; not world-writable. Config files mode 644.
**Severity:** Medium

## TC-PUBLISH-CADDY-TUNNEL-016
**Title:** Caddy config write atomic (temp file + rename)
**Pre:** Publish
**Steps:**
1. Inspect strace
**Expected:** Write to `.tmp`, rename atomically. No half-written file readable by Caddy.
**Severity:** Medium

## TC-PUBLISH-CADDY-TUNNEL-017
**Title:** Tunnel unique-name collision check
**Pre:** Two envs share Cloudflare account
**Steps:**
1. Setup script picks unique tunnel name
**Expected:** Setup detects existing tunnel and reuses or names differently (e.g., `doable-staging`).
**Severity:** Low

## TC-PUBLISH-CADDY-TUNNEL-018
**Title:** Caddy serves /robots.txt if present in artifact
**Pre:** robots.txt in project
**Steps:**
1. curl /robots.txt
**Expected:** Served from artifact; Content-Type text/plain.
**Severity:** Low

## TC-PUBLISH-CADDY-TUNNEL-019
**Title:** Caddy default 404 page when path missing
**Pre:** Artifact has no /missing
**Steps:**
1. curl /missing
**Expected:** Caddy default 404 (or custom 404.html if shipped).
**Severity:** Low

## TC-PUBLISH-CADDY-TUNNEL-020
**Title:** Caddy disables directory listing
**Pre:** Artifact dir without index.html
**Steps:**
1. curl /
**Expected:** 404, not directory listing.
**Severity:** Critical

## TC-PUBLISH-CADDY-TUNNEL-021
**Title:** Tunnel config persists after server reboot
**Pre:** Tunnel running
**Steps:**
1. Reboot
**Expected:** systemd brings cloudflared up; tunnel reconnects within 30s.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-022
**Title:** Caddy + tunnel together survive Caddy crash
**Pre:** systemd manages caddy
**Steps:**
1. kill -9 caddy
**Expected:** systemd restarts caddy. Tunnel continues; sites available within 5s.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-023
**Title:** Tunnel ingress respects Host header (no rewrite)
**Pre:** Request with custom domain
**Steps:**
1. curl -H "Host: www.example.com" via tunnel
**Expected:** Caddy receives correct Host; matches Caddy block; serves correct site.
**Severity:** High

## TC-PUBLISH-CADDY-TUNNEL-024
**Title:** Caddy access log rotation
**Pre:** Logs growing
**Steps:**
1. Wait or force logrotate
**Expected:** logrotate config present; logs rotated daily, compressed; old logs purged after 14 days.
**Severity:** Low

## TC-PUBLISH-CADDY-TUNNEL-025
**Title:** Caddy upstream retries to Vite preview
**Pre:** Backend transient down
**Steps:**
1. Request through Caddy proxy
**Expected:** Configurable retries (1–3) with backoff. Eventually 502 if persistent.
**Severity:** Medium
