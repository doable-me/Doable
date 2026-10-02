export const locales = ["zh-CN", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookie = "doable_locale";
export function normalizeLocale(value: unknown): Locale {
  return value === "zh-CN" ? "zh-CN" : defaultLocale;
}
