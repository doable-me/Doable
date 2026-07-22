---
name: "webhooks-and-schedules"
description: "Inbound webhooks and cron schedules — manifests, secret refs, timezone. Triggers on: webhook, inbound hook, /hooks/, cron, schedule, nightly job, recurring task, timezone, WEBHOOK_SECRET, upsert_webhook, upsert_schedule, external callback, Stripe webhook, GitHub webhook."
---

# Webhooks and Schedules

Trigger workflows from **external HTTP** or **cron** using manifests under
`.doable/backend/`. Do not invent custom public listeners or browser timers.

## Core rules

1. **Webhooks** live in `.doable/backend/webhooks/<name>.json` and bind a workflow.
2. **Schedules** live in `.doable/backend/schedules/<id>.json` with valid cron + timezone.
3. **⛔ Secret values never in source** — only a `secret_ref` name; value in vault.
4. Public path is platform-mounted: `POST /hooks/:projectId/:webhookName`.
5. Prefer tools: `runtime.upsert_webhook`, `runtime.upsert_schedule`, then validate.
6. Workflow must exist before binding; keep handlers idempotent.

## Ordered checklist

1. Write the workflow (`workflows-js`) that handles the payload / tick.
2. Add secret **name** to `secrets.refs.json` (webhooks).
3. Write webhook and/or schedule manifest (or use upsert tools).
4. Ensure vault has the secret value (owner UX / request integration).
5. `runtime.test_workflow` with fixture; `runtime.validate`.

## Copy-paste: webhook manifest

```json
{
  "name": "lead-intake",
  "workflow": "lead-intake",
  "secret_ref": "LEAD_WEBHOOK_SECRET",
  "enabled": true
}
```

Platform verifies header `x-doable-webhook-secret` (constant-time) against the
vault value for `LEAD_WEBHOOK_SECRET`.

```
POST /hooks/:projectId/lead-intake
Headers: x-doable-webhook-secret: <vault value>
Body: { "email": "a@b.com" }
```

## Copy-paste: schedule manifest

```json
{
  "id": "nightly-digest",
  "cron": "0 9 * * *",
  "timezone": "UTC",
  "workflow": "nightly-digest",
  "enabled": true
}
```

Cron: standard 5-field expression. Always set an explicit `timezone` (default UTC
if omitted — be explicit in skills/output).

## Copy-paste: secrets.refs.json snippet

```json
["LEAD_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]
```

## Anti-patterns

- ⛔ Hardcoding webhook secrets in JSON or workflow source.
- ⛔ `setInterval` / `node-cron` inside the Vite app for “nightly” jobs.
- ⛔ Custom Express route for inbound webhooks.
- ⛔ Invalid cron (`* * * * * *` 6-field) without confirming platform parser.
- ⛔ Binding a workflow id that does not exist on disk.
- ⛔ Skipping auth on “internal” webhooks.
