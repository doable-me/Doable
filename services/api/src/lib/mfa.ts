/**
 * MFA primitives: TOTP (RFC 6238) and single-use recovery codes.
 *
 * Modular by design — every other module talks to MFA through this file
 * and `packages/db/queries/mfa.ts`. No persistence happens here; this
 * module only deals with secrets, codes, and time windows.
 *
 * The TOTP implementation is a deliberately small RFC-6238 (HOTP+time)
 * with HMAC-SHA1, 6 digits, 30-second step — the parameters every
 * authenticator app (1Password, Authy, Google Authenticator, etc.)
 * defaults to. We keep it inline to avoid adding an external dep for
 * something this small and well-specified.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

// ─── Base32 (RFC 4648, no padding) ────────────────────────────────────

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function base32Decode(input: string): Buffer {
  // Tolerant to lowercase, spaces, and trailing padding ('=').
  const cleaned = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(cleaned)) {
    throw new Error("Invalid base32 input");
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 char");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─── TOTP ────────────────────────────────────────────────────────────

const TOTP_DIGITS = 6;
const TOTP_STEP_SECONDS = 30;
/** Number of ±step windows to accept around current time (clock drift). */
const TOTP_DRIFT_WINDOWS = 1;

/** Generate a fresh 20-byte (160-bit) TOTP secret as base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: bigint, digits = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  // Big-endian uint64
  buf.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", secret).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return (code % mod).toString().padStart(digits, "0");
}

/**
 * Verify a TOTP code against a base32-encoded secret. Constant-time
 * comparison, ±TOTP_DRIFT_WINDOWS to absorb minor clock drift between
 * server and authenticator app.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretBase32);
  const baseCounter = BigInt(Math.floor(nowSeconds / TOTP_STEP_SECONDS));
  const codeBuf = Buffer.from(code, "utf8");
  let match = false;
  for (let i = -TOTP_DRIFT_WINDOWS; i <= TOTP_DRIFT_WINDOWS; i++) {
    const counter = baseCounter + BigInt(i);
    if (counter < 0n) continue;
    const expected = Buffer.from(hotp(secret, counter), "utf8");
    if (
      expected.length === codeBuf.length &&
      timingSafeEqual(expected, codeBuf)
    ) {
      match = true;
      // Don't early-return: keep the loop constant-time-ish.
    }
  }
  return match;
}

/**
 * Build an otpauth:// URL for QR-code scanning per the Key URI Format spec.
 * https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 */
export function buildOtpauthUrl(args: {
  issuer: string;
  accountName: string;
  secretBase32: string;
}): string {
  const issuer = encodeURIComponent(args.issuer);
  const account = encodeURIComponent(args.accountName);
  const params = new URLSearchParams({
    secret: args.secretBase32,
    issuer: args.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${issuer}:${account}?${params.toString()}`;
}

// ─── Recovery codes ──────────────────────────────────────────────────

/**
 * Generate `count` recovery codes formatted as `xxxxx-xxxxx` (10 chars
 * + dash). Lowercase hex-ish alphabet without ambiguous chars (0/o, 1/i/l).
 */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let n = 0; n < count; n++) {
    let block = "";
    for (let i = 0; i < 10; i++) {
      block += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
    }
    codes.push(`${block.slice(0, 5)}-${block.slice(5)}`);
  }
  return codes;
}

/** Normalize and hash a recovery code so lookups are case/format-tolerant. */
export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/-/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

/** True if the input looks like a recovery code (not a TOTP digit code). */
export function looksLikeRecoveryCode(input: string): boolean {
  const stripped = input.trim().toLowerCase().replace(/[-\s]/g, "");
  return /^[a-z0-9]{10}$/.test(stripped) && !/^\d{6}$/.test(input.trim());
}
