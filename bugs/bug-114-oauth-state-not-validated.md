# BUG-114: OAuth State Parameter Not Validated (CSRF)

**Severity:** HIGH SECURITY
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/routes/auth.ts:287-347

## Summary

GitHub and Google OAuth flows generate a `state` parameter using `crypto.randomUUID()` but never store it server-side and never verify it on callback. This enables CSRF attacks where an attacker can force a victim to authenticate with the attacker's OAuth account.

## Fix

Store the state in a server-side session or signed cookie before redirect. Verify it matches on callback.
