import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { SchemaData } from './schema-reader';
import { TableStats, TopValue, DistributionType } from './stats-collector';

export interface IsomorphProfile {
  isomorphdb_version: string;
  created_at: string;
  source_db: {
    host: string;
    database: string;
    postgres_version: string;
  };
  tables: Record<string, IsomorphTableProfile>;
  foreign_keys: IsomorphForeignKey[];
  enums: Record<string, string[]>;
  generation_order: string[];
}

export interface IsomorphTableProfile {
  row_count: number;
  columns: Record<string, IsomorphColumnProfile>;
}

export interface IsomorphColumnProfile {
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_unique: boolean;
  is_foreign_key: boolean;
  fk_parent_table?: string;
  fk_parent_column?: string;
  column_default?: string | null;
  character_maximum_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
  distribution: DistributionType;
  null_ratio: number;
  cardinality: number;
  min_value?: string | number | null;
  max_value?: string | number | null;
  avg_value?: number | null;
  stddev_value?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  avg_length?: number | null;
  top_values?: TopValue[];
  avg_children?: number | null;
}

export interface IsomorphForeignKey {
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  avg_children_per_parent?: number | null;
}

export function writeProfile(
  outputPath: string,
  schema: SchemaData,
  stats: Record<string, TableStats>,
  generationOrder: string[],
  connectionInfo: { host: string; database: string },
  postgresVersion: string
): void {
  const pkMap = new Map<string, Set<string>>();
  for (const pk of schema.primaryKeys) {
    if (!pkMap.has(pk.table_name)) pkMap.set(pk.table_name, new Set());
    pkMap.get(pk.table_name)!.add(pk.column_name);
  }

  const uniqueMap = new Map<string, Set<string>>();
  for (const uc of schema.uniqueConstraints) {
    if (!uniqueMap.has(uc.table_name)) uniqueMap.set(uc.table_name, new Set());
    uniqueMap.get(uc.table_name)!.add(uc.column_name);
  }

  const fkMap = new Map<string, Map<string, { parent_table: string; parent_column: string }>>();
  for (const fk of schema.foreignKeys) {
    let tMap = fkMap.get(fk.child_table);
    if (!tMap) {
      tMap = new Map();
      fkMap.set(fk.child_table, tMap);
    }
    tMap.set(fk.child_column, {
      parent_table: fk.parent_table, parent_column: fk.parent_column,
    });
  }

  const tables: Record<string, IsomorphTableProfile> = {};
  for (const table of schema.tables) {
    const tn = table.table_name;
    const ts = stats[tn];
    const cols = schema.columns.filter(c => c.table_name === tn);
    const columns: Record<string, IsomorphColumnProfile> = {};

    for (const col of cols) {
      const cs = ts?.columns[col.column_name];
      const fkInfo = fkMap.get(tn)?.get(col.column_name);
      const isPK = pkMap.get(tn)?.has(col.column_name) ?? false;
      const isUC = uniqueMap.get(tn)?.has(col.column_name) ?? false;

      const p: IsomorphColumnProfile = {
        data_type: col.data_type, udt_name: col.udt_name,
        is_nullable: col.is_nullable === 'YES', is_primary_key: isPK,
        is_unique: isUC || isPK,
        is_foreign_key: !!fkInfo,
        distribution: cs?.distribution ?? 'UNIFORM',
        null_ratio: cs?.null_ratio ?? 0, cardinality: cs?.cardinality ?? 0,
      };

      if (fkInfo) { p.fk_parent_table = fkInfo.parent_table; p.fk_parent_column = fkInfo.parent_column; }
      if (col.column_default !== null) p.column_default = col.column_default;
      if (col.character_maximum_length !== null) p.character_maximum_length = col.character_maximum_length;
      if (col.numeric_precision !== null) p.numeric_precision = col.numeric_precision;
      if (col.numeric_scale !== null) p.numeric_scale = col.numeric_scale;
      if (cs?.min_value !== undefined) p.min_value = cs.min_value;
      if (cs?.max_value !== undefined) p.max_value = cs.max_value;
      if (cs?.avg_value !== undefined) p.avg_value = cs.avg_value;
      if (cs?.stddev_value !== undefined) p.stddev_value = cs.stddev_value;
      if (cs?.min_length !== undefined) p.min_length = cs.min_length;
      if (cs?.max_length !== undefined) p.max_length = cs.max_length;
      if (cs?.avg_length !== undefined) p.avg_length = cs.avg_length;
      if (cs?.top_values) p.top_values = cs.top_values;
      if (cs?.avg_children !== undefined) p.avg_children = cs.avg_children;

      columns[col.column_name] = p;
    }
    tables[tn] = { row_count: ts?.row_count ?? 0, columns };
  }

  const foreignKeys: IsomorphForeignKey[] = schema.foreignKeys.map(fk => ({
    child_table: fk.child_table, child_column: fk.child_column,
    parent_table: fk.parent_table, parent_column: fk.parent_column,
    avg_children_per_parent: stats[fk.child_table]?.columns[fk.child_column]?.avg_children ?? null,
  }));

  const enums: Record<string, string[]> = {};
  for (const e of schema.enums) {
    if (!enums[e.enum_name]) enums[e.enum_name] = [];
    enums[e.enum_name].push(e.enum_value);
  }

  const profile: IsomorphProfile = {
    isomorphdb_version: '1.0.0', created_at: new Date().toISOString(),
    source_db: { host: connectionInfo.host, database: connectionInfo.database, postgres_version: postgresVersion },
    tables, foreign_keys: foreignKeys, enums, generation_order: generationOrder,
  };

  const dir = path.dirname(outputPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    fs.writeFileSync(outputPath, JSON.stringify(profile, null, 2), 'utf-8');
    logger.success(`Profile written to: ${outputPath}`);
  } catch {
    throw new Error(`Could not write to ${outputPath}. Check directory permissions.`);
  }
}
