import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { weightedSample } from '../value-generator';
import { RandomFn } from '../prng';

/**
 * Generate ENUM values — either from weighted top_values or uniform from enum definition.
 */
export function generateEnum(
  column: IsomorphColumnProfile,
  enumValues: string[] | undefined,
  rng: RandomFn
): string {
  // If top_values available in profile, use weighted sampling
  if (column.top_values && column.top_values.length > 0) {
    return weightedSample(column.top_values, rng);
  }

  // Fall back to uniform sampling from enum definition
  if (enumValues && enumValues.length > 0) {
    return enumValues[Math.floor(rng() * enumValues.length)];
  }

  // Shouldn't happen, but fallback
  return 'unknown';
}
