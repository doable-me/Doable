"use client";

import type { FormEvent } from "react";
import {
  User,
  Shield,
  Monitor,
  Lock,
  Sun,
  Moon,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BRAND_THEMES, type BrandTheme } from "@/hooks/use-brand-theme";
import { SettingsSection } from "./settings-helpers";

// ─── Profile Section ────────────────────────────────────────

export function ProfileSection({
  user,
  displayName,
  setDisplayName,
  initials,
  profileSaving,
  profileSuccess,
  onSave,
}: {
  user: { displayName?: string; email?: string; avatarUrl?: string | null } | null;
  displayName: string;
  setDisplayName: (v: string) => void;
  initials: string;
  profileSaving: boolean;
  profileSuccess: boolean;
  onSave: (e: FormEvent) => void;
}) {
  return (
    <SettingsSection icon={User} title="Profile" description="Your personal information">
      <form onSubmit={onSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {user?.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user?.displayName} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-brand-500 to-brand-600 text-lg font-medium text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-white">{user?.displayName ?? "User"}</p>
            <p className="text-xs text-zinc-500">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName" className="text-zinc-300">Display name</Label>
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
          <Label htmlFor="email" className="text-zinc-300">Email</Label>
          <Input
            id="email"
            type="email"
            disabled
            className="rounded-xl border-zinc-700 bg-zinc-800/50 text-zinc-400 placeholder:text-zinc-600"
            value={user?.email ?? ""}
          />
          <p className="text-xs text-zinc-500">Contact support to change your email address.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={profileSaving} className="rounded-lg bg-brand-700 text-white hover:bg-brand-800">
            {profileSaving ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving...</>
            ) : profileSuccess ? (
              <><Check className="mr-2 h-3.5 w-3.5" />Saved</>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

// ─── Security Section ───────────────────────────────────────

export function SecuritySection({
  currentPassword,
  newPassword,
  confirmPassword,
  showCurrentPassword,
  showNewPassword,
  passwordSaving,
  passwordSuccess,
  passwordError,
  newPasswordStrength,
  twoFactorEnabled,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
  setShowCurrentPassword,
  setShowNewPassword,
  onPasswordChange,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  showCurrentPassword: boolean;
  showNewPassword: boolean;
  passwordSaving: boolean;
  passwordSuccess: boolean;
  passwordError: string | null;
  newPasswordStrength: { score: number; label: string; color: string };
  twoFactorEnabled: boolean;
  setCurrentPassword: (v: string) => void;
  setNewPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  setShowCurrentPassword: (v: boolean) => void;
  setShowNewPassword: (v: boolean) => void;
  onPasswordChange: (e: FormEvent) => void;
}) {
  return (
    <SettingsSection icon={Shield} title="Security" description="Password and authentication">
      <div className="space-y-6">
        <form onSubmit={onPasswordChange} className="space-y-4">
          <h4 className="text-sm font-medium text-zinc-200">Change password</h4>
          {passwordError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{passwordError}</span>
            </div>
          )}
          {passwordSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-950/50 px-3 py-2.5 text-sm text-green-400">
              <Check className="h-4 w-4 shrink-0" /><span>Password updated successfully.</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-zinc-300">Current password</Label>
            <div className="relative">
              <Input id="currentPassword" type={showCurrentPassword ? "text" : "password"} placeholder="Enter current password" autoComplete="current-password" required className="rounded-xl border-zinc-700 bg-zinc-800/50 pr-10 text-white placeholder:text-zinc-500" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-zinc-300">New password</Label>
            <div className="relative">
              <Input id="newPassword" type={showNewPassword ? "text" : "password"} placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} className="rounded-xl border-zinc-700 bg-zinc-800/50 pr-10 text-white placeholder:text-zinc-500" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors" onClick={() => setShowNewPassword(!showNewPassword)}>
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${level <= newPasswordStrength.score ? newPasswordStrength.color : "bg-zinc-700"}`} />
                  ))}
                </div>
                <p className="text-xs text-zinc-500">{newPasswordStrength.label}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword" className="text-zinc-300">Confirm new password</Label>
            <Input id="confirmNewPassword" type="password" placeholder="Re-enter new password" autoComplete="new-password" required className="rounded-xl border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}
          </div>
          <Button type="submit" size="sm" disabled={passwordSaving} className="rounded-lg bg-brand-700 text-white hover:bg-brand-800">
            {passwordSaving ? (<><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Updating...</>) : ("Update password")}
          </Button>
        </form>
        <div className="border-t border-zinc-800" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">Two-factor authentication</p>
              <p className="text-xs text-zinc-500">Add an extra layer of security to your account</p>
            </div>
          </div>
          <button type="button" className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${twoFactorEnabled ? "bg-brand-700" : "bg-zinc-700"}`} title="Two-factor authentication coming soon">
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-zinc-600 -mt-3 ml-7">Coming soon</p>
      </div>
    </SettingsSection>
  );
}

// ─── Appearance Section ─────────────────────────────────────

export function AppearanceSection({
  theme,
  brandTheme,
  onThemeChange,
  onBrandThemeChange,
}: {
  theme: "dark" | "light" | "system";
  brandTheme: string;
  onThemeChange: (t: "dark" | "light" | "system") => void;
  onBrandThemeChange: (v: BrandTheme) => void;
}) {
  return (
    <SettingsSection icon={Palette} title="Appearance" description="Customize how Doable looks">
      <div className="space-y-5">
        <div className="space-y-3">
          <Label className="text-zinc-300">Theme</Label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as const, label: "Light", icon: Sun, comingSoon: true },
              { value: "dark" as const, label: "Dark", icon: Moon, comingSoon: false },
              { value: "system" as const, label: "System", icon: Monitor, comingSoon: true },
            ]).map((option) => {
              const isActive = theme === option.value;
              const isDisabled = option.comingSoon;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && onThemeChange(option.value)}
                  title={isDisabled ? "Light mode is coming soon" : undefined}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                    isDisabled
                      ? "cursor-not-allowed border-zinc-800/60 bg-zinc-800/20 text-zinc-600"
                      : isActive
                      ? "border-brand-600 bg-brand-600/10 text-white"
                      : "border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{option.label}</span>
                  {isDisabled ? (
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">Soon</span>
                  ) : (
                    isActive && <Check className="h-3.5 w-3.5 text-brand-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <Label className="text-zinc-300">Brand Color</Label>
          <div className="flex flex-wrap gap-3">
            {BRAND_THEMES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => onBrandThemeChange(bt.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  brandTheme === bt.value
                    ? "border-brand-600 bg-brand-600/10 text-white"
                    : "border-zinc-800 bg-zinc-800/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: bt.preview }} />
                <span className="text-xs font-medium">{bt.label}</span>
                {brandTheme === bt.value && <Check className="h-3.5 w-3.5 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

// ─── Danger Zone + Delete Dialog ────────────────────────────

export function DangerZoneSection({
  onShowDeleteDialog,
}: {
  onShowDeleteDialog: () => void;
}) {
  return (
    <SettingsSection icon={Trash2} title="Danger Zone" description="Irreversible and destructive actions">
      <div className="flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-red-400">Delete account</p>
          <p className="text-xs text-zinc-500">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
        </div>
        <Button variant="destructive" size="sm" className="shrink-0 rounded-lg" onClick={onShowDeleteDialog}>
          Delete account
        </Button>
      </div>
    </SettingsSection>
  );
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  deleteConfirmation,
  setDeleteConfirmation,
  isDeleting,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deleteConfirmation: string;
  setDeleteConfirmation: (v: string) => void;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />Delete Account
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            This action is permanent and cannot be undone. All of your projects, data, and settings will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-zinc-300">Type <strong className="text-white">DELETE</strong> to confirm:</p>
          <Input placeholder="Type DELETE to confirm" className="rounded-xl border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-600" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); setDeleteConfirmation(""); }} className="text-zinc-400 hover:text-white">Cancel</Button>
          <Button variant="destructive" disabled={deleteConfirmation !== "DELETE" || isDeleting} onClick={onDelete} className="rounded-lg">
            {isDeleting ? (<><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Deleting...</>) : ("Delete my account")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
