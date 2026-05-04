import { Client } from 'pg';
import { Parser } from 'node-sql-parser';
import { readConfig } from '../../utils/config';

const sqlParser = new Parser();

export function registerQueryTool() {
  return {
    name: 'isomorphdb_query',
    description: 'Executes a read-only SELECT query against the managed IsomorphDB mirror database. Results are limited to 1000 rows.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SELECT SQL query to execute.',
        },
      },
      required: ['sql'],
    },
  };
}

export async function handleQueryCall(args: Record<string, unknown>) {
  const sql = args.sql as string;

  if (!sql) {
    return {
      content: [{ type: 'text', text: 'Error: sql parameter is required.' }],
      isError: true,
    };
  }

  // Layer 1: Parse the SQL and verify the AST root is a SELECT statement.
  try {
    const ast = sqlParser.astify(sql, { database: 'PostgresQL' });
    const stmts = Array.isArray(ast) ? ast : [ast];

    for (const stmt of stmts) {
      if (!stmt || stmt.type !== 'select') {
        return {
          content: [{
            type: 'text',
            text: `Error: Query rejected. Only SELECT statements are allowed. Received statement type: "${stmt?.type ?? 'unknown'}".`,
          }],
          isError: true,
        };
      }
    }
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return {
      content: [{
        type: 'text',
        text: `Error: Could not parse SQL query — only valid SELECT statements are accepted. Parse error: ${msg}`,
      }],
      isError: true,
    };
  }

  const config = readConfig();
  const isomorphDbUrl = config.isomorph_db || 'postgres://localhost:5432/isomorphdb_morph';

  const client = new Client({
    connectionString: isomorphDbUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    
    // Execute the query
    const result = await client.query(sql);
    let rows = result.rows;
    let warning = undefined;

    // Enforce 1000 row limit in memory
    if (rows.length > 1000) {
      rows = rows.slice(0, 1000);
      warning = 'Result truncated to 1000 rows maximum.';
    }

    const responseData = {
      status: 'success',
      row_count: rows.length,
      warning,
      results: rows,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(responseData, null, 2) }],
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Query execution failed: ${errMsg}` }],
      isError: true,
    };
  } finally {
    await client.end();
  }
}
