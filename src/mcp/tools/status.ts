import * as fs from 'fs';
import { IsomorphProfile } from '../../profiler/profile-writer';

export function registerStatusTool() {
  return {
    name: 'isomorphdb_status',
    description: 'Reads an existing IsomorphDB profile to summarize its metadata and target schema.',
    inputSchema: {
      type: 'object',
      properties: {
        profile_path: {
          type: 'string',
          description: 'Path to the schema profile. Defaults to ./schema.mirror.json',
        },
      },
    },
  };
}

export async function handleStatusCall(args: any) {
  const profilePath = args.profile_path || './schema.mirror.json';

  if (!fs.existsSync(profilePath)) {
    return {
      content: [{ 
        type: 'text', 
        text: `No profile exists at ${profilePath}. You need to run isomorphdb_profile first to analyze a source database.` 
      }],
    };
  }

  try {
    const raw = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(raw) as IsomorphProfile;

    const summary = {
      created_at: profile.created_at,
      isomorphdb_version: profile.isomorphdb_version,
      source_host: profile.source_db.host,
      source_database: profile.source_db.database,
      table_count: Object.keys(profile.tables).length,
      generation_order: profile.generation_order,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error: Failed to read or parse profile at ${profilePath}: ${error.message}` }],
      isError: true,
    };
  }
}
