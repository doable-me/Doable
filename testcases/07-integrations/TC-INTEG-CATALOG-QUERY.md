# TC-INTEG-CATALOG-QUERY — Catalog supports `?q=`, `?authType=`, `?limit=`, `?offset=` + `/integrations` alias

**Owner:** MCP & Integrations area
**Related bugs:** BUG-2026-05-14-MCP-004, BUG-2026-05-14-MCP-005
**Severity:** medium

## Pre-conditions

- Authenticated as any workspace member.

## Steps + expectations

### 1. `?q=` alias for `?search=` (BUG-MCP-005)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/integrations/catalog?q=stripe"
```

- HTTP 200
- `data` MUST contain `stripe` and exclude unrelated integrations (e.g. `activecampaign`).
- Equivalent to `?search=stripe` (both queries return the same `data` set).

### 2. `?authType=` filter

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/integrations/catalog?authType=oauth2"
```

- HTTP 200
- Every entry in `data` MUST have `authType: "oauth2"`.

### 3. `?limit=` pagination

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/integrations/catalog?limit=5"
```

- HTTP 200
- `data.length <= 5`.
- Response MUST also include `total` (full count before slicing).

### 4. `?offset=` pagination

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/integrations/catalog?limit=10&offset=10"
```

- HTTP 200
- `data[0]` MUST differ from the first entry returned by `?limit=10` alone.

### 5. `/integrations` alias for `/integrations/catalog` (BUG-MCP-004)

```bash
curl -s -i -H "Authorization: Bearer $TOKEN" \
  "$API/integrations?q=stripe"
```

- HTTP 302 redirect to `/integrations/catalog?q=stripe`.
- Following the redirect MUST return the same body as direct call.

## Regression rationale

Test corpora and external SDKs commonly use `?q=` for free-text search; the prior catalog ignored it silently and returned all 533 integrations, masking real filtering bugs. Pagination was likewise advertised but not implemented. The fix in `services/api/src/routes/integrations-catalog.ts` aliases the query, adds `authType`/`limit`/`offset`, and exposes the bare `/integrations` path as a 302 redirect to the canonical catalog URL.
