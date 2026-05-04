import { Command } from 'commander';
import { setVerbose } from '../../utils/logger';
import { runProfiler } from '../../profiler/index';
import logger from '../../utils/logger';
import { readConfig } from '../../utils/config';

export function registerProfileCommand(program: Command): void {
  program
    .command('profile')
    .description('Profile a Postgres database schema (metadata only, zero row data)')
    .requiredOption('-d, --db <connection-string>', 'Postgres connection string (or set ISOMORPHDB_DB env var)')
    .option('-o, --output <path>', 'Output path for profile', './schema.isomorph.json')
    .option('-s, --schema <schema>', 'Postgres schema name', 'public')
    .option('--no-stats', 'Skip statistical profiling (schema only)')
    .option('-v, --verbose', 'Show detailed progress per table/column', false)
    .action(async (options) => {
      try {
        const config = readConfig();
        const connectionString = options.db || process.env.ISOMORPHDB_DB || config.db;

        if (!connectionString) {
          logger.error(
            'No database connection string provided. Use --db or set ISOMORPHDB_DB environment variable.'
          );
          process.exit(1);
        }

        if (options.verbose) {
          setVerbose(true);
        }

        await runProfiler({
          connectionString,
          outputPath: options.output,
          schema: options.schema,
          noStats: !options.stats, // Commander inverts --no-stats to stats=false
          verbose: options.verbose,
        });

        process.exit(0);
      } catch (err) {
        const error = err as Error;
        if (!error.message.includes('Connection failed')) {
          logger.error(error.message, error);
        }
        process.exit(1);
      }
    });
}
