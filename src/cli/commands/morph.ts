import { Command } from 'commander';
import * as fs from 'fs';
import { setVerbose } from '../../utils/logger';
import { IsomorphProfile } from '../../profiler/profile-writer';
import { runGenerator } from '../../generator/index';
import { validateGeneratedData } from '../../validator/index';
import { writeOutput } from '../../writer/index';
import logger from '../../utils/logger';
import { readConfig } from '../../utils/config';

export function registerMorphCommand(program: Command): void {
  program
    .command('morph')
    .description('Generate synthetic data from an IsomorphDB profile')
    .option('-p, --profile <path>', 'Path to schema.isomorph.json', './schema.isomorph.json')
    .option('-r, --rows <number>', 'Total synthetic rows to generate', '10000')
    .option('-d, --db <connection-string>', 'Target Postgres connection string (defaults to config)')
    .option('-o, --out <target>', 'Output target: directory path for SQL files or postgres:// connection string', './isomorphdb-output')
    .option('--no-validate', 'Skip post-generation validation')
    .option('--seed <number>', 'Random seed for reproducible output')
    .option('-v, --verbose', 'Show per-column generation stats', false)
    .action(async (options) => {
      try {
        if (options.verbose) {
          setVerbose(true);
        }

        // Read and validate profile
        const profilePath = options.profile;

        if (!fs.existsSync(profilePath)) {
          logger.error(
            `Profile not found at ${profilePath}. Run 'isomorphdb profile' first.`
          );
          process.exit(1);
        }

        let profile: IsomorphProfile;
        try {
          const raw = fs.readFileSync(profilePath, 'utf-8');
          profile = JSON.parse(raw) as IsomorphProfile;
        } catch {
          logger.error(
            "Profile file is invalid. Delete schema.isomorph.json and run 'isomorphdb profile' again."
          );
          process.exit(1);
        }

        // Parse rows
        const requestedRows = parseInt(options.rows, 10);
        if (isNaN(requestedRows) || requestedRows <= 0) {
          logger.error('--rows must be a positive integer.');
          process.exit(1);
        }

        const seed = options.seed ? parseInt(options.seed, 10) : undefined;
        const tableCount = Object.keys(profile.tables).length;
        const profileDate = profile.created_at
          ? new Date(profile.created_at).toLocaleDateString()
          : 'unknown';

        logger.info(
          `Profile: ${profilePath} (${tableCount} tables, profiled ${profileDate})`
        );
        logger.info(
          `Generating ${logger.formatNumber(requestedRows)} synthetic rows across ${tableCount} tables...`
        );
        logger.blank();

        // Generate
        const result = await runGenerator(profile, requestedRows, seed);

        // Validate
        if (options.validate !== false) {
          logger.blank();
          logger.info('Running validation...');
          const validation = validateGeneratedData(profile, result.tables);

          if (!validation.passed) {
            const violations = validation.errors;
            logger.error(
              `Generation failed: ${violations} validation error(s) found. ` +
              'This is an IsomorphDB bug — please open an issue at github.com/dhananjay/isomorphdb with your schema.'
            );
            process.exit(1);
          }
        }

        // Write output
        logger.blank();
        const config = readConfig();
        const dbTarget = options.db || config.db;
        // If out is NOT the default, respect it over the config db.
        // If out IS the default, but dbTarget exists, use dbTarget.
        const isDefaultOut = options.out === './isomorphdb-output';
        const finalTarget = (isDefaultOut && dbTarget) ? dbTarget : options.out;
        
        await writeOutput(finalTarget, profile, result.tables);

        // Summary
        logger.blank();
        logger.divider();
        logger.success(
          `Total rows: ${logger.formatNumber(result.totalRows)}  |  Tables: ${tableCount}`
        );

        process.exit(0);
      } catch (err) {
        const error = err as Error;
        logger.error(error.message, error);
        process.exit(1);
      }
    });
}
