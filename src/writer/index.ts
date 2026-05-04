import { IsomorphProfile } from '../profiler/profile-writer';
import { GeneratedData } from '../generator/index';
import { writeSqlFiles } from './sql-writer';
import { writeToPostgres } from './postgres-writer';

/**
 * Output writer orchestrator — routes to SQL file writer or Postgres writer.
 */
export async function writeOutput(
  outputTarget: string,
  profile: IsomorphProfile,
  tables: GeneratedData[]
): Promise<void> {
  if (outputTarget.startsWith('postgres://') || outputTarget.startsWith('postgresql://')) {
    await writeToPostgres(outputTarget, profile, tables);
  } else {
    writeSqlFiles(tables, outputTarget);
  }
}
