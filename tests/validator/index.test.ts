import { validateGeneratedData } from '../../src/validator/index';
import { IsomorphProfile } from '../../src/profiler/profile-writer';
import { GeneratedData } from '../../src/generator/index';

// Suppress console output during tests
beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(); });
afterEach(() => { jest.restoreAllMocks(); });

function makeProfile(overrides?: Partial<IsomorphProfile>): IsomorphProfile {
  return {
    isomorphdb_version: '1.0.0', created_at: new Date().toISOString(),
    source_db: { host: 'localhost', database: 'test', postgres_version: '15' },
    tables: {
      users: {
        row_count: 10,
        columns: {
          id: { data_type: 'uuid', udt_name: 'uuid', is_nullable: false, is_primary_key: true,
            is_unique: true, is_foreign_key: false, distribution: 'UNIQUE', null_ratio: 0, cardinality: 10 },
          name: { data_type: 'text', udt_name: 'text', is_nullable: false, is_primary_key: false,
            is_unique: false, is_foreign_key: false, distribution: 'UNIFORM', null_ratio: 0, cardinality: 10 },
        },
      },
      orders: {
        row_count: 5,
        columns: {
          id: { data_type: 'uuid', udt_name: 'uuid', is_nullable: false, is_primary_key: true,
            is_unique: true, is_foreign_key: false, distribution: 'UNIQUE', null_ratio: 0, cardinality: 5 },
          user_id: { data_type: 'uuid', udt_name: 'uuid', is_nullable: false, is_primary_key: false,
            is_unique: false, is_foreign_key: true, fk_parent_table: 'users', fk_parent_column: 'id',
            distribution: 'UNIFORM', null_ratio: 0, cardinality: 5 },
        },
      },
    },
    foreign_keys: [
      { child_table: 'orders', child_column: 'user_id', parent_table: 'users', parent_column: 'id' },
    ],
    enums: {}, generation_order: ['users', 'orders'],
    ...overrides,
  };
}

describe('Validator', () => {
  it('should pass on clean data', () => {
    const profile = makeProfile();
    const data: GeneratedData[] = [
      { tableName: 'users', columns: ['id', 'name'], rows: [['u1', 'Alice'], ['u2', 'Bob']] },
      { tableName: 'orders', columns: ['id', 'user_id'], rows: [['o1', 'u1'], ['o2', 'u2']] },
    ];
    const result = validateGeneratedData(profile, data);
    expect(result.passed).toBe(true);
    expect(result.errors).toBe(0);
  });

  it('should catch FK violations', () => {
    const profile = makeProfile();
    const data: GeneratedData[] = [
      { tableName: 'users', columns: ['id', 'name'], rows: [['u1', 'Alice']] },
      { tableName: 'orders', columns: ['id', 'user_id'], rows: [['o1', 'MISSING_USER']] },
    ];
    const result = validateGeneratedData(profile, data);
    expect(result.passed).toBe(false);
  });

  it('should catch unique violations', () => {
    const profile = makeProfile();
    const data: GeneratedData[] = [
      { tableName: 'users', columns: ['id', 'name'], rows: [['same-id', 'A'], ['same-id', 'B']] },
      { tableName: 'orders', columns: ['id', 'user_id'], rows: [['o1', 'same-id']] },
    ];
    const result = validateGeneratedData(profile, data);
    expect(result.checks.find(c => c.name === 'Unique constraints')!.passed).toBe(false);
  });

  it('should catch NOT NULL violations', () => {
    const profile = makeProfile();
    const data: GeneratedData[] = [
      { tableName: 'users', columns: ['id', 'name'], rows: [['u1', null]] },
      { tableName: 'orders', columns: ['id', 'user_id'], rows: [['o1', 'u1']] },
    ];
    const result = validateGeneratedData(profile, data);
    expect(result.checks.find(c => c.name === 'NOT NULL')!.passed).toBe(false);
  });

  it('should warn on empty tables', () => {
    const profile = makeProfile();
    const data: GeneratedData[] = [
      { tableName: 'users', columns: ['id', 'name'], rows: [] },
      { tableName: 'orders', columns: ['id', 'user_id'], rows: [] },
    ];
    const result = validateGeneratedData(profile, data);
    const rowCheck = result.checks.find(c => c.name === 'Row counts')!;
    expect(rowCheck.isWarning).toBe(true);
  });
});
