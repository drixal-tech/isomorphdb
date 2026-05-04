import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { RandomFn } from '../prng';

const REALISTIC_KEYS = ['source', 'campaign', 'metadata', 'tags', 'config', 'settings',
  'preferences', 'options', 'data', 'info', 'type', 'category', 'label', 'ref'];

const REALISTIC_VALUES = ['web', 'mobile', 'organic', 'paid', 'direct', 'email',
  'social', 'referral', 'search', 'default', 'active', 'enabled', 'v1', 'v2'];

function randomItem<T>(arr: T[], rng: RandomFn): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate a JSONB value — simple key-value objects for V1.
 */
export function generateJsonb(column: IsomorphColumnProfile, rng: RandomFn): Record<string, string> {
  // If top_values available, try to use one of the existing JSON structures
  if (column.top_values && column.top_values.length > 0) {
    try {
      const picked = column.top_values[Math.floor(rng() * column.top_values.length)];
      return JSON.parse(picked.value);
    } catch {
      // Fall through to generate fresh
    }
  }

  // Generate 1-5 key-value pairs
  const numKeys = 1 + Math.floor(rng() * 5);
  const obj: Record<string, string> = {};
  const usedKeys = new Set<string>();

  for (let i = 0; i < numKeys; i++) {
    let key: string;
    do {
      key = randomItem(REALISTIC_KEYS, rng);
    } while (usedKeys.has(key));
    usedKeys.add(key);
    obj[key] = randomItem(REALISTIC_VALUES, rng);
  }

  return obj;
}
