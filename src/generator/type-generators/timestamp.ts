import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { RandomFn } from '../prng';

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * Generate timestamp values with optional bias for created_at/updated_at columns.
 * Output format: ISO 8601 string.
 */
export function generateTimestamp(column: IsomorphColumnProfile, columnName: string, rng: RandomFn): string {
  const now = Date.now();
  let minTime: number;
  let maxTime: number;

  if (column.min_value && column.max_value) {
    minTime = new Date(column.min_value as string).getTime();
    maxTime = new Date(column.max_value as string).getTime();
    // Guard against invalid dates
    if (isNaN(minTime)) minTime = now - TWO_YEARS_MS;
    if (isNaN(maxTime)) maxTime = now;
  } else {
    minTime = now - TWO_YEARS_MS;
    maxTime = now;
  }

  const name = columnName.toLowerCase();
  let t: number;

  if (name.includes('created_at') || name.includes('inserted_at') || name.includes('registered_at')) {
    // Bias toward older timestamps (skew toward min)
    const r = Math.pow(rng(), 2); // squares bias toward 0
    t = minTime + r * (maxTime - minTime);
  } else if (name.includes('updated_at') || name.includes('modified_at') || name.includes('last_')) {
    // Bias toward recent timestamps (skew toward max)
    const r = 1 - Math.pow(rng(), 2); // bias toward 1
    t = minTime + r * (maxTime - minTime);
  } else {
    // Uniform random
    t = minTime + rng() * (maxTime - minTime);
  }

  return new Date(t).toISOString();
}
