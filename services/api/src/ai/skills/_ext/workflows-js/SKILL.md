---
name: "workflows-js"
description: "Jailed workflow JS with run(ctx) — queries, db, http, files, log, topics, secrets, integrations, messages, schedules, users, rbac, api, callWorkflow. Triggers on: workflow, automation, backend job, run(ctx), .workflow.js, ctx.queries.run, webhook handler, cron job, notify Slack, send email, side effect, business process, callWorkflow."
---

# Workflows (JS)

Small jailed modules under `.doable/backend/workflows/<id>.workflow.js`.
Each exports `run(ctx)`. Prefer **`ctx.queries.run`** so UI and automation share SQL.

## Core rules

1. **Contract:** `export async function run(ctx) { … }` — no other entrypoint.
2. **Prefer `ctx.queries.run(name, params)`** over `ctx.db.query` for data access.
3. **⛔ No `process`, raw `fs`, raw `net`, or shell.** Use SDK methods only.
4. **HTTPS only** via `ctx.http.fetch`; block link-local/metadata IPs (platform-enforced).
5. Secrets via `ctx.secrets.get(name)` — names must be in `secrets.refs.json`.
6. Check `{ ok, error }` on query/API results; throw or return structured failures.
7. Keep workflows **idempotent** when retries are possible (webhooks, CDC).
8. Before done: `runtime.validate` + `runtime.test_workflow`.

## File location

```
.doable/backend/workflows/
  lead-intake.workflow.js
  nightly-digest.workflow.js
```

Workflow id = basename without `.workflow.js`.

## Full SDK surface (`ctx`)

| API | Behavior |
|-----|----------|
| **`ctx.queries.run(name, params)`** | **Preferred** — same named queries as the frontend |
| `ctx.db.query` / `ctx.db.exec` | Escape hatch only |
| `ctx.api.list/get/create/update/delete` | Auto CRUD helpers |
| `ctx.http.fetch(url, init)` | Allowlisted HTTPS |
| `ctx.files.read/write/list/delete` | Sandbox FS |
| `ctx.log.info/warn/error` | Persisted run logs |
| `ctx.topics.publish/subscribe` | Project-scoped bus |
| `ctx.secrets.get(name)` | From refs / vault only |
| `ctx.integrations.invoke(id, action, input)` | Connector proxy |
| `ctx.messages.email/sms/whatsapp/telegram` | Messaging helpers |
| `ctx.schedules.create/update/list/delete` | Manage cron specs |
| `ctx.users.*` / `ctx.rbac.*` | Auth user + roles |
| `ctx.callWorkflow(id, payload)` | Child run (depth ≤ 3) |
| `ctx.trigger` | `{ type, payload, meta }` |

## Ordered checklist

1. Ensure named queries exist and pass `runtime.test_query`.
2. Write `.workflow.js` with JSDoc `WorkflowContext` and `export async function run`.
3. Prefer `queries.run`; use messages/integrations for side effects.
4. Wire trigger: webhook / schedule / CDC / topic / manual.
5. Declare secret names in `secrets.refs.json`.
6. `runtime.test_workflow` with fixture payload; then `runtime.validate`.

## Copy-paste: webhook → query → topic

```js
/** @typedef {import("@doable/runtime").WorkflowContext} WorkflowContext */

/**
 * @param {WorkflowContext} ctx
 */
export async function run(ctx) {
  const { queries, topics, log, trigger } = ctx;

  log.info("lead webhook", { type: trigger.type });

  const email = trigger.payload?.email;
  if (!email) throw new Error("email required");

  const r = await queries.run("create_lead", {
    email,
    source: "webhook",
  });
  if (!r.ok) throw new Error(r.error?.message ?? "insert failed");

  await topics.publish("leads.created", { id: r.rows[0].id, email });
  return { ok: true, id: r.rows[0].id };
}
```

## Copy-paste: nightly digest + email

```js
/** @typedef {import("@doable/runtime").WorkflowContext} WorkflowContext */
/** @param {WorkflowContext} ctx */
export async function run(ctx) {
  const r = await ctx.queries.run("count_new_leads", {});
  if (!r.ok) throw new Error(r.error?.message ?? "count failed");
  const count = r.rows[0]?.count ?? 0;

  await ctx.messages.email({
    to: "ops@example.com",
    subject: `New leads: ${count}`,
    body: `${count} new leads since yesterday.`,
  });

  ctx.log.info("digest sent", { count });
  return { ok: true, count };
}
```

## Copy-paste: child workflow

```js
export async function run(ctx) {
  const child = await ctx.callWorkflow("notify-slack", {
    text: "Lead created",
  });
  ctx.log.info("enqueued child", { runId: child.runId });
  return { ok: true };
}
```

## Anti-patterns

- ⛔ Embedding raw SQL in the workflow when a named query already exists (or should).
- ⛔ `require("fs")` / `child_process` / hardcoding API keys in the file.
- ⛔ Browser `setInterval` pretending to be a cron job.
- ⛔ Infinite `callWorkflow` chains (depth limit 3).
- ⛔ Swallowing errors without `ctx.log.error` or a thrown failure.
- ⛔ Non-idempotent webhook handlers that double-insert on retry.
