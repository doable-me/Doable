import type { IntegrationDefinition } from "../types.js";
import { CRM_MARKETING_SOCIAL_PART1 } from './crm-marketing-social-part1.js';
import { CRM_MARKETING_SOCIAL_PART2 } from './crm-marketing-social-part2.js';

export const CRM_MARKETING_SOCIAL_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  ...CRM_MARKETING_SOCIAL_PART1,
  ...CRM_MARKETING_SOCIAL_PART2,
};
