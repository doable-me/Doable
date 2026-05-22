// =============================================================================
// Tailwind CSS Mapper — Barrel re-export
// Split into: tw-typography, tw-layout, tw-dimensions, tw-colors,
//             tw-converter, tw-groups
// =============================================================================

export { cssToTailwind } from './tw-converter.js';
export { getTailwindPropertyGroup, isClassInGroup } from './tw-groups.js';

import { cssToTailwind } from './tw-converter.js';
import { isClassInGroup } from './tw-groups.js';

/**
 * Given an existing class list string, a CSS property, and a new value,
 * returns a new class list with the old class for that property replaced
 * by the new one.
 */
export function updateClassList(
  existingClasses: string,
  property: string,
  value: string,
): string {
  const newClass = cssToTailwind(property, value);
  if (!newClass) return existingClasses;

  const classes = existingClasses.split(/\s+/).filter(Boolean);
  const filtered = classes.filter((cls) => !isClassInGroup(cls, property));
  filtered.push(newClass);

  return filtered.join(' ');
}

/**
 * Removes all Tailwind classes associated with the given CSS property
 * from the class list string.
 */
export function removePropertyClasses(
  existingClasses: string,
  property: string,
): string {
  const classes = existingClasses.split(/\s+/).filter(Boolean);
  const filtered = classes.filter((cls) => !isClassInGroup(cls, property));
  return filtered.join(' ');
}