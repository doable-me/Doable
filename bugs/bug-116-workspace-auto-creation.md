# BUG-116: No Workspace Auto-Creation for New Users

**Severity:** HIGH
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (E2E API testing)
**Component:** services/api/src/routes/auth.ts, services/api/src/routes/workspaces.ts

## Summary

New users have no workspace after registration. Creating projects requires a workspace. The `/auth/me` endpoint was supposed to auto-create a personal workspace but doesn't. New users are blocked from creating projects until they manually create a workspace.

## Repro Steps

1. Register a new user
2. GET /workspaces → empty array
3. POST /projects → "No workspace found. Please create a workspace first."

## Fix

Auto-create a personal workspace in the registration flow or on first `/auth/me` call.
