import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { TopValue } from '../../profiler/stats-collector';
import { RandomFn } from '../prng';

/**
 * Generate boolean values, optionally weighted from top_values profile.
 */
export function generateBoolean(column: IsomorphColumnProfile, rng: RandomFn): boolean {
  if (column.top_values && column.top_values.length > 0) {
    // Weighted sampling from top_values
    const trueEntry = column.top_values.find(
      (tv: TopValue) => tv.value === 'true' || tv.value === 't' || tv.value === '1'
    );
    if (trueEntry) {
      return rng() * 100 < trueEntry.pct;
    }
  }
  // Default: 50/50
  return rng() < 0.5;
}
