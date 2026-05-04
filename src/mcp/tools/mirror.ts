import * as fs from 'fs';
import { runGenerator } from '../../generator/index';
import { validateGeneratedData } from '../../validator/index';
import { writeOutput } from '../../writer/index';
import { IsomorphProfile } from '../../profiler/profile-writer';
import { readConfig } from '../../utils/config';

export function registerMirrorTool() {
  return {
    name: 'isomorphdb_morph',
    description: 'Generates synthetic relational data from a previously created IsomorphDB profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profile_path: {
          type: 'string',
          description: 'Path to the schema.mirror.json file. Defaults to ./schema.mirror.json',
        },
        rows: {
          type: 'number',
          description: 'Total synthetic rows to generate across all tables. Defaults to 10000',
        },
        output: {
          type: 'string',
          description: 'Output directory for SQL files, or a postgres:// URI to write directly. Defaults to the managed isomorph_db connection string.',
        },
      },
    },
  };
}

export async function handleMirrorCall(args: any) {
  const config = readConfig();
  const defaultIsomorphDb = config.isomorph_db || 'postgres://localhost:5432/isomorphdb_morph';

  const profilePath = args.profile_path || './schema.mirror.json';
  const rows = args.rows || 10000;
  const outputPath = args.output || defaultIsomorphDb;

  if (!fs.existsSync(profilePath)) {
    return {
      content: [{ type: 'text', text: `Error: Profile not found at ${profilePath}` }],
      isError: true,
    };
  }

  let profile: IsomorphProfile;
  try {
    const raw = fs.readFileSync(profilePath, 'utf-8');
    profile = JSON.parse(raw);
  } catch {
    return {
      content: [{ type: 'text', text: `Error: Failed to parse profile at ${profilePath}` }],
      isError: true,
    };
  }

  try {
    // 1. Generate
    const result = await runGenerator(profile, rows);

    // 2. Validate
    const validation = validateGeneratedData(profile, result.tables);

    // 3. Write
    await writeOutput(outputPath, profile, result.tables);

    const summary = {
      status: 'success',
      tables_generated: result.tables.length,
      total_rows: result.totalRows,
      validation_passed: validation.passed,
      validation_errors: validation.errors,
      output_path: outputPath,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Failed to generate data: ${error.message}` }],
      isError: true,
    };
  }
}
