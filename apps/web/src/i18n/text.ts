import index from "../../messages/index.json";
import zh from "../../messages/zh-CN.json";
import en from "../../messages/en.json";
export type UiValues = Record<string, string | number | null | undefined>;
export interface UiTranslator {
  readonly locale: string;
  <T>(value: T): T;
  (value: string, values: UiValues): string;
}
const keys: Record<string, string> = { ...index };
// Resolve stored UI feedback in either language when the user switches locales.
// This lookup is only invoked at explicitly localized interface call sites.
for (const catalog of [zh.ui, en.ui]) {
  for (const [key, value] of Object.entries(catalog)) keys[value] ??= key;
}
// Only explicitly extracted interface messages are translated. This function
// never scans the DOM, changes user data, or sends text to a translation service.
export function createUiTranslator(
  getMessage: (key: string, values?: UiValues) => unknown,
  locale = "zh-CN",
): UiTranslator {
  const translate = <T>(value: T, values?: UiValues): T => {
    if (typeof value !== "string") return value;
    const key = keys[value];
    if (!key) return value;
    const message = getMessage(
      key,
      values
        ? Object.fromEntries(
            Object.entries(values).map(([name, item]) => [
              name,
              item == null ? String(item) : item,
            ]),
          )
        : undefined,
    );
    return (typeof message === "string" ? message : value) as T;
  };
  return Object.assign(translate, { locale });
}
const textFields = new Set([
  "label",
  "title",
  "desc",
  "description",
  "subtitle",
  "placeholder",
  "tooltip",
  "helpText",
  "emptyText",
  "emptyMessage",
  "confirmText",
  "cancelText",
  "buttonText",
  "heading",
  "hint",
  "aria-label",
  "alt",
]);
// For static UI configuration arrays only; never call with API/user records.
// IDs, enum values, URLs, commands and callbacks retain their original values.
export function translateUiData<T>(value: T, t: UiTranslator): T {
  if (Array.isArray(value))
    return value.map((item) => translateUiData(item, t)) as T;
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      textFields.has(key) && typeof item === "string"
        ? t(item)
        : Array.isArray(item) ||
            (item && typeof item === "object" && !("$$typeof" in item))
          ? translateUiData(item, t)
          : item,
    ]),
  ) as T;
}
