# BUG-CORPUS-MKT-001 — GET /admin/marketplace/listings/:id/audit returns 200 [] for unknown ids

**Severity:** medium
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus runner, CORPUS-06-07-08-09 (TC-MARKET-MODERATION-001)

## Repro
```
GET /admin/marketplace/listings/00000000-0000-0000-0000-000000000000/audit
Authorization: Bearer <qa-owner>
```

## Actual
HTTP 200 — `{"data":[]}`

## Expected
HTTP 404 (or at minimum a `{notFound:true}` envelope) when the listing id does not exist. Returning 200/empty hides typo'd ids and obstructs admin diagnostics.

## Analysis
`services/api/src/routes/marketplace-moderation.ts:178` — the audit handler runs the SQL `WHERE listing_id = $1` and returns `[]` on miss without first verifying listing existence. Compare with the install delete handler which returns 404 `"Not installed"` on miss.

## Fix recommendation
- Look up the listing first; return 404 if missing.
- Keep the empty-array response only when the listing exists but has no audit rows yet.

## Evidence
`testcases/evidence/env1/TC-MARKET-MODERATION-001.body`
