import { useTranslations, useLocale } from "next-intl";
import { createUiTranslator, type UiTranslator } from "./text";
// next-intl supplies a locale-scoped stable translator. Weak keys avoid retaining
// server requests and let callbacks depend on `ui` without rerender loops.
const translators = new WeakMap<object, UiTranslator>();
export function useUiText() {
  const locale = useLocale();
  const messages = useTranslations("ui");
  let ui = translators.get(messages);
  if (!ui || ui.locale !== locale) {
    ui = createUiTranslator(
      (key, values) =>
        values
          ? messages(key, values as Record<string, string | number>)
          : messages.raw(key),
      locale,
    );
    translators.set(messages, ui);
  }
  return ui;
}
