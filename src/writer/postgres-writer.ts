import { Client } from 'pg';
import { IsomorphProfile } from '../profiler/profile-writer';
import { GeneratedData } from '../generator/index';
import { quoteIdent } from '../utils/sql';
import logger from '../utils/logger';

/**
 * Map IsomorphDB data types to Postgres DDL types.
 */
function toPgType(col: { data_type: string; udt_name: string; character_maximum_length?: number | null;
  numeric_precision?: number | null; numeric_scale?: number | null }): string {
  const dt = col.data_type.toLowerCase();
  const udt = col.udt_name.toLowerCase();

  if (udt === 'uuid') return 'UUID';
  if (udt === 'bool') return 'BOOLEAN';
  if (udt === 'int2') return 'SMALLINT';
  if (udt === 'int4') return 'INTEGER';
  if (udt === 'int8') return 'BIGINT';
  if (udt === 'float4') return 'REAL';
  if (udt === 'float8') return 'DOUBLE PRECISION';
  if (udt === 'numeric') {
    if (col.numeric_precision && col.numeric_scale) {
      return `NUMERIC(${col.numeric_precision},${col.numeric_scale})`;
    }
    return 'NUMERIC';
  }
  if (udt === 'varchar') {
    return col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
  }
  if (udt === 'text') return 'TEXT';
  if (udt === 'timestamptz') return 'TIMESTAMPTZ';
  if (udt === 'timestamp') return 'TIMESTAMP';
  if (udt === 'date') return 'DATE';
  if (udt === 'jsonb') return 'JSONB';
  if (udt === 'json') return 'JSON';
  if (dt === 'user-defined') return udt.toUpperCase();

  return dt.toUpperCase();
}

/**
 * Write generated data directly to a Postgres database.
 */
export async function writeToPostgres(
  connectionString: string,
  profile: IsomorphProfile,
  tables: GeneratedData[]
): Promise<void> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    logger.success('Connected to output database');

    // Disable FK constraint checking during insert
    await client.query('SET session_replication_role = replica');

    // Create tables (DDL)
    for (const tableName of profile.generation_order) {
      const table = profile.tables[tableName];
      if (!table) continue;

      const colDefs = Object.entries(table.columns).map(([colName, col]) => {
        let def = `${quoteIdent(colName)} ${toPgType(col)}`;
        if (col.is_primary_key) def += ' PRIMARY KEY';
        if (!col.is_nullable && !col.is_primary_key) def += ' NOT NULL';
        return def;
      });

      // Drop existing table
      await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)} CASCADE`);
      await client.query(`CREATE TABLE ${quoteIdent(tableName)} (${colDefs.join(', ')})`);
      logger.debug(`Created table: ${tableName}`);
    }

    // Insert data using parameterised queries
    const BATCH_SIZE = 500;

    for (const tableData of tables) {
      if (tableData.rows.length === 0) continue;

      const colList = tableData.columns.map(c => quoteIdent(c)).join(', ');

      for (let batch = 0; batch < tableData.rows.length; batch += BATCH_SIZE) {
        const batchRows = tableData.rows.slice(batch, batch + BATCH_SIZE);
        const numCols = tableData.columns.length;

        // Build parameterised INSERT
        const valuePlaceholders = batchRows.map((_, ri) => {
          const placeholders = Array.from(
            { length: numCols },
            (_, ci) => `$${ri * numCols + ci + 1}`
          );
          return `(${placeholders.join(', ')})`;
        });

        const flatValues = batchRows.flatMap(row =>
          row.map(v => {
            if (v === null || v === undefined) return null;
            if (typeof v === 'object') return JSON.stringify(v);
            return v;
          })
        );

        await client.query(
          `INSERT INTO ${quoteIdent(tableData.tableName)} (${colList}) VALUES ${valuePlaceholders.join(', ')}`,
          flatValues
        );
      }

      logger.debug(`Inserted ${tableData.rows.length} rows into ${tableData.tableName}`);
    }

    // Re-enable FK constraint checking
    await client.query('SET session_replication_role = DEFAULT');
    logger.success('All data written to output database');
  } finally {
    await client.end();
  }
}
