# BUG-107: Hardcoded Fallback JWT Secret

**Severity:** CRITICAL SECURITY
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/lib/jwt.ts:17, services/api/src/middleware/auth.ts:19-20

## Summary

Both files use `process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"`. If JWT_SECRET is unset (or accidentally cleared during deploy), anyone can forge valid JWTs using the well-known fallback.

Additionally, duplicate JWT signing functions exist in both `lib/jwt.ts` and `middleware/auth.ts` — maintenance trap for secret/expiry drift.

## Fix

1. Throw fatal error at startup if JWT_SECRET is missing or equals the fallback
2. Delete duplicate sign/verify functions from middleware/auth.ts — import from lib/jwt.ts
