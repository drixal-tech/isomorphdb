import { Client } from 'pg';
import logger, { parseConnectionInfo } from '../utils/logger';
import { readSchema, SchemaData } from './schema-reader';
import { collectTableStats, TableStats } from './stats-collector';
import { writeProfile } from './profile-writer';
import { buildDependencyGraph } from '../graph/dag';
import { topologicalSort } from '../graph/toposort';
import { createProgressBar } from '../utils/progress';

export interface ProfileOptions {
  connectionString: string;
  outputPath: string;
  schema: string;
  noStats: boolean;
  verbose: boolean;
}

export interface ProfileResult {
  tableCount: number;
  columnCount: number;
  fkCount: number;
  outputPath: string;
}

/**
 * Profiler orchestrator: connects → reads schema → collects stats → writes profile.
 */
export async function runProfiler(options: ProfileOptions): Promise<ProfileResult> {
  const { connectionString, outputPath, schema, noStats } = options;
  const connInfo = parseConnectionInfo(connectionString);

  const client = new Client({ connectionString });

  try {
    await client.connect();
    logger.success(`Connected to ${connInfo.database} @ ${connInfo.host}`);
  } catch (err) {
    handleConnectionError(err as Error, connInfo.host, connInfo.database);
    throw err;
  }

  try {
    // Get Postgres version
    const versionResult = await client.query('SELECT version()');
    const versionStr = versionResult.rows[0].version;
    const pgVersion = versionStr.match(/PostgreSQL (\d+\.\d+)/)?.[1] ?? 'unknown';

    // Step 1: Read schema
    logger.blank();
    logger.info('Discovering schema...');
    const schemaData: SchemaData = await readSchema(client, schema);

    if (schemaData.tables.length === 0) {
      throw new Error(`No tables found in schema '${schema}'. Use --schema to specify a different schema.`);
    }

    const totalColumns = schemaData.columns.length;
    const totalFKs = schemaData.foreignKeys.length;
    logger.success(`Found ${schemaData.tables.length} tables, ${totalColumns} columns, ${totalFKs} foreign key relationships`);

    // Step 2: Collect stats (unless --no-stats)
    const stats: Record<string, TableStats> = {};

    if (!noStats) {
      logger.blank();
      logger.info('Profiling tables:');
      const bar = createProgressBar('');
      bar.start(schemaData.tables.length, 0, { status: '' });

      for (let i = 0; i < schemaData.tables.length; i++) {
        const table = schemaData.tables[i];
        const tableCols = schemaData.columns.filter(c => c.table_name === table.table_name);

        bar.update(i, { status: table.table_name });
        const tableStats = await collectTableStats(
          client, table.table_name, tableCols, schemaData.foreignKeys
        );
        stats[table.table_name] = tableStats;
        bar.update(i + 1, {
          status: `${table.table_name}  ✓  ${logger.formatNumber(tableStats.row_count)} rows`,
        });
      }
      bar.stop();
    } else {
      // Schema-only mode: populate with zero stats
      for (const table of schemaData.tables) {
        stats[table.table_name] = { row_count: 0, columns: {} };
      }
    }

    // Step 3: Build dependency graph and topological sort
    const graph = buildDependencyGraph(
      schemaData.tables.map(t => t.table_name),
      schemaData.foreignKeys
    );
    const generationOrder = topologicalSort(graph);

    // Step 4: Write profile
    writeProfile(outputPath, schemaData, stats, generationOrder, connInfo, pgVersion);

    // Summary
    logger.blank();
    logger.divider();
    logger.success(`Profile written to: ${outputPath}`);
    logger.info(`Tables: ${schemaData.tables.length}  |  Columns: ${totalColumns}  |  FKs: ${totalFKs}`);
    logger.info('Zero rows were read from your database.');

    return {
      tableCount: schemaData.tables.length,
      columnCount: totalColumns,
      fkCount: totalFKs,
      outputPath
    };
  } finally {
    await client.end();
  }
}

function handleConnectionError(err: Error, host: string, database: string): void {
  const msg = err.message.toLowerCase();
  if (msg.includes('password') || msg.includes('authentication')) {
    logger.error('Connection failed: authentication error. Check your password in the connection string.');
  } else if (msg.includes('enotfound') || msg.includes('econnrefused')) {
    logger.error(`Connection failed: could not reach ${host}. Is the database running and accessible?`);
  } else if (msg.includes('does not exist')) {
    logger.error(`Connection failed: database '${database}' does not exist on this host.`);
  } else if (msg.includes('ssl')) {
    logger.error('Connection failed: SSL required. Add ?ssl=true to your connection string.');
  } else if (msg.includes('timeout')) {
    logger.error('Connection timed out after 10s. Is the host correct?');
  } else {
    logger.error(`Connection failed: ${err.message}`);
  }
}
