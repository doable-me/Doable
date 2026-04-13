import type { IntegrationDefinition } from "../types.js";
import { FINANCE_ECOMMERCE_PART1 } from './finance-ecommerce-part1.js';
import { FINANCE_ECOMMERCE_PART2 } from './finance-ecommerce-part2.js';
import { FINANCE_ECOMMERCE_PART3 } from './finance-ecommerce-part3.js';
import { FINANCE_ECOMMERCE_PART4 } from './finance-ecommerce-part4.js';

export const FINANCE_ECOMMERCE_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  ...FINANCE_ECOMMERCE_PART1,
  ...FINANCE_ECOMMERCE_PART2,
  ...FINANCE_ECOMMERCE_PART3,
  ...FINANCE_ECOMMERCE_PART4,
};
