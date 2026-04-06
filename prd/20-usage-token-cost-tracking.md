# 20 — Usage, Token & Cost Tracking

## Overview

Doable currently has no visibility into AI token consumption, cost attribution, or per-request usage metrics. The credit system exists ([PRD 11](11-pricing-billing.md)) but token counts are never extracted from provider responses, `consumeCredits()` is never called from the chat route, and the `credit_usage_log` table's `prompt_tokens`/`completion_tokens`/`model` columns are always NULL.

This PRD specifies a **complete usage observability system** — from per-request token extraction at the provider layer, through aggregation and storage, to dashboards at every scope: **per-user**, **per-project**, **per-workspace**, and **platform-wide (admin)**. It also covers cost estimation, budget controls, usage alerts, and the API surface needed to power all of it.

> **Why this matters now**: Without usage tracking, we can't enforce credit limits, can't bill accurately, can't help users understand their consumption, and admins have zero visibility into platform costs. This is foundational infrastructure that blocks accurate billing ([PRD 11](11-pricing-billing.md)), enterprise usage dashboards ([PRD 15](15-development-phases.md) Phase 3), and cost-aware AI routing.

---

## 1. Token Extraction Layer

### 1.1 The Problem

The Copilot SDK sends **rich usage events** that the chat route explicitly discards. With [PRD 23](23-universal-llm-provider-bridge.md) adding support for 61 providers (39 cloud + 22 local), usage tracking becomes critical — users paying for BYOK API keys need visibility into their spend.

**Current state of SDK usage events (all discarded in `chat.ts:2521-2522`):**

| SDK Event | Data Available | Currently Captured |
|-----------|---------------|-------------------|
| **`assistant.usage`** | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cost`, `duration`, `ttftMs`, `interTokenLatencyMs`, `model`, `apiCallId`, `copilotUsage[]` | **Discarded** |
| **`session.shutdown`** | `totalPremiumRequests`, `totalApiDurationMs`, per-model `modelMetrics` (requests, usage breakdown), `codeChanges` (linesAdded/Removed/filesModified) | **Discarded** |
| **`session.usage_info`** | `tokenLimit`, `currentTokens`, `messagesLength`, `systemTokens`, `conversationTokens`, `toolDefinitionsTokens` | **Discarded** |
| **`session.truncation`** | `preTruncationTokensInMessages`, `postTruncationTokensInMessages`, `tokensRemovedDuringTruncation` | **Discarded** |
| **`session.compaction_complete`** | `preCompactionTokens`, `postCompactionTokens`, `compactionTokensUsed` (input/output/cachedInput) | **Discarded** |

**Provider response usage formats (all 61 providers via [PRD 23](23-universal-llm-provider-bridge.md)):**

| Provider Type | Usage Format | Notes |
|---------------|-------------|-------|
| **OpenAI-compatible** (37 providers) | `usage: { prompt_tokens, completion_tokens, total_tokens }` | Standard format; some add extensions |
| **Anthropic** (1 provider) | `usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` | 4-category token breakdown |
| **Azure OpenAI** (1 provider) | Same as OpenAI | Via Azure headers |
| **OpenRouter** | OpenAI format + `usage.cost` field (unique: includes cost in response) | Only provider that returns cost directly |
| **Groq** | OpenAI format + `queue_time`, `prompt_time`, `completion_time`, `total_time` | Includes timing data |
| **Local engines** (22 engines) | OpenAI format (when available) | Some local engines don't return usage; may need client-side estimation |

### 1.2 Extraction Points

Token extraction happens via **SDK session events** (primary path) and **provider response parsing** (fallback for direct API calls).

**Primary path — Copilot SDK events (covers all 61 providers via BYOK):**

| Event | Extraction Point | Data to Capture |
|-------|-----------------|-----------------|
| **`assistant.usage`** | `session.on("assistant.usage")` — emitted per API call | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cost`, `duration`, `ttftMs`, `model` |
| **`session.shutdown`** | `session.on("session.shutdown")` — emitted at session end | `totalPremiumRequests`, per-model `modelMetrics`, `codeChanges` |
| **`session.usage_info`** | `session.on("session.usage_info")` — context window snapshot | `tokenLimit`, `currentTokens`, `systemTokens`, `conversationTokens` |

**Fallback path — direct Anthropic API (secondary system, not currently active):**

| Event | Extraction Point | Data to Capture |
|-------|-----------------|-----------------|
| `message_start` SSE | `AnthropicProvider.complete()` | `usage.input_tokens` |
| `message_delta` SSE | `AnthropicProvider.complete()` | `usage.output_tokens` |
| Response headers | All requests | `x-ratelimit-*` for rate awareness |

**Client-side estimation (for providers that don't return token counts):**

Some local engines (GPT4All, older Ollama versions) may not return usage data. In these cases, estimate using `tiktoken` with `cl100k_base` encoding:
- Input: encode messages array, add ChatML overhead `(messageCount * 3) + contentTokens + 5`
- Output: encode response text
- For inputs >10KB, fallback to `characterCount / 8`
- Mark `tokens_available = false` in the usage log

### 1.3 Provider Response Interface

Every provider MUST return a standardized usage object alongside the response:

```
UsageMetrics {
  provider          — "copilot" | "anthropic" | "openai" | "azure" | preset_id from PRD 23
  model             — exact model identifier (e.g., "claude-sonnet-4-20250514")
  promptTokens      — input token count
  completionTokens  — output token count
  totalTokens       — sum (or provider-reported total)
  thinkingTokens    — extended thinking tokens (Anthropic, if applicable)
  cacheCreationTokens — cache creation/write tokens (Anthropic/Copilot SDK)
  cacheReadTokens   — cache-hit/read tokens (Anthropic/Copilot SDK)
  toolCallCount     — number of tool invocations in this request
  estimatedCostUsd  — calculated from model pricing table
  durationMs        — wall-clock time from request start to completion
  ttftMs            — time to first token (from SDK's assistant.usage event)
  tokensAvailable   — boolean: whether provider returned real token data
  byokProviderId    — uuid FK: which BYOK provider was used (nullable, for cost attribution)
}
```

> **Note on the 4-category token model**: Following the pattern established by Anthropic's API and the Copilot SDK's `assistant.usage` event, we track **four** token categories: `promptTokens` (input), `completionTokens` (output), `cacheCreationTokens` (cache writes), and `cacheReadTokens` (cache hits). This matches what CCS tracks in its `ModelBreakdown` type and enables accurate cost calculation for providers with cache-based pricing (Anthropic, OpenAI). For providers that only report 2 categories (input/output), cache fields are stored as 0.

### 1.4 Cost Estimation

A **model pricing table** stored in the database (editable by platform admin) maps model identifiers to per-token costs. With 61 providers ([PRD 23](23-universal-llm-provider-bridge.md)), the pricing registry must support multi-step model name resolution:

| Column | Type | Description |
|--------|------|-------------|
| `model_id` | text PK | Model identifier (e.g., "claude-sonnet-4-20250514") |
| `provider` | text | Provider name or preset_id |
| `display_name` | text | Human-readable name |
| `input_cost_per_1m` | numeric | USD cost per 1M input tokens |
| `output_cost_per_1m` | numeric | USD cost per 1M output tokens |
| `thinking_cost_per_1m` | numeric | USD cost per 1M thinking tokens (nullable) |
| `cache_creation_cost_per_1m` | numeric | USD cost per 1M cache creation tokens (nullable) |
| `cache_read_cost_per_1m` | numeric | USD cost per 1M cache read tokens (nullable) |
| `is_active` | boolean | Whether this model is currently available |
| `updated_at` | timestamptz | Last price update |

**Cost calculation** (4-category model, following CCS pattern):
```
estimatedCostUsd =
  (promptTokens / 1M) * input_cost_per_1m
  + (completionTokens / 1M) * output_cost_per_1m
  + (cacheCreationTokens / 1M) * cache_creation_cost_per_1m
  + (cacheReadTokens / 1M) * cache_read_cost_per_1m
```

**Model name resolution** (multi-step, following CCS's approach):
1. Exact match against `model_id`
2. Normalized match (lowercase, strip provider prefixes like `openrouter/`)
3. Strip date suffixes (e.g., `-20250514`)
4. Alias lookup (e.g., `gpt-4o` → `gpt-4o-2024-08-06`)
5. Family prefix match (e.g., `claude-sonnet-4*` → base Claude Sonnet 4 pricing)
6. Unknown fallback: `$3/$15` per 1M tokens (configurable)

**Initial pricing data** (seeded from provider documentation — covers top models across all 61 providers):

| Model | Provider | Input/1M | Output/1M | Cache Create/1M | Cache Read/1M |
|-------|----------|----------|-----------|-----------------|---------------|
| claude-opus-4-6 | Anthropic | $5.00 | $25.00 | $6.25 | $0.50 |
| claude-sonnet-4-6 | Anthropic | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5 | Anthropic | $1.00 | $5.00 | $1.25 | $0.10 |
| gpt-4.1 | OpenAI | $2.00 | $8.00 | — | — |
| gpt-4.1-mini | OpenAI | $0.40 | $1.60 | — | — |
| gpt-4o | OpenAI | $2.50 | $10.00 | — | $1.25 |
| o3 | OpenAI | $2.00 | $8.00 | — | — |
| o4-mini | OpenAI | $1.10 | $4.40 | — | — |
| gemini-2.5-pro | Google | $1.25 | $10.00 | — | — |
| gemini-2.5-flash | Google | $0.15 | $0.60 | — | — |
| deepseek-v3.2 | DeepSeek | $0.28 | $0.42 | — | $0.028 |
| llama-3.3-70b | Groq/Together/etc. | $0.59 | $0.79 | — | — |
| mistral-large | Mistral | $2.00 | $6.00 | — | — |
| grok-4 | xAI | $3.00 | $15.00 | — | — |

> **BYOK cost attribution**: When a user uses their own API key (BYOK), cost is calculated the same way but attributed to the user, not the platform. The `byokProviderId` field in `ai_usage_log` links to the `ai_providers` table from [PRD 23](23-universal-llm-provider-bridge.md), enabling per-provider spend tracking.

> **GitHub Copilot subscription**: For users using GitHub Copilot subscription (not BYOK), the SDK's `assistant.usage.cost` field represents a billing multiplier, not USD. The `copilotUsage` array in the event contains itemized breakdowns. For Copilot subscription users, `estimatedCostUsd` should be calculated from the model's public pricing (same as if they were calling the API directly), clearly labeled as "estimated" since their actual cost is covered by the subscription.

> **Local providers**: Local inference engines (Ollama, LM Studio, vLLM, etc.) have $0 token cost. The pricing table should have entries with `0.00` costs for local provider models. Track tokens for context window awareness, but display cost as "$0.00 (local)" in the UI.

> **OpenRouter special case**: OpenRouter is unique among providers — it returns the actual `cost` directly in the API response's `usage` object. When the provider is OpenRouter, prefer the provider-reported cost over our calculated estimate.

---

## 2. Usage Storage Schema

### 2.1 Per-Request Log: `ai_usage_log`

The existing `credit_usage_log` table is repurposed and extended. A new `ai_usage_log` table provides granular per-request tracking:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Unique request ID |
| `user_id` | uuid FK | User who triggered the request |
| `workspace_id` | uuid FK | Owning workspace |
| `project_id` | uuid FK (nullable) | Project context |
| `session_id` | text FK (nullable) | AI session ID |
| `provider` | text | Provider used — see Provider Identification below |
| `provider_label` | text | Human-readable provider name (e.g., "GitHub Copilot", "OpenRouter (My Key)", "Ollama (local)") |
| `model` | text | Model identifier |
| `mode` | text | AI mode (agent, plan, chat, visual-edit) |
| `prompt_tokens` | integer (nullable) | Input tokens |
| `completion_tokens` | integer (nullable) | Output tokens |
| `thinking_tokens` | integer (nullable) | Extended thinking tokens |
| `cached_tokens` | integer (nullable) | Cache-hit tokens |
| `total_tokens` | integer (nullable) | Total tokens |
| `tool_call_count` | integer | Number of tool invocations |
| `cache_creation_tokens` | integer (nullable) | Cache write tokens (Anthropic/SDK) |
| `cache_read_tokens` | integer (nullable) | Cache hit tokens (Anthropic/SDK) |
| `estimated_cost_usd` | numeric(12,6) | Estimated cost in USD |
| `credits_consumed` | integer | Credits deducted |
| `duration_ms` | integer | Request wall-clock time |
| `ttft_ms` | integer (nullable) | Time to first token (from SDK) |
| `tokens_available` | boolean | Whether provider returned token data |
| `byok_provider_id` | uuid FK (nullable) | BYOK provider used (refs ai_providers from PRD 23) |
| `is_local` | boolean | Whether the provider is a local engine ($0 cost) |
| `error` | text (nullable) | Error message if request failed |
| `created_at` | timestamptz | Request timestamp |

**Provider Identification**: The `provider` field distinguishes the billing source, not just the API type:

| `provider` value | `byok_provider_id` | Meaning |
|-----------------|---------------------|---------|
| `copilot` | NULL | GitHub Copilot subscription (cost covered by subscription) |
| `byok` | UUID → `ai_providers` | User's own API key (cost billed to user's account with that provider) |
| `local` | UUID → `ai_providers` | Local engine like Ollama, LM Studio ($0 cost) |

The `provider_label` is denormalized for fast dashboard rendering — e.g., "GitHub Copilot", "OpenRouter (My API Key)", "Ollama (local)". It's derived from `ai_providers.label` for BYOK/local, or hardcoded as "GitHub Copilot" for subscription.

This enables **usage grouped by provider** at every dashboard level:
- "You spent $4.20 on OpenRouter, $1.80 on Anthropic Direct, and $0.00 on Ollama this month"
- "GitHub Copilot handled 340 requests (subscription), BYOK providers handled 120 requests ($6.00)"
- Per-provider trend charts, per-provider model breakdowns

**Copilot Session Tracking**: The `session_id` links to `ai_sessions.copilot_session_id` (added in migration 037), enabling per-session usage rollups. A single Copilot SDK session may span multiple `assistant.usage` events (one per API call within the session's agentic loop). The `session.shutdown` event provides the authoritative session-level totals via `modelMetrics`.

**Indexes:**
- `(user_id, created_at DESC)` — user usage history
- `(workspace_id, created_at DESC)` — workspace usage history
- `(project_id, created_at DESC)` — project usage history
- `(provider, created_at DESC)` — per-provider usage queries
- `(byok_provider_id, created_at DESC)` — per-BYOK-key usage
- `(session_id, created_at DESC)` — per-session usage rollup
- `(created_at)` — time-series queries and cleanup

### 2.2 Daily Aggregates: `ai_usage_daily`

Pre-computed daily rollups for fast dashboard rendering. Updated via trigger or periodic aggregation:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Row ID |
| `date` | date | Aggregation date |
| `user_id` | uuid FK | User |
| `workspace_id` | uuid FK | Workspace |
| `project_id` | uuid FK (nullable) | Project (NULL = workspace-level aggregate) |
| `provider` | text | Provider |
| `model` | text | Model |
| `request_count` | integer | Number of AI requests |
| `total_prompt_tokens` | bigint | Sum of prompt tokens |
| `total_completion_tokens` | bigint | Sum of completion tokens |
| `total_thinking_tokens` | bigint | Sum of thinking tokens |
| `total_tokens` | bigint | Sum of all tokens |
| `total_cost_usd` | numeric(12,6) | Sum of estimated cost |
| `total_credits` | integer | Sum of credits consumed |
| `total_duration_ms` | bigint | Sum of request durations |
| `avg_tokens_per_request` | integer | Average tokens per request |
| `tool_call_count` | integer | Total tool invocations |

**Unique constraint:** `(date, user_id, workspace_id, project_id, provider, model)` — one row per dimension combination per day.

**Indexes:**
- `(workspace_id, date DESC)` — workspace dashboard
- `(user_id, date DESC)` — user dashboard
- `(date)` — admin time-series

### 2.3 Monthly Aggregates: `ai_usage_monthly`

Same structure as `ai_usage_daily` but with `month` (date, first of month) instead of `date`. Used for billing period summaries and trend charts.

### 2.4 Aggregation Strategy

| Approach | When | Method |
|----------|------|--------|
| **Real-time insert** | Every AI request | Insert into `ai_usage_log` |
| **Daily rollup** | Once per day (midnight UTC) | `INSERT ... ON CONFLICT DO UPDATE` aggregating from `ai_usage_log` |
| **Monthly rollup** | Once per day | Aggregate from `ai_usage_daily` |
| **On-demand refresh** | Dashboard load | If today's row is stale, re-aggregate from `ai_usage_log` for today |
| **Retention** | 90 days (configurable) | Delete `ai_usage_log` rows older than retention period; daily/monthly aggregates kept indefinitely |

---

## 3. API Routes

### 3.1 User Usage API

Available to any authenticated user for their own data:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/usage/me` | GET | Current user's usage summary (today, this week, this month) |
| `/usage/me/history` | GET | Usage history with date range, grouping (day/week/month) |
| `/usage/me/breakdown` | GET | Breakdown by project, model, mode |
| `/usage/me/requests` | GET | Paginated list of individual AI requests |

**Query Parameters** (all endpoints):
- `workspaceId` — required, scopes to workspace
- `from` / `to` — date range (default: last 30 days)
- `projectId` — optional filter
- `provider` — optional filter
- `model` — optional filter
- `mode` — optional filter (agent/plan/chat)
- `groupBy` — day, week, month (for history/breakdown)

### 3.2 Workspace Admin Usage API

Available to workspace owners and admins:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workspaces/:id/usage` | GET | Workspace-wide usage summary |
| `/workspaces/:id/usage/history` | GET | Workspace usage over time |
| `/workspaces/:id/usage/members` | GET | Per-member usage breakdown |
| `/workspaces/:id/usage/projects` | GET | Per-project usage breakdown |
| `/workspaces/:id/usage/models` | GET | Per-model/provider cost breakdown |
| `/workspaces/:id/usage/providers` | GET | Per-provider cost breakdown (Copilot sub vs. each BYOK key vs. local) |
| `/workspaces/:id/usage/sessions` | GET | Per-Copilot-session usage (tokens, cost, duration, tool calls per session) |
| `/workspaces/:id/usage/members/:userId` | GET | Detailed usage for a specific member |
| `/workspaces/:id/usage/export` | GET | Export usage data as CSV |

### 3.3 Platform Admin Usage API

Available to platform admins only:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/usage` | GET | System-wide usage summary |
| `/admin/usage/history` | GET | Platform usage over time |
| `/admin/usage/workspaces` | GET | Per-workspace usage ranking |
| `/admin/usage/users` | GET | Per-user usage ranking (top consumers) |
| `/admin/usage/models` | GET | Per-model cost breakdown |
| `/admin/usage/cost-report` | GET | Estimated cost report for a date range |
| `/admin/usage/export` | GET | Full export (CSV/JSON) |
| `/admin/model-pricing` | GET | List model pricing table |
| `/admin/model-pricing` | PUT | Update model pricing |

### 3.4 Real-Time Usage Event

The SSE `done` event at the end of each AI response MUST include usage metrics:

```
event: done
data: {
  "type": "done",
  "usage": {
    "promptTokens": 1234,
    "completionTokens": 567,
    "totalTokens": 1801,
    "estimatedCostUsd": 0.0043,
    "creditsConsumed": 1,
    "durationMs": 3200,
    "model": "claude-sonnet-4-20250514",
    "tokensAvailable": true
  }
}
```

This allows the frontend to display per-message costs inline.

---

## 4. User Dashboard

### 4.1 My Usage Page

Accessible from **Settings → Usage** or sidebar shortcut. Shows the authenticated user's own consumption:

| Section | Content |
|---------|---------|
| **Summary Cards** | Today's tokens, this month's tokens, this month's estimated cost, credits remaining |
| **Usage Chart** | Line/bar chart of daily token usage over selected period (7d/30d/90d) |
| **Credit Gauge** | Visual gauge showing daily + monthly credits consumed vs. available |
| **By Provider** | Table: provider name (GitHub Copilot / each BYOK key / local), request count, tokens, cost — shows spend per API key |
| **By Project** | Table: project name, request count, tokens, cost — sortable |
| **By Model** | Table: model name, request count, tokens, cost — shows which models are used most |
| **By Mode** | Pie/donut chart: agent vs. plan vs. chat usage distribution |
| **Recent Requests** | Scrollable list of recent AI interactions with provider, model, token counts and cost per request |

### 4.2 Per-Message Usage (Inline)

Each AI response in the chat panel shows a subtle footer:

```
⚡ 1,234 tokens · $0.003 · 2.1s
```

Clicking expands to show: prompt tokens, completion tokens, model used, mode, tool calls.

### 4.3 Project Usage Tab

In **Project Settings → Usage**, project owners see:

| Metric | Description |
|--------|-------------|
| **Total requests** | AI requests in this project |
| **Total tokens** | Cumulative token usage |
| **Total cost** | Estimated cost for this project |
| **By member** | Who used AI most in this project |
| **By mode** | Agent vs. plan vs. chat split |
| **Usage trend** | Daily usage chart for the project |

---

## 5. Workspace Admin Dashboard

### 5.1 Workspace Usage Page

Accessible from **Workspace Settings → Usage** (owner/admin only):

| Section | Content |
|---------|---------|
| **Overview Cards** | This month's total tokens, total cost, total requests, active users |
| **Trend Chart** | Daily/weekly usage over time with cost overlay |
| **Member Leaderboard** | Table: member name, requests, tokens, cost, credits used — sorted by consumption |
| **Project Breakdown** | Table: project name, requests, tokens, cost — shows cost attribution |
| **Provider Distribution** | Chart: GitHub Copilot vs. each BYOK provider vs. local — cost + request split |
| **Model Distribution** | Chart showing which AI models are used and their relative cost |
| **Budget Status** | Progress bar showing usage against workspace credit allocation |

### 5.2 Per-Member Controls

Workspace admins can set per-member usage limits (extends [PRD 11 Section 3.3](11-pricing-billing.md)):

| Control | Description |
|---------|-------------|
| **Daily credit cap** | Max credits a member can consume per day (0 = unlimited) |
| **Monthly credit cap** | Max credits a member can consume per month |
| **Model restrictions** | Restrict which AI models a member can use |
| **Usage alerts** | Email/in-app alert when member hits 80% of their cap |
| **Hard vs. soft limit** | Hard = block requests; Soft = warn but allow |

### 5.3 Usage Alerts

| Alert | Trigger | Recipients |
|-------|---------|------------|
| **Member daily cap** | Member reaches 80% / 100% of daily cap | Member + workspace admins |
| **Workspace monthly high** | Workspace reaches 80% of monthly credits | Workspace owner + admins |
| **Cost spike** | Day-over-day cost increase > 200% | Workspace owner |
| **Unusual activity** | Member's usage > 3x their 7-day average | Workspace admins |

### 5.4 Usage Export

Workspace admins can export usage data:

| Format | Content |
|--------|---------|
| **CSV** | All requests within date range with full metadata |
| **JSON** | Same data in JSON format |
| **Summary PDF** | Monthly usage report with charts (Phase 4+) |

---

## 6. Platform Admin Dashboard

### 6.1 System-Wide Usage

Accessible from **Admin Panel → Usage** (platform admins only):

| Section | Content |
|---------|---------|
| **Platform Summary** | Total requests, tokens, estimated cost, active users — today, this week, this month |
| **Cost Trend** | Daily platform-wide cost chart (line graph) |
| **Workspace Ranking** | Top workspaces by token consumption and cost |
| **User Ranking** | Top users by consumption (across all workspaces) |
| **Model Cost Breakdown** | Per-model cost distribution (pie chart + table) |
| **Provider Distribution** | Copilot subscription vs. each BYOK provider vs. local engines — grouped by `provider` + `byok_provider_id` |
| **Request Volume** | Requests per hour/day heatmap |

### 6.2 Model Pricing Management

Platform admins manage the model pricing table:

| Feature | Description |
|---------|-------------|
| **View pricing** | Table of all models with current per-token costs |
| **Update pricing** | Edit input/output cost per 1M tokens |
| **Add model** | Register new model with pricing |
| **Deactivate model** | Mark model as inactive (no new requests) |
| **Pricing history** | Audit trail of pricing changes |

### 6.3 Cost Analysis Tools

| Tool | Description |
|------|-------------|
| **Date range comparison** | Compare two periods (e.g., this month vs. last month) |
| **Cost projection** | Extrapolate current usage to estimate month-end cost |
| **Anomaly detection** | Flag workspaces or users with abnormal usage patterns |
| **Provider cost comparison** | Compare cost of same requests across providers |

### 6.4 Platform Alerts & Controls

| Control | Description |
|---------|-------------|
| **Global rate limit override** | Emergency rate limit for all users |
| **Workspace suspend** | Disable AI for a specific workspace |
| **User suspend** | Disable AI for a specific user |
| **Cost ceiling** | Platform-wide daily cost ceiling (kill switch) |
| **Model disable** | Disable a specific model platform-wide |

---

## 7. Integration with Existing Systems

### 7.1 Credit System Integration

The token tracking system feeds into the existing credit system ([PRD 11](11-pricing-billing.md)):

| Integration Point | Behavior |
|-------------------|----------|
| **Credit consumption** | After each AI request, call `consumeCredits()` with token metadata |
| **Credit pre-flight** | Before AI request, check `getCreditBalance()` — reject if insufficient |
| **Usage log enrichment** | `credit_usage_log` rows now include actual token counts and model |
| **Plan enforcement** | Enterprise plan bypasses credit checks but still logs usage |
| **BYOK special handling** | BYOK provider requests may consume 0 credits but still log tokens/cost |

### 7.2 Chat Route Integration

The chat route (`POST /projects/:id/chat`) is the primary integration point:

| Step | Action |
|------|--------|
| **Pre-request** | Check credit balance; reject with 402 if insufficient |
| **Provider call** | Extract `UsageMetrics` from provider response |
| **Post-request** | Insert `ai_usage_log` row with full metrics |
| **Post-request** | Call `consumeCredits()` with token metadata |
| **SSE done event** | Include usage metrics in the done event payload |
| **Error handling** | Log partial usage even on failed/interrupted requests |

### 7.3 WebSocket Broadcasting

After each AI request completes, broadcast usage update to the project room so all collaborators see updated usage stats:

```
ws message type: "usage:update"
payload: { userId, tokensUsed, costUsd, creditsRemaining }
```

### 7.4 Activity Events

AI usage events are logged to `activity_events` for the workspace audit trail:

| Event Type | Trigger |
|------------|---------|
| `ai.request` | Every AI request (agent/plan/chat) |
| `ai.budget_warning` | Member reaches 80% of credit cap |
| `ai.budget_exceeded` | Member exceeds credit cap |
| `ai.cost_spike` | Abnormal cost increase detected |

---

## 8. Implementation Phases

### 8.1 Phase 1 — Token Extraction & Logging (MVP)

**Priority: CRITICAL — blocks accurate billing**

- [ ] Add `UsageMetrics` interface to `@doable/shared`
- [ ] Modify Anthropic provider to extract token counts from SSE events
- [ ] Modify Copilot provider to extract token counts from `sendAndWait()` result
- [ ] Create `ai_usage_log` table migration
- [ ] Create `model_pricing` table migration with initial pricing data
- [ ] Insert `ai_usage_log` row after each AI request in chat route
- [ ] Call `consumeCredits()` from chat route with token metadata
- [ ] Include usage metrics in SSE `done` event
- [ ] Show per-message token count in chat UI (subtle footer)

### 8.2 Phase 2 — User & Project Dashboards

- [ ] Create `/usage/me` API routes
- [ ] Create `ai_usage_daily` table and daily aggregation query
- [ ] Build "My Usage" page (Settings → Usage)
- [ ] Build per-project usage tab (Project Settings → Usage)
- [ ] Add credit gauge component to dashboard sidebar
- [ ] Show usage trend sparkline on dashboard project cards

### 8.3 Phase 3 — Workspace Admin Dashboard

- [ ] Create `/workspaces/:id/usage` API routes
- [ ] Build workspace usage dashboard page
- [ ] Per-member usage breakdown table
- [ ] Per-member credit cap controls (daily/monthly limits)
- [ ] Usage alerts (in-app notifications)
- [ ] CSV export of workspace usage data
- [ ] `ai_usage_monthly` table and monthly aggregation

### 8.4 Phase 4 — Platform Admin Dashboard

- [ ] Create `/admin/usage` API routes
- [ ] Build platform-wide usage dashboard in admin panel
- [ ] Model pricing management UI
- [ ] Workspace and user ranking tables
- [ ] Cost projection and comparison tools
- [ ] Platform-level controls (suspend, cost ceiling, model disable)
- [ ] Anomaly detection (basic: >3x average triggers alert)
- [ ] Full export (CSV/JSON) for accounting

### 8.5 Phase 5 — Advanced Features

- [ ] Real-time usage streaming (WebSocket updates on dashboard)
- [ ] Usage-based billing integration (Stripe metered billing)
- [ ] Provider cost comparison reports
- [ ] Usage forecasting (simple linear projection)
- [ ] Automated cost optimization suggestions
- [ ] Data retention policy enforcement (configurable per workspace)

---

## 9. Data Model Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    users     │────▶│  ai_usage_log    │◀────│    projects     │
└──────────────┘     │                  │     └─────────────────┘
                     │  user_id         │              │
┌──────────────┐     │  workspace_id    │     ┌───────┴─────────┐
│  workspaces  │────▶│  project_id      │     │   ai_sessions   │
└──────────────┘     │  session_id      │     └─────────────────┘
                     │  provider        │
┌──────────────┐     │  model ──────────┼────▶┌─────────────────┐
│model_pricing │◀────│  prompt_tokens   │     │ credit_balances  │
│              │     │  completion_tkns │     │ (existing)       │
│  model_id    │     │  estimated_cost  │     └─────────────────┘
│  input_cost  │     │  credits_consumed│
│  output_cost │     │  duration_ms     │
└──────────────┘     │  created_at      │
                     └────────┬─────────┘
                              │ aggregated into
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │ai_usage_    │  │ai_usage_     │  │credit_usage_ │
    │daily        │  │monthly       │  │log (existing)│
    └─────────────┘  └──────────────┘  └──────────────┘
```

---

## 10. Security & Privacy

### 10.1 Access Control

| Data | Who Can See |
|------|------------|
| **Own usage** | Any authenticated user (their own data only) |
| **Project usage** | Project collaborators (all members' aggregated usage on that project) |
| **Member usage (detailed)** | Workspace owner + admin only |
| **Workspace aggregates** | Workspace owner + admin |
| **Platform-wide data** | Platform admins only |
| **Model pricing** | Platform admins (manage), all users (read active models) |

### 10.2 Data Retention

| Data | Default Retention | Configurable |
|------|------------------|-------------|
| `ai_usage_log` (per-request) | 90 days | Yes (per workspace, Enterprise) |
| `ai_usage_daily` | 2 years | No |
| `ai_usage_monthly` | Indefinite | No |
| `model_pricing` history | Indefinite | No |

### 10.3 Privacy Considerations

- Usage logs do NOT store message content — only token counts and metadata
- No PII beyond `user_id` (which is a UUID, not email)
- Exported data follows workspace data policies ([PRD 10 Section 8](10-analytics-security.md))
- GDPR: usage data deleted when user account is deleted

---

## 11. Frontend Component Architecture

### 11.1 Shared Components

| Component | Used By | Description |
|-----------|---------|-------------|
| `<UsageChart>` | All dashboards | Configurable line/bar chart for usage over time |
| `<TokenCounter>` | Chat panel | Inline per-message usage display |
| `<CreditGauge>` | Sidebar, usage page | Visual gauge for credit remaining |
| `<UsageTable>` | All dashboards | Sortable, filterable table for usage data |
| `<CostBadge>` | Tables, cards | Formatted cost display ($0.0043) |
| `<UsageSparkline>` | Project cards | Tiny trend chart for project cards |
| `<DateRangePicker>` | All dashboards | Period selector (7d/30d/90d/custom) |
| `<UsageExportButton>` | Admin dashboards | CSV/JSON export trigger |

### 11.2 Chart Rendering

Charts rendered using **lightweight SVG** (no heavy chart library) — consistent with the existing analytics panel pattern. If a chart library is later adopted, prefer `recharts` (React-native, small bundle).

---

## 12. Migration from Existing Tables

### 12.1 Relationship to `credit_usage_log`

The existing `credit_usage_log` table continues to serve its purpose (credit deduction audit trail). The new `ai_usage_log` table is the **source of truth for usage analytics** and contains richer data. Both are written to on each AI request:

| Table | Purpose | Written By |
|-------|---------|-----------|
| `credit_usage_log` | Credit deduction audit | `consumeCredits()` |
| `ai_usage_log` | Usage analytics & dashboards | Chat route post-request hook |

### 12.2 Backfill

No backfill of historical data is possible (token counts were never captured). The system starts tracking from the migration date. Dashboard charts should handle empty/partial periods gracefully.

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| **Token extraction rate** | >95% of AI requests have non-NULL token counts |
| **Logging latency** | <50ms added to request lifecycle for usage logging |
| **Dashboard load time** | <500ms for daily aggregates, <2s for 90-day charts |
| **Cost accuracy** | Estimated cost within 5% of actual provider billing |
| **User engagement** | >30% of active users view their usage page at least once/month |
| **Admin adoption** | 100% of workspace admins review usage within first month |

---

## 14. Dependencies & Cross-References

| PRD | Relationship |
|-----|-------------|
| [PRD 01 — AI Engine](01-ai-engine.md) | Token extraction modifies provider response handling |
| [PRD 10 — Analytics & Security](10-analytics-security.md) | Section 7 (Per-Project Cloud Usage) is superseded by this PRD's per-project tracking |
| [PRD 11 — Pricing & Billing](11-pricing-billing.md) | Section 3.3 (Usage Dashboard) is implemented by this PRD; credit consumption now includes tokens |
| [PRD 15 — Development Phases](15-development-phases.md) | Phase 1.6, Phase 2.8, Phase 3.7 all reference usage tracking |
| [PRD 16 — Copilot SDK Core](16-copilot-sdk-core.md) | Token extraction from Copilot SDK response objects |
| [PRD 17 — Multi-User Infrastructure](17-multi-user-infrastructure.md) | Per-user rate limiting informed by usage data; per-member credit caps |
| [PRD 23 — Universal LLM Provider Bridge](23-universal-llm-provider-bridge.md) | 61 providers (39 cloud + 22 local) all need usage tracking; BYOK spend attribution; `ai_providers` table linked via `byok_provider_id`; local providers show $0 cost; provider catalog `preset_id` used for grouping in dashboards |
