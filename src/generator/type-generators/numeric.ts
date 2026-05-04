import { IsomorphColumnProfile } from '../../profiler/profile-writer';
import { RandomFn } from '../prng';

// Auto-incrementing counters for serial types
const serialCounters = new Map<string, number>();

/**
 * Get or create a serial counter for a specific column.
 */
function getNextSerial(tableName: string, columnName: string): number {
  const key = `${tableName}.${columnName}`;
  const current = serialCounters.get(key) ?? 0;
  const next = current + 1;
  serialCounters.set(key, next);
  return next;
}

/** Reset all serial counters (for testing). */
export function resetSerialCounters(): void {
  serialCounters.clear();
}

/**
 * Box-Muller transform for normally distributed values.
 */
function boxMuller(mean: number, stddev: number, rng: RandomFn): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/**
 * Generate numeric values based on profile bounds and distribution.
 */
export function generateNumeric(
  column: IsomorphColumnProfile,
  columnName: string,
  tableName: string,
  rng: RandomFn
): number {
  const udtName = column.udt_name?.toLowerCase() ?? '';
  const dataType = column.data_type?.toLowerCase() ?? '';

  // Serial / bigserial: auto-increment
  if (udtName === 'serial' || udtName === 'bigserial'
      || dataType === 'serial' || dataType === 'bigserial'
      || (column.column_default && column.column_default.includes('nextval'))) {
    return getNextSerial(tableName, columnName);
  }

  const isInteger = ['integer', 'bigint', 'smallint', 'int2', 'int4', 'int8']
    .includes(dataType) || ['int2', 'int4', 'int8'].includes(udtName);

  const min = column.min_value != null ? Number(column.min_value) : (isInteger ? 1 : 0.01);
  const max = column.max_value != null ? Number(column.max_value) : (isInteger ? 100000 : 10000.00);

  // Use Box-Muller for normally distributed values when stddev is available
  if (column.stddev_value != null && column.avg_value != null) {
    let value = boxMuller(column.avg_value, column.stddev_value, rng);
    // Clamp to bounds
    value = Math.max(min, Math.min(max, value));

    if (isInteger) return Math.round(value);

    const scale = column.numeric_scale ?? 2;
    return Number(value.toFixed(scale));
  }

  // Uniform random between min and max
  const value = min + rng() * (max - min);

  if (isInteger) return Math.round(value);

  const scale = column.numeric_scale ?? 2;
  return Number(value.toFixed(scale));
}
