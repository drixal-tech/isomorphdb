import { generateUUID } from '../../src/generator/type-generators/uuid';
import { generateText } from '../../src/generator/type-generators/text';
import { generateNumeric, resetSerialCounters } from '../../src/generator/type-generators/numeric';
import { generateBoolean } from '../../src/generator/type-generators/boolean';
import { generateTimestamp } from '../../src/generator/type-generators/timestamp';
import { generateJsonb } from '../../src/generator/type-generators/jsonb';
import { generateEnum } from '../../src/generator/type-generators/enum';
import { IsomorphColumnProfile } from '../../src/profiler/profile-writer';
import { defaultRng } from '../../src/generator/prng';
import { runGenerator } from '../../src/generator/index';

const base: IsomorphColumnProfile = {
  data_type: 'text', udt_name: 'text', is_nullable: false, is_primary_key: false,
  is_unique: false, is_foreign_key: false, distribution: 'UNIFORM', null_ratio: 0, cardinality: 100,
};

const rng = defaultRng();

describe('UUID Generator', () => {
  it('generates valid v4 UUIDs', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it('generates unique UUIDs', () => {
    const s = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(s.size).toBe(100);
  });
});

describe('Text Generator', () => {
  it('generates email for email columns', () => {
    expect(generateText(base, 'email', rng)).toContain('@');
  });
  it('generates phone for phone columns', () => {
    expect(generateText(base, 'phone', rng)).toMatch(/^\+\d+-\d+$/);
  });
  it('generates URL for url columns', () => {
    expect(generateText(base, 'website_url', rng)).toMatch(/^https:\/\//);
  });
  it('respects max_length', () => {
    const col = { ...base, character_maximum_length: 10 };
    expect(generateText(col, 'x', rng).length).toBeLessThanOrEqual(10);
  });
});

describe('Numeric Generator', () => {
  beforeEach(() => resetSerialCounters());
  it('generates integers', () => {
    const col = { ...base, data_type: 'integer', udt_name: 'int4' };
    expect(Number.isInteger(generateNumeric(col, 'c', 't', rng))).toBe(true);
  });
  it('respects min/max', () => {
    const col = { ...base, data_type: 'integer', udt_name: 'int4', min_value: 1, max_value: 10 };
    for (let i = 0; i < 30; i++) {
      const v = generateNumeric(col, 's', 't', rng);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
  it('auto-increments serials', () => {
    const col = { ...base, data_type: 'integer', udt_name: 'int4', column_default: "nextval('seq')" };
    expect(generateNumeric(col, 'id', 't', rng)).toBe(1);
    expect(generateNumeric(col, 'id', 't', rng)).toBe(2);
  });
});

describe('Boolean Generator', () => {
  it('generates boolean uniformly', () => {
    expect(typeof generateBoolean(base, rng)).toBe('boolean');
  });
  it('uses top_values for true frequency', () => {
    // 100% true
    let col = { ...base, top_values: [{ value: 'true', frequency: 1, pct: 100 }] };
    expect(generateBoolean(col, () => 0)).toBe(true); // rng=0 -> 0 < 100
    
    // 0% true
    col = { ...base, top_values: [{ value: 'true', frequency: 1, pct: 0 }] };
    expect(generateBoolean(col, () => 0.5)).toBe(false); // rng=0.5 -> 50 < 0 is false
  });
});

describe('Enum Generator', () => {
  it('samples from enum definition uniformly', () => {
    const v = generateEnum(base, ['A', 'B', 'C'], rng);
    expect(['A', 'B', 'C']).toContain(v);
  });
  it('uses top_values if available', () => {
    const col = { ...base, distribution: 'ENUM_LIKE' as const, top_values: [{ value: 'X', frequency: 1, pct: 100 }] };
    const v = generateEnum(col, ['A', 'B'], rng);
    expect(v).toBe('X');
  });
});

describe('Timestamp Generator', () => {
  it('generates valid ISO timestamps', () => {
    expect(new Date(generateTimestamp(base, 'created_at', rng)).getTime()).not.toBeNaN();
  });
});

describe('JSONB Generator', () => {
  it('generates object with keys', () => {
    const v = generateJsonb(base, rng);
    expect(typeof v).toBe('object');
    expect(Object.keys(v).length).toBeGreaterThanOrEqual(1);
  });
});

describe('JSONB Generator — unique collision handling', () => {
  it('injects _uniq to resolve collisions when pool is exhausted', async () => {
    // A schema with a single JSONB column marked as unique
    const profile: any = {
      isomorphdb_version: '1.0', created_at: '', source_db: { host: '', database: '', postgres_version: '' },
      tables: {
        t1: {
          row_count: 50,
          columns: {
            c1: { 
              ...base, 
              data_type: 'jsonb', 
              udt_name: 'jsonb', 
              is_unique: true,
              top_values: [{ value: '{"a":1}', frequency: 50, pct: 100 }]
            }
          }
        }
      },
      foreign_keys: [], enums: {}, generation_order: ['t1']
    };
    
    // Request 50 rows. With a small pool of keys and 50 requested items, 
    // collisions are inevitable and the _uniq fallback will be hit.
    const result = await runGenerator(profile, 50, 42); // Use seed 42
    const tableData = result.tables[0];
    
    const stringified = tableData.rows.map(r => JSON.stringify(r[0]));
    const uniqueSet = new Set(stringified);
    
    // All 50 must be unique
    expect(uniqueSet.size).toBe(50);
    
    // We expect some of them to have hit the fallback logic and gotten `_uniq`
    const hasUniq = stringified.some(s => s.includes('_uniq'));
    expect(hasUniq).toBe(true);
  });
});
