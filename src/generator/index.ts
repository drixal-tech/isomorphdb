import { IsomorphProfile, IsomorphTableProfile } from '../profiler/profile-writer';
import { KeyReservoir } from './reservoir';
import { generateValue } from './value-generator';
import { createSeededRng, defaultRng, RandomFn } from './prng';
import { resetSerialCounters } from './type-generators/numeric';
import { createProgressBar } from '../utils/progress';
import logger from '../utils/logger';

export interface GeneratedData {
  tableName: string;
  columns: string[];
  rows: unknown[][];
}

export interface GenerationResult {
  tables: GeneratedData[];
  totalRows: number;
}

/**
 * Calculate proportional row counts per table based on real row counts.
 */
function calculateRowCounts(
  profile: IsomorphProfile,
  requestedTotal: number
): Map<string, number> {
  const counts = new Map<string, number>();
  const totalRealRows = Object.values(profile.tables)
    .reduce((sum, t) => sum + t.row_count, 0);

  if (totalRealRows === 0) {
    // If all tables have 0 rows, distribute evenly
    const perTable = Math.max(1, Math.floor(requestedTotal / Object.keys(profile.tables).length));
    for (const tableName of Object.keys(profile.tables)) {
      counts.set(tableName, perTable);
    }
    return counts;
  }

  for (const [tableName, table] of Object.entries(profile.tables)) {
    const syntheticCount = Math.max(1, Math.round(
      (table.row_count / totalRealRows) * requestedTotal
    ));
    counts.set(tableName, syntheticCount);
  }

  return counts;
}

/**
 * Generate data for a single table.
 */
function generateTableData(
  tableName: string,
  table: IsomorphTableProfile,
  rowCount: number,
  reservoir: KeyReservoir,
  enums: Record<string, string[]>,
  rng: RandomFn
): GeneratedData {
  const columns = Object.keys(table.columns);
  const rows: unknown[][] = [];
  
  // Track seen values for unique columns to avoid collisions
  const seenUniques = new Map<string, Set<unknown>>();
  for (const colName of columns) {
    if (table.columns[colName].is_unique || table.columns[colName].is_primary_key) {
      seenUniques.set(colName, new Set());
    }
  }

  for (let i = 0; i < rowCount; i++) {
    const row: unknown[] = [];
    for (const colName of columns) {
      const col = table.columns[colName];
      let value = generateValue(col, colName, tableName, reservoir, enums, rng);
      let valKey = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      // Enforce uniqueness
      if (seenUniques.has(colName)) {
        const seen = seenUniques.get(colName)!;
        
        // If it's an FK referencing a 1-to-1 unique column, we must sample an unused key
        if (col.is_foreign_key && col.fk_parent_table && col.fk_parent_column) {
          let attempts = 0;
          while (seen.has(valKey) && attempts < 20) {
            value = reservoir.sample(col.fk_parent_table, col.fk_parent_column, rng);
            valKey = typeof value === 'object' ? JSON.stringify(value) : String(value);
            attempts++;
          }
        } else {
          // Normal generation uniqueness
          let attempts = 0;
          while (seen.has(valKey) && attempts < 20) {
            value = generateValue(col, colName, tableName, reservoir, enums, rng);
            valKey = typeof value === 'object' ? JSON.stringify(value) : String(value);
            attempts++;
          }
          // Fallback to guarantee uniqueness if still colliding
          if (seen.has(valKey) && value !== null) {
            if (typeof value === 'string') {
              if (col.data_type === 'uuid' || col.udt_name === 'uuid') {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                value = require('crypto').randomUUID();
              } else {
                value = `${value}_${i}_${rng().toString(36).substring(2, 6)}`;
              }
            } else if (typeof value === 'number') {
              value = (value as number) + i + Math.floor(rng() * 10000);
            } else if (typeof value === 'object') {
              // Mutate JSON object to be unique
              value = { ...value, _uniq: `${i}_${rng().toString(36).substring(2, 6)}` };
            }
            valKey = typeof value === 'object' ? JSON.stringify(value) : String(value);
          }
        }
        seen.add(valKey);
      }
      
      row.push(value);
    }
    
    // Store generated PKs and Unique values in reservoir immediately 
    // so self-referencing FKs on the next row can use them.
    // Note: The reservoir intentionally stores the raw value (row[ci]) 
    // to preserve correct types for FKs, whereas seenUniques tracks 
    // the stringified valKey to ensure correct Set semantics.
    for (let ci = 0; ci < columns.length; ci++) {
      const colName = columns[ci];
      const col = table.columns[colName];
      if (col.is_primary_key || col.is_unique) {
        reservoir.appendKey(tableName, colName, row[ci]);
      }
    }
    
    rows.push(row);
  }

  return { tableName, columns, rows };
}

/**
 * Generation orchestrator: iterates tables in topological order,
 * generates rows proportionally, and stores PKs in reservoir.
 */
export async function runGenerator(
  profile: IsomorphProfile,
  requestedRows: number,
  seed?: number
): Promise<GenerationResult> {
  const rng = seed !== undefined ? createSeededRng(seed) : defaultRng();

  // Reset serial counters for fresh generation
  resetSerialCounters();

  const rowCounts = calculateRowCounts(profile, requestedRows);
  const reservoir = new KeyReservoir();
  const generationOrder = profile.generation_order;
  const tables: GeneratedData[] = [];
  let totalRows = 0;

  const bar = createProgressBar('');
  bar.start(generationOrder.length, 0, { status: '' });

  for (let i = 0; i < generationOrder.length; i++) {
    const tableName = generationOrder[i];
    const table = profile.tables[tableName];
    if (!table) {
      logger.warn(`Table '${tableName}' in generation order but not found in profile — skipping`);
      bar.update(i + 1, { status: `${tableName}  ⚠ skipped` });
      continue;
    }

    const count = rowCounts.get(tableName) ?? 1;
    bar.update(i, { status: `${tableName}...` });

    const data = generateTableData(tableName, table, count, reservoir, profile.enums, rng);
    tables.push(data);
    totalRows += count;

    bar.update(i + 1, {
      status: `${tableName}  ${logger.formatNumber(count)} rows  ✓`,
    });
  }

  bar.stop();

  return { tables, totalRows };
}

export { KeyReservoir };
