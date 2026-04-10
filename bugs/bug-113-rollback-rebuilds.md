# BUG-113: Rollback Rebuilds From Current Source Instead of Saved Artifacts

**Severity:** CRITICAL
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/routes/deploy.ts:403-425

## Summary

`/rollback/:deploymentId` calls `runPipeline()` — a full fresh build from current source code. It does NOT restore saved artifacts from the target deployment. "Rollback" actually deploys whatever code exists right now under the old deployment ID.

## Impact

Users believe they reverted to a prior version but actually deployed current (potentially broken) code. Deployment artifacts table is essentially unused.

## Fix

Rollback should copy the saved build artifacts from the target deployment's output directory, not rebuild from source.
