import type postgres from "postgres";
import { aiSettingsProviderQueries } from "./ai-settings-providers.js";
import { aiSettingsPreferenceQueries } from "./ai-settings-preferences.js";
import { getEncryptionKey } from "../secrets.js";

export function aiSettingsQueries(sql: postgres.Sql, encryptionKey = getEncryptionKey()) {
  return {
    ...aiSettingsProviderQueries(sql, encryptionKey),
    ...aiSettingsPreferenceQueries(sql),
  };
}