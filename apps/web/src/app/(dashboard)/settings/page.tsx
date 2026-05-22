"use client";

import { useState, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Monitor, ArrowLeft } from "lucide-react";
import { useBrandTheme } from "@/hooks/use-brand-theme";
import { getPasswordStrength, SettingsSection } from "./settings-helpers";
import {
  ProfileSection,
  SecuritySection,
  AppearanceSection,
  DangerZoneSection,
  DeleteAccountDialog,
} from "./settings-sections";

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("doable_theme") as "dark" | "light" | "system" | null;
    return stored ?? "dark";
  });
  const { brandTheme, changeBrandTheme } = useBrandTheme();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const newPasswordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const initials = (user?.displayName ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(false);
    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${API_URL}/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ displayName }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    if (newPasswordStrength.score < 2) {
      setPasswordError("Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers.");
      return;
    }
    setPasswordSaving(true);
    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to change password" }));
        setPasswordError(data.error ?? "Failed to change password");
        return;
      }
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch {
      setPasswordError("Failed to change password. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  function handleThemeChange(newTheme: "dark" | "light" | "system") {
    setTheme(newTheme);
    localStorage.setItem("doable_theme", newTheme);
    const root = document.documentElement;
    const resolved =
      newTheme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : newTheme;
    root.classList.remove("dark", "light");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      await fetch(`${API_URL}/auth/delete-account`, { method: "DELETE", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch { /* proceed with logout */ }
    await logout();
    router.push("/");
  }

  const sessions = [
    {
      id: "current",
      device: typeof navigator !== "undefined" ? navigator.userAgent.split("(")[1]?.split(")")[0] ?? "Unknown Device" : "Unknown Device",
      icon: Monitor,
      location: "Current session",
      lastActive: "Now",
      current: true,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <button onClick={() => router.push("/dashboard")} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />Back to dashboard
        </button>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account preferences and security.</p>
      </div>

      <div className="space-y-6">
        <ProfileSection user={user} displayName={displayName} setDisplayName={setDisplayName} initials={initials} profileSaving={profileSaving} profileSuccess={profileSuccess} onSave={handleProfileSave} />
        <SecuritySection currentPassword={currentPassword} newPassword={newPassword} confirmPassword={confirmPassword} showCurrentPassword={showCurrentPassword} showNewPassword={showNewPassword} passwordSaving={passwordSaving} passwordSuccess={passwordSuccess} passwordError={passwordError} newPasswordStrength={newPasswordStrength} setCurrentPassword={setCurrentPassword} setNewPassword={setNewPassword} setConfirmPassword={setConfirmPassword} setShowCurrentPassword={setShowCurrentPassword} setShowNewPassword={setShowNewPassword} onPasswordChange={handlePasswordChange} />

        <SettingsSection icon={Monitor} title="Active Sessions" description="Devices where you are currently signed in">
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-4 py-3">
                <div className="flex items-center gap-3">
                  <session.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {session.device}
                      {session.current && <span className="ml-2 inline-flex items-center rounded-full bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-400">Current</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{session.location} &middot; {session.lastActive}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        <AppearanceSection theme={theme} brandTheme={brandTheme} onThemeChange={handleThemeChange} onBrandThemeChange={changeBrandTheme} />
        <DangerZoneSection onShowDeleteDialog={() => setShowDeleteDialog(true)} />
      </div>

      <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} deleteConfirmation={deleteConfirmation} setDeleteConfirmation={setDeleteConfirmation} isDeleting={isDeleting} onDelete={handleDeleteAccount} />
    </div>
  );
}
