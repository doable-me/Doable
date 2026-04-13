import type { IntegrationDefinition } from "../types.js";
import { PRODUCTIVITY_PART1 } from './productivity-part1.js';
import { PRODUCTIVITY_PART2 } from './productivity-part2.js';

export const PRODUCTIVITY_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  ...PRODUCTIVITY_PART1,
  ...PRODUCTIVITY_PART2,
};
