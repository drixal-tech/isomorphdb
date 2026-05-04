import { Client } from 'pg';
import logger from '../utils/logger';
import { ColumnInfo, ForeignKeyInfo } from './schema-reader';
import { quoteIdent } from '../utils/sql';

export interface TopValue {
  value: string;
  frequency: number;
  pct: number;
}

export type DistributionType = 'ENUM_LIKE' | 'POWER_LAW' | 'UNIFORM' | 'UNIQUE';

export interface ColumnStats {
  row_count: number;
  null_count: number;
  null_ratio: number;
  cardinality: number;
  is_unique: boolean;
  min_value?: string | number | null;
  max_value?: string | number | null;
  avg_value?: number | null;
  stddev_value?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  avg_length?: number | null;
  top_values?: TopValue[];
  avg_children?: number | null;
  distribution: DistributionType;
}

export interface TableStats {
  row_count: number;
  columns: Record<string, ColumnStats>;
}

const NUMERIC_TYPES = new Set([
  'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real',
  'double precision', 'int2', 'int4', 'int8', 'float4', 'float8',
]);

const TEXT_TYPES = new Set([
  'character varying', 'varchar', 'text', 'character', 'char', 'name',
]);

const DATE_TYPES = new Set([
  'timestamp without time zone', 'timestamp with time zone',
  'timestamptz', 'timestamp', 'date', 'time', 'timetz',
]);

/**
 * Types likely to contain user-generated content.
 * top_values must NEVER be collected for these types to uphold the zero-trust guarantee.
 */
const UGC_TYPES = new Set([
  'text', 'character varying', 'varchar', 'character', 'char', 'name',
  'json', 'jsonb', 'bytea',
]);

/** Maximum distinct-value count for which we allow top_values collection. */
const TOP_VALUES_CARDINALITY_LIMIT = 50;

/**
 * Detect the distribution type based on collected stats.
 * When topValues are available they refine the classification;
 * otherwise we fall back to a cardinality-ratio heuristic.
 */
function detectDistribution(
  rowCount: number,
  cardinality: number,
  topValues?: TopValue[]
): DistributionType {
  // UNIQUE: cardinality == row_count
  if (rowCount > 0 && cardinality === rowCount) {
    return 'UNIQUE';
  }

  if (topValues && topValues.length > 0) {
    // ENUM_LIKE: top 10 values cover >80% of rows
    const top10Pct = topValues.slice(0, 10).reduce((sum, tv) => sum + tv.pct, 0);
    if (top10Pct > 80) {
      return 'ENUM_LIKE';
    }

    // POWER_LAW: top value has >10x the frequency of the 10th value
    if (topValues.length >= 10 && topValues[0].frequency > 10 * topValues[9].frequency) {
      return 'POWER_LAW';
    }
  }

  // Cardinality-ratio fallback (used when top_values were not collected)
  if (rowCount > 0 && cardinality > 0) {
    const ratio = cardinality / rowCount;
    if (ratio < 0.01) return 'POWER_LAW';
  }

  return 'UNIFORM';
}

/**
 * Collect aggregate statistics for all columns in a table.
 * Only issues aggregate SQL queries — never reads individual rows.
 */
export async function collectTableStats(
  client: Client,
  tableName: string,
  columns: ColumnInfo[],
  foreignKeys: ForeignKeyInfo[]
): Promise<TableStats> {
  // Get row count first
  const countResult = await client.query(
    `SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`
  );
  const rowCount = parseInt(countResult.rows[0].count, 10);

  if (rowCount === 0) {
    logger.debug(`Table '${tableName}' has 0 rows — skipping stats collection`);
    const columnStats: Record<string, ColumnStats> = {};
    for (const col of columns) {
      columnStats[col.column_name] = {
        row_count: 0,
        null_count: 0,
        null_ratio: 0,
        cardinality: 0,
        is_unique: false,
        distribution: 'UNIFORM',
      };
    }
    return { row_count: rowCount, columns: columnStats };
  }

  // Collect stats for all columns in parallel
  const columnStatsEntries = await Promise.all(
    columns.map(async (col) => {
      const stats = await collectColumnStats(
        client, tableName, col, rowCount, foreignKeys
      );
      return [col.column_name, stats] as [string, ColumnStats];
    })
  );

  const columnStats = Object.fromEntries(columnStatsEntries);
  return { row_count: rowCount, columns: columnStats };
}

/**
 * Collect stats for a single column using aggregate queries only.
 */
async function collectColumnStats(
  client: Client,
  tableName: string,
  column: ColumnInfo,
  rowCount: number,
  foreignKeys: ForeignKeyInfo[]
): Promise<ColumnStats> {
  const colName = column.column_name;
  const udtName = column.udt_name;
  const dataType = column.data_type;
  const isNumeric = NUMERIC_TYPES.has(dataType) || NUMERIC_TYPES.has(udtName);
  const isText = TEXT_TYPES.has(dataType) || TEXT_TYPES.has(udtName);
  const isDate = DATE_TYPES.has(dataType) || DATE_TYPES.has(udtName);

  // Build the aggregate query dynamically
  const selectParts: string[] = [
    `COUNT(*) - COUNT(${quoteIdent(colName)}) AS null_count`,
    `COUNT(DISTINCT ${quoteIdent(colName)}) AS cardinality`,
  ];

  if (isNumeric) {
    selectParts.push(
      `MIN(${quoteIdent(colName)}) AS min_value`,
      `MAX(${quoteIdent(colName)}) AS max_value`,
      `AVG(${quoteIdent(colName)})::float8 AS avg_value`,
      `STDDEV(${quoteIdent(colName)})::float8 AS stddev_value`
    );
  }

  if (isDate) {
    selectParts.push(
      `MIN(${quoteIdent(colName)})::text AS min_value`,
      `MAX(${quoteIdent(colName)})::text AS max_value`
    );
  }

  if (isText) {
    selectParts.push(
      `MIN(LENGTH(${quoteIdent(colName)})) AS min_length`,
      `MAX(LENGTH(${quoteIdent(colName)})) AS max_length`,
      `AVG(LENGTH(${quoteIdent(colName)}))::float8 AS avg_length`
    );
  }

  const aggResult = await client.query(
    `SELECT ${selectParts.join(', ')} FROM ${quoteIdent(tableName)}`
  );
  const agg = aggResult.rows[0];

  const nullCount = parseInt(agg.null_count, 10);
  const cardinality = parseInt(agg.cardinality, 10);
  const nullRatio = rowCount > 0 ? nullCount / rowCount : 0;
  const isUnique = cardinality === rowCount;

  // Top-20 frequency distribution — gated by cardinality and type to uphold
  // the zero-trust guarantee.  We only read actual values when:
  //   (a) cardinality ≤ TOP_VALUES_CARDINALITY_LIMIT (low-cardinality columns), AND
  //   (b) the data type is NOT a user-generated-content type.
  const isUgcType = UGC_TYPES.has(dataType) || UGC_TYPES.has(udtName);
  const allowTopValues = cardinality <= TOP_VALUES_CARDINALITY_LIMIT && !isUgcType;

  let topValues: TopValue[] | undefined;
  if (allowTopValues) {
    try {
      const topResult = await client.query<TopValue>(
        `SELECT
           ${quoteIdent(colName)}::text AS value,
           COUNT(*) AS frequency,
           (COUNT(*) * 100.0 / SUM(COUNT(*)) OVER())::float8 AS pct
         FROM ${quoteIdent(tableName)}
         WHERE ${quoteIdent(colName)} IS NOT NULL
         GROUP BY ${quoteIdent(colName)}
         ORDER BY frequency DESC
         LIMIT 20`
      );
      topValues = topResult.rows.map(r => ({
        value: r.value,
        frequency: Number(r.frequency),
        pct: Number(r.pct),
      }));
    } catch (err) {
      logger.debug(`Could not collect top values for ${tableName}.${colName}: ${err}`);
    }
  } else {
    logger.debug(`Skipping top_values for ${tableName}.${colName} (cardinality=${cardinality}, ugc=${isUgcType})`);
  }

  // Average children per parent for FK child columns
  let avgChildren: number | null = null;
  const fk = foreignKeys.find(
    f => f.child_table === tableName && f.child_column === colName
  );
  if (fk) {
    try {
      const childResult = await client.query(
        `SELECT AVG(child_count)::float8 AS avg_children
         FROM (
           SELECT ${quoteIdent(fk.child_column)}, COUNT(*) AS child_count
           FROM ${quoteIdent(fk.child_table)}
           GROUP BY ${quoteIdent(fk.child_column)}
         ) sub`
      );
      avgChildren = childResult.rows[0]?.avg_children
        ? parseFloat(childResult.rows[0].avg_children)
        : null;
    } catch (err) {
      logger.debug(`Could not collect avg_children for ${tableName}.${colName}: ${err}`);
    }
  }

  const distribution = detectDistribution(rowCount, cardinality, topValues);

  const stats: ColumnStats = {
    row_count: rowCount,
    null_count: nullCount,
    null_ratio: Math.round(nullRatio * 10000) / 10000, // 4 decimal places
    cardinality,
    is_unique: isUnique,
    distribution,
  };

  if (isNumeric) {
    stats.min_value = agg.min_value != null ? Number(agg.min_value) : null;
    stats.max_value = agg.max_value != null ? Number(agg.max_value) : null;
    stats.avg_value = agg.avg_value != null ? Number(agg.avg_value) : null;
    stats.stddev_value = agg.stddev_value != null ? Number(agg.stddev_value) : null;
  }

  if (isDate) {
    stats.min_value = agg.min_value ?? null;
    stats.max_value = agg.max_value ?? null;
  }

  if (isText) {
    stats.min_length = agg.min_length != null ? Number(agg.min_length) : null;
    stats.max_length = agg.max_length != null ? Number(agg.max_length) : null;
    stats.avg_length = agg.avg_length != null ? Number(agg.avg_length) : null;
  }

  if (topValues && topValues.length > 0) {
    stats.top_values = topValues;
  }

  if (avgChildren !== null) {
    stats.avg_children = avgChildren;
  }

  return stats;
}
