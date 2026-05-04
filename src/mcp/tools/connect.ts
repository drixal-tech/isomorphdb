import * as fs from 'fs';
import { readConfig } from '../../utils/config';
import { IsomorphProfile } from '../../profiler/profile-writer';

export function registerConnectTool() {
  return {
    name: 'isomorphdb_connect',
    description: 'Reads the most recent schema.mirror.json to confirm a mirror exists and returns a JSON object containing a read-only connection string to the IsomorphDB managed mirror database, plus the table list and row counts from the last mirror run.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  };
}

export async function handleConnectCall() {
  const config = readConfig();
  const isomorphDbUrl = config.isomorph_db || 'postgres://localhost:5432/isomorphdb_morph';
  const profilePath = './schema.mirror.json';

  if (!fs.existsSync(profilePath)) {
    return {
      content: [{ 
        type: 'text', 
        text: 'Error: No mirror profile exists yet. Please run `isomorphdb_morph` first to initialize the managed synthetic database.' 
      }],
      isError: true,
    };
  }

  try {
    const raw = fs.readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(raw) as IsomorphProfile;

    // Get the table list and row counts
    const tableStats = Object.keys(profile.tables).map((tableName) => {
      return {
        tableName,
        rowCount: profile.tables[tableName].row_count,
      };
    });

    const summary = {
      connection_string: isomorphDbUrl,
      table_stats: tableStats,
      message: 'You can query this managed database safely without touching production credentials.',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Failed to read profile at ${profilePath}: ${error.message}` }],
      isError: true,
    };
  }
}
