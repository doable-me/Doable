import type { IntegrationDefinition } from "../types.js";
import { DEVELOPER_TOOLS_PART1 } from './developer-tools-part1.js';
import { DEVELOPER_TOOLS_PART2 } from './developer-tools-part2.js';

export const DEVELOPER_TOOLS_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  ...DEVELOPER_TOOLS_PART1,
  ...DEVELOPER_TOOLS_PART2,
};
