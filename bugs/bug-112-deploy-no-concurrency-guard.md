# BUG-112: Deploy Pipeline Has No Concurrency Guard

**Severity:** CRITICAL
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/deploy/pipeline.ts:66-228, services/api/src/deploy/adapters/doable-cloud.ts:75-105

## Summary

Two simultaneous deploys for the same project will race to rm+mkdir+cp the same directory. No lock, mutex, or "is-deploying" check at any layer.

## Impact

- Corrupted live site
- Half-deployed artifacts
- Directory ENOENT errors mid-copy

## Fix

Add a per-project mutex or check for active "building"/"deploying" status before starting a new deploy.
