import { IsomorphColumnProfile } from '../profiler/profile-writer';
import { TopValue } from '../profiler/stats-collector';
import { KeyReservoir } from './reservoir';
import { generateUUID } from './type-generators/uuid';
import { generateText } from './type-generators/text';
import { generateNumeric } from './type-generators/numeric';
import { generateBoolean } from './type-generators/boolean';
import { generateTimestamp } from './type-generators/timestamp';
import { generateEnum } from './type-generators/enum';
import { generateJsonb } from './type-generators/jsonb';
import { RandomFn } from './prng';

/**
 * Weighted random sample from top_values distribution.
 */
export function weightedSample(topValues: TopValue[], rng: RandomFn): string {
  const rand = rng() * 100;
  let cumulative = 0;
  for (const tv of topValues) {
    cumulative += tv.pct;
    if (rand <= cumulative) return tv.value;
  }
  return topValues[topValues.length - 1].value;
}

const NUMERIC_TYPES = new Set([
  'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real',
  'double precision', 'int2', 'int4', 'int8', 'float4', 'float8',
  'serial', 'bigserial',
]);


const TIMESTAMP_TYPES = new Set([
  'timestamp without time zone', 'timestamp with time zone',
  'timestamptz', 'timestamp', 'date', 'time', 'timetz',
]);

const BOOLEAN_TYPES = new Set(['boolean', 'bool']);

const UUID_TYPES = new Set(['uuid']);

const JSON_TYPES = new Set(['jsonb', 'json']);

/**
 * Central value dispatcher. Takes a column profile and returns a generated value.
 */
export function generateValue(
  column: IsomorphColumnProfile,
  columnName: string,
  tableName: string,
  reservoir: KeyReservoir,
  enums: Record<string, string[]>,
  rng: RandomFn
): unknown {
  // 1. Handle nulls first
  if (column.is_nullable && column.null_ratio > 0 && rng() < column.null_ratio) {
    return null;
  }

  // 2. FK column: sample from reservoir
  if (column.is_foreign_key && column.fk_parent_table && column.fk_parent_column) {
    if (reservoir.hasKeys(column.fk_parent_table, column.fk_parent_column)) {
      return reservoir.sample(column.fk_parent_table, column.fk_parent_column, rng);
    } else {
      // Parent has no keys yet (e.g. row 0 of self-referencing FK, or parent was empty)
      if (column.is_nullable) return null;
      // If not nullable, we are forced to fall through to avoid crashing, but it will fail FK validation
    }
  }

  // 3. ENUM_LIKE distribution: weighted random from top_values
  if (column.distribution === 'ENUM_LIKE' && column.top_values && column.top_values.length > 0) {
    return weightedSample(column.top_values, rng);
  }

  // 4. Route to type generator
  const dataType = column.data_type?.toLowerCase() ?? '';
  const udtName = column.udt_name?.toLowerCase() ?? '';

  // UUID
  if (UUID_TYPES.has(dataType) || UUID_TYPES.has(udtName)) {
    return generateUUID();
  }

  // Boolean
  if (BOOLEAN_TYPES.has(dataType) || BOOLEAN_TYPES.has(udtName)) {
    return generateBoolean(column, rng);
  }

  // Numeric (includes serial detection)
  if (NUMERIC_TYPES.has(dataType) || NUMERIC_TYPES.has(udtName)
      || (column.column_default && column.column_default.includes('nextval'))) {
    return generateNumeric(column, columnName, tableName, rng);
  }

  // Timestamp / date
  if (TIMESTAMP_TYPES.has(dataType) || TIMESTAMP_TYPES.has(udtName)) {
    return generateTimestamp(column, columnName, rng);
  }

  // JSONB / JSON
  if (JSON_TYPES.has(dataType) || JSON_TYPES.has(udtName)) {
    return generateJsonb(column, rng);
  }

  // Postgres ENUM type (USER-DEFINED)
  if (dataType === 'user-defined' && enums[udtName]) {
    return generateEnum(column, enums[udtName], rng);
  }

  // ARRAY type
  if (dataType === 'array' || dataType === 'ARRAY') {
    return '{}'; // Empty array for V1
  }

  // Text / default fallback — handles both known text types and any
  // unrecognised data_type so the function always returns a value.
  return generateText(column, columnName, rng);
}
