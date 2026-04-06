# Phase 7A — Provider Setup Wizard (Frontend)

**Status:** Complete
**Date:** 2026-04-06

## What was built

### New files

1. **`apps/web/src/modules/ai-settings/components/provider-wizard.tsx`**
   - 4-step modal wizard: Choose Provider -> Configure -> Validate -> Select Models
   - Step 1: Grid of provider cards organized by Cloud/Local/Gateway tabs with search filtering
   - Step 2: Dynamic form pre-filled from preset defaults (label, base URL, API key, Azure fields)
   - Step 3: Test connection via `POST /ai/providers/test-connection` with latency + model count display
   - Step 4: Checkbox model selection with default model radio, context window + capability badges
   - Uses existing `Dialog` component from `@/components/ui/dialog`
   - Full wizard state reset on close

2. **`apps/web/src/modules/ai-settings/components/provider-card.tsx`**
   - Reusable card for the provider grid
   - Colored first-letter icon circle, name, description, Free/Local badges
   - Color mapping based on first letter of provider name

3. **`apps/web/src/modules/ai-settings/components/provider-health-badge.tsx`**
   - Health status indicator: colored dot (green/yellow/red/gray) + label + optional latency
   - Supports healthy, degraded, down, unknown states

4. **`apps/web/src/modules/ai-settings/hooks/use-provider-catalog.ts`**
   - Fetches from `GET /ai/provider-catalog` with caching
   - Returns `{ catalog, isLoading, error, byCategory, bySubcategory, freeProviders }`

5. **`apps/web/src/modules/ai-settings/hooks/use-test-connection.ts`**
   - Calls `POST /ai/providers/test-connection`
   - Returns `{ testConnection, result, isLoading, error, reset }`

### Modified files

6. **`apps/web/src/modules/ai-settings/components/custom-providers-tab.tsx`**
   - "Add Provider" button now opens the ProviderWizard dialog
   - Health badges shown on existing provider rows
   - Added "Test" (Zap icon) and "Refresh Models" action buttons per provider
   - Added optional `onRefresh` prop for post-wizard-save refresh

## Integration points

- Wizard uses `apiFetch` from `@/lib/api` for all API calls
- Types imported from `@doable/shared` (`ProviderPreset`, `ModelPreset`)
- Provider catalog endpoint: `GET /ai/provider-catalog` (already exists from Phase 5)
- Test connection endpoint: `POST /ai/providers/test-connection` (already exists from Phase 5)
- Provider creation: `POST /workspaces/:id/ai-settings/providers` (already exists)

## TypeScript

All new code passes type-checking with zero errors. Pre-existing errors in marketplace and environments-panel are unrelated.

## Styling

- Matches existing dark theme patterns (zinc-800/900, brand-500/600)
- Responsive grid: 1 col mobile, 2 cols on md+ for provider cards
- Uses existing Dialog, Lucide icons, and Tailwind classes consistent with the codebase
