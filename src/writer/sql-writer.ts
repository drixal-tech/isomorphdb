import * as fs from 'fs';
import * as path from 'path';
import { GeneratedData } from '../generator/index';
import logger from '../utils/logger';

/**
 * Escape a SQL string value — single quotes are doubled.
 */
function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Write generated data as SQL INSERT files to a directory.
 */
export function writeSqlFiles(
  tables: GeneratedData[],
  outputDir: string
): void {
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write schema info file
  const infoContent = [
    'IsomorphDB Output Summary',
    '═══════════════════════',
    `Tables: ${tables.length}`,
    `Total rows: ${tables.reduce((s, t) => s + t.rows.length, 0).toLocaleString()}`,
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Tables:',
    ...tables.map((t, i) => `  ${String(i + 1).padStart(2, '0')}. ${t.tableName} (${t.rows.length.toLocaleString()} rows)`),
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, '00_schema_info.txt'), infoContent, 'utf-8');

  // Write SQL files
  const BATCH_SIZE = 500;

  for (let ti = 0; ti < tables.length; ti++) {
    const table = tables[ti];
    const prefix = String(ti + 1).padStart(2, '0');
    const filename = `${prefix}_${table.tableName}.sql`;
    const filepath = path.join(outputDir, filename);

    const lines: string[] = [
      `-- IsomorphDB generated: ${table.tableName} (${table.rows.length.toLocaleString()} rows)`,
      `-- Source profile: schema.isomorph.json`,
      `-- Generated at: ${new Date().toISOString()}`,
      '',
    ];

    if (table.rows.length === 0) {
      lines.push(`-- No rows generated for ${table.tableName}`);
      fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
      continue;
    }

    const colList = table.columns.map(c => `"${c}"`).join(', ');

    // Batch inserts in 500-row blocks
    for (let batch = 0; batch < table.rows.length; batch += BATCH_SIZE) {
      const batchRows = table.rows.slice(batch, batch + BATCH_SIZE);

      lines.push('BEGIN;');
      lines.push(`INSERT INTO "${table.tableName}" (${colList}) VALUES`);

      for (let ri = 0; ri < batchRows.length; ri++) {
        const row = batchRows[ri];
        const values = row.map(v => escapeSqlValue(v)).join(', ');
        const suffix = ri < batchRows.length - 1 ? ',' : ';';
        lines.push(`  (${values})${suffix}`);
      }

      lines.push('COMMIT;');
      lines.push('');
    }

    fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  }

  logger.success(`Output written to: ${outputDir}/ (${tables.length} .sql files)`);
}
