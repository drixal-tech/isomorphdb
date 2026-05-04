import logger from '../utils/logger';
import { RandomFn } from './prng';

/**
 * FK Key Reservoir: stores generated PKs so child tables can reference them.
 */
export class KeyReservoir {
  private store = new Map<string, unknown[]>();

  private key(table: string, column: string): string {
    return `${table}.${column}`;
  }



  /** Append a single key (useful for self-referencing FKs during generation). */
  appendKey(tableName: string, columnName: string, value: unknown): void {
    const k = this.key(tableName, columnName);
    const existing = this.store.get(k);
    if (existing) {
      existing.push(value);
    } else {
      this.store.set(k, [value]);
    }
  }

  /** Sample a random PK for a FK column. */
  sample(parentTable: string, parentColumn: string, rng: RandomFn): unknown {
    const k = this.key(parentTable, parentColumn);
    const values = this.store.get(k);
    if (!values || values.length === 0) {
      logger.warn(`Reservoir empty for ${k} — cannot sample FK value`);
      return null;
    }
    const idx = Math.floor(rng() * values.length);
    return values[idx];
  }

  /** Check if a parent table's PKs are available. */
  hasKeys(parentTable: string, parentColumn: string): boolean {
    const k = this.key(parentTable, parentColumn);
    const values = this.store.get(k);
    return !!values && values.length > 0;
  }

  /** Get all stored keys for a table.column. */
  getKeys(parentTable: string, parentColumn: string): unknown[] {
    return this.store.get(this.key(parentTable, parentColumn)) ?? [];
  }
}
