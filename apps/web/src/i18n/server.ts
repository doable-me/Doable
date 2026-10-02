import { getTranslations, getLocale } from "next-intl/server";
import { createUiTranslator } from "./text";
export async function getUiText() {
  const messages = await getTranslations("ui");
  return createUiTranslator(
    (key, values) =>
      values
        ? messages(key, values as Record<string, string | number>)
        : messages.raw(key),
    await getLocale(),
  );
}
