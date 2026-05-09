# BUG-WEB-AI-001 — Editor surfaces raw "Copilot SDK error: AI is not configured" instead of a friendly setup CTA

**Severity:** medium (UX / first-run experience)
**Found:** 2026-05-10 by lead via Chrome MCP on https://<env>.doable.me
**Test:** TC-WEB-EDITOR-AI-CONFIG-001 (new — evolved during run)
**Project under test:** /editor/88279d57-29fa-42f0-bef9-3c5dcd8fde1d

## Reproduction
1. Login as qa-owner (platform admin, enterprise plan, 100k daily credits).
2. From dashboard omnibar, type "Build a tiny todo app with React, Tailwind, and SQLite via Drizzle" and press Enter.
3. Project is created and editor loads. AI begins streaming.

## Expected
On a workspace with no Copilot/BYOK provider configured, the editor should:
- Detect the missing-provider state up-front (NOT after streaming begins).
- Show an actionable "Connect AI provider" CTA with link to /settings/ai or /admin/ai-settings.
- Avoid burning credits on requests that will surely fail.

## Actual
The chat panel emits the literal SDK error string:

> Copilot SDK error: AI is not configured for this workspace/user. Connect a GitHub Copilot account or…

Repeated multiple times. No CTA, no link, no inline "Configure" button. Live preview pane still spins on "Downloading packages… (7s)" — the sandbox provisioning continues anyway.

## Suggested fix
- Pre-flight check on POST /projects/:id/chat (or in the dashboard omnibar handler): if there's no resolvable AI provider for the active workspace, return 412 Precondition Failed with a structured body and route the user to the AI Settings panel.
- In the editor, when status is `ai_unconfigured`, render the empty-chat panel with an explicit "Connect AI provider" button.
- Optional: gate dashboard omnibar submit behind the same precondition.

## Context
Server `/opt/doable/.env` has no `COPILOT_API_KEY` (or equivalent BYOK secret). Same workspace's credit_balances row is enterprise/100k daily, so credit-side is fine — only the upstream provider is missing. This is the most common first-run trip-up after a fresh install.
