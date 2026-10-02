import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeCookie, normalizeLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = normalizeLocale((await cookies()).get(localeCookie)?.value);
  return {
    locale,
    timeZone: "UTC",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
