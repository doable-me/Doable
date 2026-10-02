"use client";
import { useUiText } from "@/i18n/use-ui-text";

import type { FormEvent } from "react";
import {
  User,
  Shield,
  Monitor,
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { MfaSection } from "./mfa-section";

// ─── Profile Section ────────────────────────────────────────

export function ProfileSection({
  user,
  displayName,
  setDisplayName,
  initials,
  profileSaving,
  profileSuccess,
  profileError,
  onSave,
}: {
  user: {
    displayName?: string;
    email?: string;
    avatarUrl?: string | null;
  } | null;
  displayName: string;
  setDisplayName: (v: string) => void;
  initials: string;
  profileSaving: boolean;
  profileSuccess: boolean;
  profileError: string | null;
  onSave: (e: FormEvent) => void;
}) {
  const ui = useUiText();

  return (
    <SettingsSection
      icon={User}
      title={ui("Profile")}
      description={ui("Your personal information")}
    >
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
            <p className="text-sm font-medium text-foreground">
              {user?.displayName ?? ui("User")}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName" className="text-foreground">
            {ui("Display name")}
          </Label>
          <Input
            id="displayName"
            type="text"
            placeholder={ui("Your display name")}
            className="rounded-xl"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">
            {ui("Email")}
          </Label>
          <Input
            id="email"
            type="email"
            disabled
            className="rounded-xl text-muted-foreground"
            value={user?.email ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {ui("Contact support to change your email address.")}
          </p>
        </div>
        {profileError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {profileError}
          </p>
        )}
        <div className="flex items-center gap-3">
          {/* BUG-006: disable Save when display name is empty/whitespace-only */}
          <Button
            type="submit"
            size="sm"
            disabled={profileSaving || displayName.trim() === ""}
            className="rounded-lg bg-brand-700 text-white hover:bg-brand-800"
          >
            {profileSaving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {ui("Saving...")}
              </>
            ) : profileSuccess ? (
              <>
                <Check className="mr-2 h-3.5 w-3.5" />
                {ui("Saved")}
              </>
            ) : (
              ui("Save changes")
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
  setCurrentPassword: (v: string) => void;
  setNewPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  setShowCurrentPassword: (v: boolean) => void;
  setShowNewPassword: (v: boolean) => void;
  onPasswordChange: (e: FormEvent) => void;
}) {
  const ui = useUiText();

  return (
    <SettingsSection
      icon={Shield}
      title={ui("Security")}
      description={ui("Password and authentication")}
    >
      <div className="space-y-6">
        <form onSubmit={onPasswordChange} className="space-y-4">
          <h4 className="text-sm font-medium text-foreground">
            {ui("Change password")}
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
              <span>{ui("Password updated successfully.")}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-foreground">
              {ui("Current password")}
            </Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                placeholder={ui("Enter current password")}
                autoComplete="current-password"
                required
                className="rounded-xl pr-10"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
            <Label htmlFor="newPassword" className="text-foreground">
              {ui("New password")}
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder={ui("At least 8 characters")}
                autoComplete="new-password"
                required
                minLength={8}
                className="rounded-xl pr-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                      className={`h-1 flex-1 rounded-full transition-colors ${level <= newPasswordStrength.score ? newPasswordStrength.color : "bg-muted"}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {newPasswordStrength.label}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword" className="text-foreground">
              {ui("Confirm new password")}
            </Label>
            <Input
              id="confirmNewPassword"
              type="password"
              placeholder={ui("Re-enter new password")}
              autoComplete="new-password"
              required
              className="rounded-xl"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-xs text-red-400">
                {ui("Passwords do not match")}
              </p>
            )}
          </div>
          {/* BUG-007: disable Update password when fields empty or new/confirm mismatch */}
          <Button
            type="submit"
            size="sm"
            disabled={
              passwordSaving ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword
            }
            className="rounded-lg bg-brand-700 text-white hover:bg-brand-800"
          >
            {passwordSaving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {ui("Updating...")}
              </>
            ) : (
              ui("Update password")
            )}
          </Button>
        </form>
        <div className="border-t border-border" />
        <MfaSection />
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
  const ui = useUiText();

  return (
    <SettingsSection
      icon={Palette}
      title={ui("Appearance")}
      description={ui("Customize how Doable looks")}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <Label className="text-foreground">{ui("Theme")}</Label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "light" as const, label: ui("Light"), icon: Sun },
              { value: "dark" as const, label: ui("Dark"), icon: Moon },
              { value: "system" as const, label: ui("System"), icon: Monitor },
            ].map((option) => {
              const isActive = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onThemeChange(option.value)}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                    isActive
                      ? "border-brand-600 bg-brand-600/10 text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{option.label}</span>
                  {/* BUG-010: always render Check in same position; toggle visibility for layout consistency */}
                  <Check
                    className={`h-3.5 w-3.5 ${isActive ? "text-brand-600" : "invisible"}`}
                    aria-hidden={!isActive}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <Label className="text-foreground">{ui("Brand Color")}</Label>
          <div className="flex flex-wrap gap-3">
            {BRAND_THEMES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => onBrandThemeChange(bt.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  brandTheme === bt.value
                    ? "border-brand-600 bg-brand-600/10 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: bt.preview }}
                />
                <span className="text-xs font-medium">{bt.label}</span>
                {brandTheme === bt.value && (
                  <Check className="h-3.5 w-3.5 text-brand-600" />
                )}
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
  const ui = useUiText();

  return (
    <SettingsSection
      icon={Trash2}
      title={ui("Danger Zone")}
      description={ui("Irreversible and destructive actions")}
    >
      <div className="flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-red-400">
            {ui("Delete account")}
          </p>
          <p className="text-xs text-muted-foreground">
            {" "}
            {ui(
              "Permanently delete your account and all associated data. This cannot be undone.",
            )}{" "}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0 rounded-lg"
          onClick={onShowDeleteDialog}
        >
          {" "}
          {ui("Delete account")}{" "}
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
  const ui = useUiText();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            {ui("Delete Account")}{" "}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {" "}
            {ui(
              "This action is permanent and cannot be undone. All of your projects, data, and settings will be permanently deleted.",
            )}{" "}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-foreground">
            {ui("Type")}{" "}
            <strong className="text-foreground">{ui("DELETE")}</strong>{" "}
            {ui("to confirm:")}
          </p>
          <Input
            placeholder={ui("Type DELETE to confirm")}
            className="rounded-xl"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              setDeleteConfirmation("");
            }}
          >
            {ui("Cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={deleteConfirmation !== "DELETE" || isDeleting}
            onClick={onDelete}
            className="rounded-lg"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {ui("Deleting...")}
              </>
            ) : (
              ui("Delete my account")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
