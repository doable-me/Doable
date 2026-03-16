"use client";

import { useState, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  User,
  Shield,
  Monitor,
  Smartphone,
  Trash2,
  Lock,
  Sun,
  Moon,
  Loader2,
  Check,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertTriangle,
  Palette,
} from "lucide-react";

// ─── Password Strength ──────────────────────────────────────

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-orange-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

// ─── Section Wrapper ────────────────────────────────────────

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
          <Icon className="h-4.5 w-4.5 text-zinc-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Theme state
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("doable_theme") as "dark" | "light" | "system") ?? "dark";
  });

  // Delete account
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // 2FA placeholder
  const [twoFactorEnabled] = useState(false);

  const newPasswordStrength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword]
  );

  const initials = (user?.displayName ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // ─── Handlers ──────────────────────────────────────────────

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(false);

    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${API_URL}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (newPasswordStrength.score < 2) {
      setPasswordError(
        "Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers."
      );
      return;
    }

    setPasswordSaving(true);

    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
    } catch (err) {
      setPasswordError("Failed to change password. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  function handleThemeChange(newTheme: "dark" | "light" | "system") {
    setTheme(newTheme);
    localStorage.setItem("doable_theme", newTheme);

    // Apply theme to document
    const root = document.documentElement;
    if (newTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.toggle("dark", prefersDark);
      root.classList.toggle("light", !prefersDark);
    } else {
      root.classList.toggle("dark", newTheme === "dark");
      root.classList.toggle("light", newTheme === "light");
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    setIsDeleting(true);

    try {
      const token = localStorage.getItem("doable_access_token");
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      await fetch(`${API_URL}/auth/delete-account`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      // Even if server call fails, proceed with logout
    }

    await logout();
    router.push("/");
  }

  // Active sessions - currently shows current session only
  // TODO: Fetch real session list from /auth/sessions when multi-session tracking is implemented
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
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your account preferences and security.
        </p>
      </div>

      <div className="space-y-6">
        {/* ─── Profile Section ──────────────────────────────── */}
        <SettingsSection
          icon={User}
          title="Profile"
          description="Your personal information"
        >
          <form onSubmit={handleProfileSave} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {user?.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-lg font-medium text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-white">
                  {user?.displayName ?? "User"}
                </p>
                <p className="text-xs text-zinc-500">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-zinc-300">
                Display name
              </Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your display name"
                className="rounded-xl border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                disabled
                className="rounded-xl border-zinc-700 bg-zinc-800/50 text-zinc-400 placeholder:text-zinc-600"
                value={user?.email ?? ""}
              />
              <p className="text-xs text-zinc-500">
                Contact support to change your email address.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={profileSaving}
                className="rounded-lg bg-[hsl(263,70%,50%)] text-white hover:bg-[hsl(263,70%,45%)]"
              >
                {profileSaving ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : profileSuccess ? (
                  <>
                    <Check className="mr-2 h-3.5 w-3.5" />
                    Saved
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </form>
        </SettingsSection>

        {/* ─── Security Section ─────────────────────────────── */}
        <SettingsSection
          icon={Shield}
          title="Security"
          description="Password and authentication"
        >
          <div className="space-y-6">
            {/* Change Password */}
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-200">
                Change password
              </h4>

              {passwordError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-green-950/50 px-3 py-2.5 text-sm text-green-400">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Password updated successfully.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-zinc-300">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    required
                    className="rounded-xl border-zinc-700 bg-zinc-800/50 pr-10 text-white placeholder:text-zinc-500"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-zinc-300">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="rounded-xl border-zinc-700 bg-zinc-800/50 pr-10 text-white placeholder:text-zinc-500"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {newPassword.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            level <= newPasswordStrength.score
                              ? newPasswordStrength.color
                              : "bg-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {newPasswordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmNewPassword" className="text-zinc-300">
                  Confirm new password
                </Label>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  required
                  className="rounded-xl border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword.length > 0 &&
                  confirmPassword !== newPassword && (
                    <p className="text-xs text-red-400">
                      Passwords do not match
                    </p>
                  )}
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={passwordSaving}
                className="rounded-lg bg-[hsl(263,70%,50%)] text-white hover:bg-[hsl(263,70%,45%)]"
              >
                {passwordSaving ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="border-t border-zinc-800" />

            {/* 2FA Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Two-factor authentication
                  </p>
                  <p className="text-xs text-zinc-500">
                    Add an extra layer of security to your account
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  twoFactorEnabled ? "bg-[hsl(263,70%,50%)]" : "bg-zinc-700"
                }`}
                onClick={() => {
                  // Placeholder - 2FA not yet implemented
                }}
                title="Two-factor authentication coming soon"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    twoFactorEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-zinc-600 -mt-3 ml-7">
              Coming soon
            </p>
          </div>
        </SettingsSection>

        {/* ─── Sessions Section ─────────────────────────────── */}
        <SettingsSection
          icon={Monitor}
          title="Active Sessions"
          description="Devices where you are currently signed in"
        >
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <session.icon className="h-5 w-5 text-zinc-400" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {session.device}
                      {session.current && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-400">
                          Current
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {session.location} &middot; {session.lastActive}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-red-400 hover:bg-red-500/10 hover:text-red-400"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SettingsSection>

        {/* ─── Appearance Section ───────────────────────────── */}
        <SettingsSection
          icon={Palette}
          title="Appearance"
          description="Customize how Doable looks"
        >
          <div className="space-y-3">
            <Label className="text-zinc-300">Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "light" as const, label: "Light", icon: Sun },
                { value: "dark" as const, label: "Dark", icon: Moon },
                {
                  value: "system" as const,
                  label: "System",
                  icon: Monitor,
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                    theme === option.value
                      ? "border-[hsl(263,70%,50%)] bg-[hsl(263,70%,50%)]/10 text-white"
                      : "border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{option.label}</span>
                  {theme === option.value && (
                    <Check className="h-3.5 w-3.5 text-[hsl(263,70%,50%)]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>

        {/* ─── Danger Zone ──────────────────────────────────── */}
        <SettingsSection
          icon={Trash2}
          title="Danger Zone"
          description="Irreversible and destructive actions"
        >
          <div className="flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-red-400">
                Delete account
              </p>
              <p className="text-xs text-zinc-500">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0 rounded-lg"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete account
            </Button>
          </div>
        </SettingsSection>
      </div>

      {/* ─── Delete Confirmation Dialog ───────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              This action is permanent and cannot be undone. All of your projects,
              data, and settings will be permanently deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-zinc-300">
              Type <strong className="text-white">DELETE</strong> to confirm:
            </p>
            <Input
              placeholder="Type DELETE to confirm"
              className="rounded-xl border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-600"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation("");
              }}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmation !== "DELETE" || isDeleting}
              onClick={handleDeleteAccount}
              className="rounded-lg"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete my account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
