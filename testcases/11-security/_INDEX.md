# 11-security — Test case index

| File | Cases | Coverage |
|---|---|---|
| TC-SEC-RLS.md | 60 | Row-level security: cross-tenant isolation across workspaces, projects, files, chat, integrations, secrets, runtime, audit |
| TC-SEC-INJECTION.md | 53 | XSS (displayName, names, descriptions, URLs, email templates), SQL injection, prototype pollution, command injection, SSRF, ReDoS, open-redirect |
| TC-SEC-JWT.md | 40 | JWT alg=none, key confusion, kid/jku/x5u, token tampering, replay, refresh-vs-access misuse, log redaction |
| TC-SEC-CSRF-CORS.md | 50 | CSRF on state-changing routes, OAuth state CSRF, CORS allow-list, headers, cookies flags, CSP rules |
| TC-SEC-RATELIMIT.md | 25 | Rate-limit bypass via XFF/CF-Connecting-IP rotation, slow-rate brute force, edge cases, post-restart persistence |
| TC-SEC-PASSWORD-RESET-MISC.md | 65 | Reset token reuse/expiry/leak, OAuth-only takeover, complexity drift; misc: sandbox, secrets, env, audit, file uploads, WS Origin |
| TC-SEC-HEADERS-HOST.md | 30 | Host header attacks, smuggling, CRLF injection, cache poisoning, oversized headers, X-Original-URL spoof |

Total: ~323 test cases.
