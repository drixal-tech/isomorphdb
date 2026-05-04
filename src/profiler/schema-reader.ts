import { Client } from 'pg';
import logger from '../utils/logger';

export interface TableInfo {
  table_name: string;
  table_type: string;
}

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  ordinal_position: number;
}

export interface ForeignKeyInfo {
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  constraint_name: string;
}

export interface PrimaryKeyInfo {
  table_name: string;
  column_name: string;
}

export interface UniqueConstraintInfo {
  table_name: string;
  column_name: string;
}

export interface EnumInfo {
  enum_name: string;
  enum_value: string;
}

export interface SequenceInfo {
  sequence_name: string;
  start_value: string;
  increment: string;
}

export interface SchemaData {
  tables: TableInfo[];
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  primaryKeys: PrimaryKeyInfo[];
  uniqueConstraints: UniqueConstraintInfo[];
  enums: EnumInfo[];
  sequences: SequenceInfo[];
}

/**
 * Reads database schema structure from information_schema and pg_catalog.
 * Never touches user data tables — only metadata queries.
 */
export async function readSchema(client: Client, schema: string = 'public'): Promise<SchemaData> {
  logger.debug(`Reading schema structure from '${schema}'...`);

  // 3.1.1 — Table enumeration
  const tablesResult = await client.query<TableInfo>(
    `SELECT table_name, table_type
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  );

  // 3.1.2 — Column enumeration
  const columnsResult = await client.query<ColumnInfo>(
    `SELECT
       c.table_name,
       c.column_name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       c.column_default,
       c.character_maximum_length,
       c.numeric_precision,
       c.numeric_scale,
       c.ordinal_position
     FROM information_schema.columns c
     WHERE c.table_schema = $1
     ORDER BY c.table_name, c.ordinal_position`,
    [schema]
  );

  // 3.1.3 — Foreign key constraints
  const fkResult = await client.query<ForeignKeyInfo>(
    `SELECT
       tc.table_name AS child_table,
       kcu.column_name AS child_column,
       ccu.table_name AS parent_table,
       ccu.column_name AS parent_column,
       tc.constraint_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1`,
    [schema]
  );

  // 3.1.4 — Primary key constraints
  const pkResult = await client.query<PrimaryKeyInfo>(
    `SELECT
       tc.table_name,
       kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = $1
     ORDER BY tc.table_name, kcu.ordinal_position`,
    [schema]
  );

  // 3.1.5 — Unique constraints (single column only for V1)
  const uniqueResult = await client.query<UniqueConstraintInfo>(
    `SELECT
       tc.table_name,
       kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type = 'UNIQUE'
       AND tc.table_schema = $1
       AND tc.constraint_name IN (
         SELECT constraint_name
         FROM information_schema.key_column_usage
         GROUP BY constraint_name
         HAVING COUNT(column_name) = 1
       )`,
    [schema]
  );

  // 3.1.6 — ENUM types
  const enumResult = await client.query<EnumInfo>(
    `SELECT
       t.typname AS enum_name,
       e.enumlabel AS enum_value
     FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1
     ORDER BY t.typname, e.enumsortorder`,
    [schema]
  );

  // 3.1.7 — Sequences
  const seqResult = await client.query<SequenceInfo>(
    `SELECT
       sequence_name,
       start_value,
       increment
     FROM information_schema.sequences
     WHERE sequence_schema = $1`,
    [schema]
  );

  return {
    tables: tablesResult.rows,
    columns: columnsResult.rows,
    foreignKeys: fkResult.rows,
    primaryKeys: pkResult.rows,
    uniqueConstraints: uniqueResult.rows,
    enums: enumResult.rows,
    sequences: seqResult.rows,
  };
}
