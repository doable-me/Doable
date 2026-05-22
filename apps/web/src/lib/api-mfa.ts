/**
 * Typed wrappers for the optional MFA endpoints. All paths under /auth/mfa
 * except the admin reset endpoint, which is under /admin/mfa.
 *
 * The login endpoint can return either a normal session OR an MFA challenge;
 * the discriminator is `mfaRequired === true` on the response.
 */
import { apiFetch } from "./api-core";

export interface MfaStatus {
  enabled: boolean;
  label?: string;
  verifiedAt?: string | null;
  lastUsedAt?: string | null;
  unusedRecoveryCodes?: number;
}

export interface MfaEnrollStartResponse {
  secret: string;
  otpauthUrl: string;
  issuer: string;
  accountName: string;
}

export interface MfaEnrollVerifyResponse {
  enabled: true;
  recoveryCodes: string[];
  label: string;
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}

export function isMfaChallenge(res: unknown): res is MfaChallenge {
  return (
    typeof res === "object" &&
    res !== null &&
    "mfaRequired" in res &&
    (res as { mfaRequired?: unknown }).mfaRequired === true
  );
}

export async function apiMfaStatus(): Promise<MfaStatus> {
  return apiFetch("/auth/mfa/status");
}

export async function apiMfaEnrollStart(): Promise<MfaEnrollStartResponse> {
  return apiFetch("/auth/mfa/enroll/start", { method: "POST" });
}

export async function apiMfaEnrollVerify(code: string): Promise<MfaEnrollVerifyResponse> {
  return apiFetch("/auth/mfa/enroll/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiMfaDisable(args: { password: string; code: string }): Promise<{ enabled: false }> {
  return apiFetch("/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function apiMfaRegenerateRecoveryCodes(args: {
  password: string;
  code: string;
}): Promise<{ recoveryCodes: string[] }> {
  return apiFetch("/auth/mfa/recovery-codes/regenerate", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

// ─── Admin endpoints ────────────────────────────────────────────────

export interface AdminMfaUserRow {
  userId: string;
  email: string;
  displayName: string | null;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  unusedRecoveryCodes: number;
}

export async function apiAdminListMfaUsers(): Promise<{ users: AdminMfaUserRow[] }> {
  return apiFetch("/admin/mfa/users");
}

export async function apiAdminResetUserMfa(userId: string): Promise<{ ok: true; hadFactor: boolean }> {
  return apiFetch(`/admin/mfa/reset/${userId}`, { method: "POST" });
}
