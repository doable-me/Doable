"use client";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createUiTranslator, translateUiData } from "./text";
export function useUiData<T>(data: T): T {
  const locale = useLocale();
  const messages = useTranslations("ui");
  return useMemo(
    () =>
      translateUiData(
        data,
        createUiTranslator((key) => messages.raw(key)),
      ),
    [data, locale, messages],
  );
}
