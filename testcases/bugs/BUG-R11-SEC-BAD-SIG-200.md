# BUG-R11-SEC-BAD-SIG-200 — RETRACTED (false positive: base64url non-canonical encoding artifact)

- **Severity**: NOT A BUG (originally filed P1, retracted after deeper verification)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (R11 security smoke)
- **Status**: NOT A BUG (false positive, R12 confirmed 2026-05-15) — tampered JWT returns 401; base64url non-canonical padding explained the original apparent anomaly
- **Discovered by**: R11 Probe #4

## Original repro
```bash
ORIG="eyJhbGciOiJIUzI1NiJ9.<payload>.pLHAo0emdaNlt7mL-fbYWWo2mzS5tO68d65PVODEcfE"
TAMP="eyJhbGciOiJIUzI1NiJ9.<payload>.pLHAo0emdaNlt7mL-fbYWWo2mzS5tO68d65PVODEcfF"  # last char E→F
curl -i -H "Authorization: Bearer $TAMP" https://dev-api.doable.me/auth/me
# → HTTP 200 OK + full user profile
```

The trailing-character flip (`E` → `F`) returned 200. Original report assumed authentication bypass.

## Why this is NOT a vulnerability

The base64url alphabet maps each character to 6 bits. An HS256 signature is 32 bytes = 256 bits, encoded as 43 base64url chars (which carry 258 bits total — 2 extra "padding bits" at the end).

Those last 2 bits are discarded during decode. Hence:
- `E` = binary `000100` → top 4 bits used (`0001` = 1), bottom 2 bits discarded
- `F` = binary `000101` → top 4 bits used (`0001` = 1), bottom 2 bits discarded

**`E` and `F` decode to the IDENTICAL signature byte.** The tampered token is byte-for-byte identical to the original after base64url decode. The JWT library correctly verifies the (unchanged) signature.

## Verification — definitive 401 on real tampering

```bash
# Real middle-byte flip (changes the decoded signature byte)
curl -i -H "Authorization: Bearer eyJhbG...payload.pLHAo0emdaXlt7mL-fbYWWo2mzS5tO68d65PVODEcfE" https://dev-api.doable.me/auth/me
# → HTTP/1.1 401 Unauthorized ✓

# Completely random signature
curl -i -H "Authorization: Bearer eyJhbG...payload.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" https://dev-api.doable.me/auth/me
# → HTTP/1.1 401 Unauthorized ✓
```

JWT signature verification IS working correctly on dev-api.doable.me.

## Lesson learned
When testing JWT signature tampering, always flip a character somewhere in the middle of the signature (or at least far from the last char) to avoid the base64url non-canonical encoding ambiguity. The very last char of a non-padded base64url string can have multiple representations that decode to the same byte sequence.

## Note for future authors
A defense-in-depth improvement would be for the JWT decoder to reject non-canonical base64url (i.e., reject `F` if the canonical form is `E`). RFC 4648 §3.5 mandates this for "strict" decoders but most JWT libraries do not implement it. This is a security-hardening enhancement, not a defect — the actual cryptographic verification of the signature is sound.
