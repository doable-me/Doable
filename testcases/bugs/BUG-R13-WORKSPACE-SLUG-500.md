# BUG-R13-WORKSPACE-SLUG-500

**ID**: BUG-R13-WORKSPACE-SLUG-500  
**Severity**: P2  
**Date**: 2026-05-15  
**Found by**: R13 matrix run  
**Status**: FIXED (pending commit hash; branch `fix/r13-workspace-slug-409`)

## Summary

`POST /workspaces` returns 500 Internal Server Error when a duplicate workspace slug
is submitted, instead of returning 409 Conflict with a user-facing error message.

## Repro

```
POST /workspaces
Authorization: Bearer <valid-token>
Content-Type: application/json
{"name":"R13 Dup Test","slug":"r13-dup-slug-test"}

# First request → 201 Created
# Second request (same slug, any user) → 500 Internal Server Error
```

Live verification on https://dev-api.doable.me:
- First POST with slug `r13-dup-slug-test` → 201
- Second POST with same slug → 500 `{"error":"Internal Server Error"}`

## Root Cause

The workspace creation handler does not catch the PostgreSQL unique constraint
violation on the `slug` column (`workspaces_slug_key`). The unhandled DB error
propagates to Hono's default error handler which returns 500 instead of 409.

## Expected Behaviour

```json
HTTP 409 Conflict
{"error":"A workspace with that slug already exists"}
```

## Body Excerpt (actual)

```json
{"error":"Internal Server Error"}
```

## Suspected Fix

In the `POST /workspaces` handler, catch `error.code === '23505'` (unique_violation)
and return `c.json({ error: "A workspace with that slug already exists" }, 409)`.

## How Found in Matrix

The R13 harness generates a single `Date.now()` slug at script load time shared
across all roles. When qa-admin and qa-member POST concurrently they race on the
same slug. qa-admin wins (201), qa-member hits unique constraint (500).
Confirmed reproducible with two sequential POSTs using the same slug from the
same token.
