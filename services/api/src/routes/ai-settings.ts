import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { aiSettingsCopilotRoutes } from "./ai-settings-copilot.js";
import { aiSettingsProviderRoutes } from "./ai-settings-providers.js";
import { aiSettingsConfigRoutes } from "./ai-settings-config.js";

export const aiSettingsRoutes = new Hono<AuthEnv>({ strict: false });

aiSettingsRoutes.route("/", aiSettingsCopilotRoutes);
aiSettingsRoutes.route("/", aiSettingsProviderRoutes);
aiSettingsRoutes.route("/", aiSettingsConfigRoutes);