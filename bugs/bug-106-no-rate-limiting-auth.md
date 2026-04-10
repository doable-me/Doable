# BUG-106: No Rate Limiting on Authentication Endpoints

**Severity:** CRITICAL SECURITY
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/routes/auth.ts

## Summary

Zero rate limiting on login, register, forgot-password, reset-password, and token refresh. Enables brute-force attacks, credential stuffing, and email bombing.

Rate limiter middleware exists at `services/api/src/middleware/rate-limit.ts` but is never applied to auth routes.

## Fix

Apply rate limiter to auth endpoints: ~5-10 attempts per 15 minutes for login/forgot-password, ~3 per hour for register.
