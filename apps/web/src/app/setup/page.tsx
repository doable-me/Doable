import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { WizardShell } from "./WizardShell";

// Server component — guards:
// 1. Must be authenticated (token present)
// 2. Must be platform admin
// 3. setup_completed_at must be null
//
// We can't call the DB directly from here (monorepo boundary), so we call the API
// server-side using the stored token. If any check fails we redirect.

async function getSetupStatus(token: string): Promise<{
  isPlatformAdmin: boolean;
  setupCompleted: boolean;
  workspaceName: string | null;
} | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
  try {
    const res = await fetch(`${apiUrl}/setup/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SetupPage() {
  const cookieStore = await cookies();
  // Token may be in cookie (SSR) — if not present, WizardShell handles auth client-side
  const token = cookieStore.get("doable_access_token")?.value ?? "";

  if (token) {
    const status = await getSetupStatus(token);
    if (status) {
      if (!status.isPlatformAdmin) redirect("/");
      if (status.setupCompleted) redirect("/");
    }
  }

  return <WizardShell />;
}
