---
name: "secrets-and-refs"
description: "Secret names only in secrets.refs.json — vault resolves values at runtime. Triggers on: secrets.refs.json, API key, webhook secret, STRIPE_SECRET, vault, env var, credentials, ctx.secrets.get, hardcode secret, .env commit, password in source."
---

# Secrets and Refs

AI and source may only see **secret names**. Values live in the platform vault
(or env-var bridge) and resolve inside the workflow jail via `ctx.secrets.get`.

## Core rules

1. **Names only** in `.doable/backend/secrets.refs.json` — a JSON array of strings.
2. **⛔ Never put secret values** in SQL, workflows, React, manifests, or committed `.env`.
3. Webhook manifests reference names via `secret_ref`, not literal tokens.
4. Workflows read with `await ctx.secrets.get("NAME")` — returns `null` if unset.
5. If a value is missing, guide the owner to vault UX / `request_integration` —
   do not invent a placeholder secret in code.
6. Do not log secret values (`ctx.log` may redact, but never print them intentionally).

## Ordered checklist

1. Decide which names the feature needs (`STRIPE_SECRET`, `LEAD_WEBHOOK_SECRET`, …).
2. Append names to `secrets.refs.json` (dedupe).
3. Wire manifests / workflows to those names only.
4. Remind owner to set values in project vault.
5. `runtime.validate` (refs present; no obvious value literals in backend files).

## Copy-paste: refs file

```json
[
  "LEAD_WEBHOOK_SECRET",
  "STRIPE_SECRET",
  "SLACK_BOT_TOKEN"
]
```

## Copy-paste: workflow usage

```js
/** @param {import("@doable/runtime").WorkflowContext} ctx */
export async function run(ctx) {
  const token = await ctx.secrets.get("SLACK_BOT_TOKEN");
  if (!token) throw new Error("SLACK_BOT_TOKEN not configured in vault");

  const res = await ctx.http.fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: "#leads", text: "New lead" }),
  });
  if (!res.ok) throw new Error(`slack ${res.status}`);
  return { ok: true };
}
```

## Copy-paste: webhook secret_ref

```json
{
  "name": "stripe",
  "workflow": "stripe-events",
  "secret_ref": "STRIPE_WEBHOOK_SECRET",
  "enabled": true
}
```

## Anti-patterns

- ⛔ `const KEY = "sk_live_…"` in any project file.
- ⛔ Committing `.env` with real credentials.
- ⛔ Putting the webhook secret string inside `webhooks/*.json`.
- ⛔ Passing secrets to the browser / `runtime` client.
- ⛔ Using a secret name that is not listed in `secrets.refs.json`.
