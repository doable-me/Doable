# BUG-017: WebSocket server accepts connections from arbitrary origins (CSWSH risk)

**TC-ID:** TC-SEC-WS-001  
**Severity:** high  
**Date:** 2026-05-14  
**Environment:** dev (dev-ws.doable.me)

## Steps to Reproduce

1. Attempt WebSocket upgrade to wss://dev-ws.doable.me with `Origin: https://evil.example`
2. Observe HTTP response code

## Expected

101 Switching Protocols only for allowed origins (dev.doable.me, localhost).
Non-allowed origins: 403 Forbidden.

## Actual

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
```

The WS server returns 101 (connection accepted) for `Origin: https://evil.example`.

## Impact

- Cross-Site WebSocket Hijacking (CSWSH): a malicious page at evil.example can open a WS connection to dev-ws.doable.me using the victim's cookies/credentials if auth is cookie-based.
- Even with token-based auth (Authorization header), browsers send cookies automatically on WS upgrades if SameSite is not set — which means if tokens were ever moved to cookies, this would be critical.
- Currently tokens are in localStorage (BUG-014), so CSWSH cannot steal auth directly via WS, but the open origin policy is still a misconfiguration.
- If/when the app migrates to cookie-based auth (recommended fix for BUG-014), this becomes critical.

## Evidence

```
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Origin: https://evil.example" \
  https://dev-ws.doable.me/
→ HTTP/1.1 101 Switching Protocols
```

## Fix Suggestion

In the WS server upgrade handler, check `req.headers.origin` against an allowlist (same list as API CORS config). Reject with 403 if origin is not in the list or is absent.
