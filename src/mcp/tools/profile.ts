import { runProfiler } from '../../profiler/index';

export function registerProfileTool() {
  return {
    name: 'isomorphdb_profile',
    description: 'Profiles a Postgres database to generate an IsomorphDB metadata profile (schema.mirror.json). This does NOT extract row data, only schemas, types, null ratios, and foreign keys.',
    inputSchema: {
      type: 'object',
      properties: {
        connection_string: {
          type: 'string',
          description: 'Postgres connection string (e.g. postgres://user:pass@host:5432/db)',
        },
        output_path: {
          type: 'string',
          description: 'Where to save the profile. Defaults to ./schema.mirror.json',
        },
      },
      required: ['connection_string'],
    },
  };
}

export async function handleProfileCall(args: any) {
  const connectionString = args.connection_string;
  const outputPath = args.output_path || './schema.mirror.json';

  if (!connectionString) {
    return {
      content: [{ type: 'text', text: 'Error: connection_string is required' }],
      isError: true,
    };
  }

  try {
    // Run profiler programmatically
    const result = await runProfiler({
      connectionString,
      outputPath,
      schema: 'public',
      noStats: false,
      verbose: false,
    });

    const summary = {
      status: 'success',
      tables_profiled: result.tableCount,
      columns_profiled: result.columnCount,
      foreign_keys_detected: result.fkCount,
      output_path: result.outputPath,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Failed to profile database: ${error.message}` }],
      isError: true,
    };
  }
}
