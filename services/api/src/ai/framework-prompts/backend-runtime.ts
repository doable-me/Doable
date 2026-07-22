/**
 * Shared backend-runtime contract injected into framework prompts.
 */

export const BACKEND_RUNTIME_SNIPPET = `## Backend (platform runtime)
- Persistence schema: data.migrate + inbuilt-database (unchanged).
- App data access: named Mustache queries in .doable/backend/queries/*.sql
  — call via \`import { runtime } from "@doable/runtime"\` then \`runtime.queries.run("query_name", params)\`.
  — ⛔ Do NOT put raw SQL strings in React/components via db.query.
- Workflows reuse the SAME query names via ctx.queries.run(...).
- REST: auto CRUD (/__doable/api) for simple table admin — do not create Express.
- Automation: .doable/backend/workflows/*.workflow.js with the WorkflowContext SDK
  (queries, http, files, log, topics, secrets, integrations, messages.email/sms/whatsapp/telegram,
  schedules, users, rbac, api, callWorkflow).
- Triggers: schedules/, webhooks/, cdc/ manifests — never invent custom listeners.
- Secrets: names in secrets.refs.json only; values via platform vault.
- Before claiming done: runtime.validate + runtime.test_query / runtime.test_workflow.
- @doable/runtime is PRE-LINKED like @doable/data — never npm install it.`;
