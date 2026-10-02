"use client";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import { apiFetch, getStoredTokens } from "@/lib/api";
import { localeCookie, normalizeLocale, type Locale } from "./config";
import zh from "../../messages/zh-CN.json";
import en from "../../messages/en.json";
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  syncLocale: (locale: Locale) => void;
  error: string | null;
  saving: boolean;
}>({
  locale: "en",
  setLocale: () => {},
  syncLocale: () => {},
  error: null,
  saving: false,
});
export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, updateLocale] = useState(initialLocale);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const syncLocale = useCallback(
    (next: Locale) => {
      const value = normalizeLocale(next);
      document.cookie = `${localeCookie}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      updateLocale(value);
      router.refresh();
      // Mirror only this non-sensitive preference for cross-tab synchronization.
      try {
        localStorage.setItem(localeCookie, value);
      } catch {}
    },
    [router],
  );
  const setLocale = useCallback(
    async (next: Locale) => {
      if (saving) return;
      setError(null);
      setSaving(true);
      const value = normalizeLocale(next);
      try {
        // Persist before applying a signed-in preference; failure is visible and keeps current locale.
        if (getStoredTokens().accessToken)
          await apiFetch("/auth/me/language", {
            method: "PATCH",
            body: JSON.stringify({ interfaceLanguage: value }),
          });
        syncLocale(value);
      } catch {
        setError(
          locale === "en"
            ? "Could not save language. Please try again."
            : "无法保存语言，请重试。",
        );
      } finally {
        setSaving(false);
      }
    },
    [syncLocale, saving, locale],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === localeCookie && event.newValue) {
        updateLocale(normalizeLocale(event.newValue));
        router.refresh();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [router]);
  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, syncLocale, error, saving }}
    >
      <NextIntlClientProvider
        timeZone="UTC"
        locale={locale}
        messages={(locale === "en" ? en : zh) as AbstractIntlMessages}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
export function LocaleAccountSync({
  userId,
  interfaceLanguage,
}: {
  userId?: string;
  interfaceLanguage?: string | null;
}) {
  const { syncLocale } = useContext(LocaleContext);
  useEffect(() => {
    if (userId && (interfaceLanguage === "en" || interfaceLanguage === "zh-CN"))
      syncLocale(interfaceLanguage);
  }, [userId, interfaceLanguage, syncLocale]);
  return null;
}
export function LanguageSwitcher({
  id = "platform-language",
  compact = false,
}: {
  id?: string;
  compact?: boolean;
}) {
  const { locale, setLocale, error, saving } = useContext(LocaleContext);
  return (
    <div className="space-y-1" data-testid="language-switcher">
      <label
        className={
          compact ? "sr-only" : "block text-xs font-medium text-foreground"
        }
        htmlFor={id}
      >
        语言 / Language
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground">
        <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
        <select
          id={id}
          value={locale}
          disabled={saving}
          onChange={(e) => void setLocale(normalizeLocale(e.target.value))}
          className="min-h-11 w-full min-w-0 cursor-pointer bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-label="语言 / Language"
        >
          <option value="zh-CN" lang="zh-CN">
            简体中文
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
export function PublicLanguageSwitcher() {
  const path = usePathname();
  if (
    ![
      "/",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/terms",
      "/privacy",
    ].includes(path)
  )
    return null;
  return (
    <div className="absolute right-3 top-3 z-20 w-36">
      <LanguageSwitcher compact id="public-language" />
    </div>
  );
}
