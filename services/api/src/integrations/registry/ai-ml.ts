import type { IntegrationDefinition } from "../types.js";
import { AI_ML_PART1 } from './ai-ml-part1.js';
import { AI_ML_PART2 } from './ai-ml-part2.js';

export const AI_ML_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  ...AI_ML_PART1,
  ...AI_ML_PART2,
};
