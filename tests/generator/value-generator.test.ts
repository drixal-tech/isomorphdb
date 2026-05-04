import { generateValue, weightedSample } from '../../src/generator/value-generator';
import { KeyReservoir } from '../../src/generator/reservoir';
import { IsomorphColumnProfile } from '../../src/profiler/profile-writer';
import { defaultRng } from '../../src/generator/prng';

describe('Value Generator', () => {
  let reservoir: KeyReservoir;
  const rng = defaultRng();

  beforeEach(() => {
    reservoir = new KeyReservoir();
  });

  const baseColumn: IsomorphColumnProfile = {
    data_type: 'text',
    udt_name: 'text',
    is_nullable: false,
    is_primary_key: false,
    is_unique: false,
    is_foreign_key: false,
    distribution: 'UNIFORM',
    null_ratio: 0,
    cardinality: 100,
  };

  it('should generate UUID for uuid type', () => {
    const col = { ...baseColumn, data_type: 'uuid', udt_name: 'uuid' };
    const value = generateValue(col, 'id', 'users', reservoir, {}, rng);
    expect(typeof value).toBe('string');
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should generate boolean for boolean type', () => {
    const col = { ...baseColumn, data_type: 'boolean', udt_name: 'bool' };
    const value = generateValue(col, 'is_active', 'users', reservoir, {}, rng);
    expect(typeof value).toBe('boolean');
  });

  it('should generate number for integer type', () => {
    const col = { ...baseColumn, data_type: 'integer', udt_name: 'int4' };
    const value = generateValue(col, 'count', 'items', reservoir, {}, rng);
    expect(typeof value).toBe('number');
    expect(Number.isInteger(value as number)).toBe(true);
  });

  it('should generate timestamp for timestamptz type', () => {
    const col = { ...baseColumn, data_type: 'timestamp with time zone', udt_name: 'timestamptz' };
    const value = generateValue(col, 'created_at', 'users', reservoir, {}, rng);
    expect(typeof value).toBe('string');
    expect(new Date(value as string).getTime()).not.toBeNaN();
  });

  it('should generate text for varchar type', () => {
    const col = { ...baseColumn, data_type: 'character varying', udt_name: 'varchar', max_length: 50 };
    const value = generateValue(col, 'name', 'users', reservoir, {}, rng);
    expect(typeof value).toBe('string');
    expect((value as string).length).toBeLessThanOrEqual(50);
  });

  it('should return null based on null_ratio', () => {
    const col = { ...baseColumn, is_nullable: true, null_ratio: 1.0 };
    // Force rng to return 0.5 to trigger null branch since null_ratio is 1.0
    const value = generateValue(col, 'optional', 'test', reservoir, {}, () => 0.5);
    expect(value).toBeNull();
  });

  it('should sample from reservoir for FK columns', () => {
    for (const v of ['uid-1', 'uid-2', 'uid-3']) {
      reservoir.appendKey('users', 'id', v);
    }
    const col = {
      ...baseColumn,
      is_foreign_key: true,
      fk_parent_table: 'users',
      fk_parent_column: 'id',
    };
    const value = generateValue(col, 'user_id', 'orders', reservoir, {}, rng);
    expect(['uid-1', 'uid-2', 'uid-3']).toContain(value);
  });

  it('should use weighted sample for ENUM_LIKE distribution', () => {
    const col = {
      ...baseColumn,
      distribution: 'ENUM_LIKE' as const,
      top_values: [
        { value: 'active', frequency: 80, pct: 80 },
        { value: 'inactive', frequency: 20, pct: 20 },
      ],
    };
    const value = generateValue(col, 'status', 'users', reservoir, {}, rng);
    expect(['active', 'inactive']).toContain(value);
  });

  it('should generate JSONB objects', () => {
    const col = { ...baseColumn, data_type: 'jsonb', udt_name: 'jsonb' };
    const value = generateValue(col, 'metadata', 'users', reservoir, {}, rng);
    expect(typeof value).toBe('object');
    expect(value).not.toBeNull();
  });
});

describe('weightedSample', () => {
  const rng = defaultRng();
  
  it('should return a value from top_values', () => {
    const topValues = [
      { value: 'a', frequency: 70, pct: 70 },
      { value: 'b', frequency: 30, pct: 30 },
    ];
    const result = weightedSample(topValues, rng);
    expect(['a', 'b']).toContain(result);
  });

  it('should handle single value', () => {
    const topValues = [{ value: 'only', frequency: 100, pct: 100 }];
    expect(weightedSample(topValues, rng)).toBe('only');
  });
});
