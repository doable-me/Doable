import type postgres from "postgres";
import { aiSettingsProviderQueries } from "./ai-settings-providers.js";
import { aiSettingsPreferenceQueries } from "./ai-settings-preferences.js";

export function aiSettingsQueries(sql: postgres.Sql, encryptionKey = "doable-dev-encryption-key") {
  return {
    ...aiSettingsProviderQueries(sql, encryptionKey),
    ...aiSettingsPreferenceQueries(sql),
  };
}