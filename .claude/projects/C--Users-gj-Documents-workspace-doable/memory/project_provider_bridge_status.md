---
name: PRD 23+20 Implementation Status
description: Universal LLM Provider Bridge and usage tracking — what's done, what's remaining (usage dashboards)
type: project
---

PRD 23 (Provider Bridge) and PRD 20 (Usage Tracking) implementation started 2026-04-06.

**Why:** Enable users to connect any of 61 LLM providers (cloud + local) with a wizard UI, and track token/cost usage.

**How to apply:**
- Backend is complete: catalog, discovery service, API routes, usage collector wired into chat.ts, DB migrations 038-040
- Frontend provider wizard is complete (connections tab → Add Provider → 4-step wizard)
- Per-message token display (⚡ tokens · $cost · time) is wired up
- **REMAINING**: Usage dashboard pages (PRD 20 Sections 4-6) — the API routes exist but no frontend pages consume them yet
- **REMAINING**: Run migrations 038-040 on server before deploying
- See `progress/09-whats-done-whats-not.md` for full resume guide
- Rollback tag: v0.23.0-pre-provider-bridge
