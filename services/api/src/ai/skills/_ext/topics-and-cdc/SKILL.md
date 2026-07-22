---
name: "topics-and-cdc"
description: "CDC outbox + topic bindings — react to table changes without PGlite LISTEN. Triggers on: CDC, change data capture, outbox, bindings.json, topics, SSE, live query, subscribe, publish, on insert, after update, LISTEN, NOTIFY, realtime, leads.created, upsert_cdc_binding."
---

# Topics and CDC

React to row changes via the **platform bus** (outbox + bindings), not PGlite
`LISTEN/NOTIFY`. Topics fan out to SSE subscribers and/or workflows.

## Core rules

1. **⛔ Never use PGlite `LISTEN` / `NOTIFY`** across the pool — workers come and
   go; CDC goes through `_doable_outbox` + platform bus.
2. Bindings live in `.doable/backend/cdc/bindings.json`.
3. Topics are declared in `.doable/backend/topics/manifest.json` (optional but preferred).
4. Binding target: `topic` and/or `workflow` (at least one).
5. Table must exist (`data.schema`) before binding — validate will fail otherwise.
6. Prefer `runtime.upsert_cdc_binding`; then `runtime.validate`.
7. UI live updates: `runtime.topics.subscribe`; workflows: `ctx.topics.publish`.

## Mental model

```
DML success (query / CRUD / workflow db)
  → optional _doable_outbox row
  → bus.publish(proj:{id}:cdc, ChangeEvent)
  → matching bindings → enqueue workflow and/or topic alias
  → SSE subscribers on /__doable/topics/:name/subscribe
```

## Ordered checklist

1. Confirm table exists and mutations go through runtime/data paths (so CDC emits).
2. Declare topic names in `topics/manifest.json`.
3. Add CDC bindings (ops: insert / update / delete).
4. Optionally write a workflow that consumes CDC trigger payload.
5. UI: `runtime.topics.subscribe("leads.created", handler)`.
6. `runtime.validate`.

## Copy-paste: CDC bindings

```json
{
  "bindings": [
    {
      "id": "leads-to-topic",
      "table": "leads",
      "ops": ["insert", "update"],
      "topic": "leads.changed",
      "workflow": null
    },
    {
      "id": "leads-notify",
      "table": "leads",
      "ops": ["insert"],
      "workflow": "notify-slack",
      "topic": null
    }
  ]
}
```

## Copy-paste: topics manifest

```json
{
  "topics": [
    { "name": "leads.created", "description": "Fired when a lead is created" },
    { "name": "leads.changed", "description": "Lead insert or update" }
  ]
}
```

## Copy-paste: publish / subscribe

```ts
import { runtime } from "@doable/runtime";

const unsub = runtime.topics.subscribe("leads.created", (ev) => {
  console.log("lead event", ev);
});
// later: unsub();
```

```js
// Workflow
export async function run(ctx) {
  await ctx.topics.publish("leads.created", {
    id: ctx.trigger.payload?.id,
  });
  return { ok: true };
}
```

## Anti-patterns

- ⛔ `LISTEN leads_channel` / trigger functions that only NOTIFY.
- ⛔ Polling tables every second from the browser instead of topics.
- ⛔ Binding to a table that was never migrated.
- ⛔ Publishing huge row payloads without need (keep events small).
- ⛔ Assuming multi-node delivery without the platform bus (v1 is in-process).
