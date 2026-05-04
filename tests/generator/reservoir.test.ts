import { KeyReservoir } from '../../src/generator/reservoir';
import { defaultRng } from '../../src/generator/prng';

describe('KeyReservoir', () => {
  let reservoir: KeyReservoir;
  const rng = defaultRng();

  beforeEach(() => {
    reservoir = new KeyReservoir();
  });

  it('should store and retrieve keys via appendKey', () => {
    for (const v of ['a', 'b', 'c']) reservoir.appendKey('users', 'id', v);
    expect(reservoir.hasKeys('users', 'id')).toBe(true);
    expect(reservoir.getKeys('users', 'id')).toEqual(['a', 'b', 'c']);
  });

  it('should sample from stored keys', () => {
    for (const v of ['x', 'y', 'z']) reservoir.appendKey('users', 'id', v);
    const sampled = reservoir.sample('users', 'id', rng);
    expect(['x', 'y', 'z']).toContain(sampled);
  });

  it('should return false for missing keys', () => {
    expect(reservoir.hasKeys('nonexistent', 'id')).toBe(false);
  });

  it('should return null when sampling from empty reservoir', () => {
    // Suppress warning
    const warn = jest.spyOn(console, 'log').mockImplementation();
    const result = reservoir.sample('empty', 'id', rng);
    warn.mockRestore();
    expect(result).toBeNull();
  });

  it('should handle multiple tables independently', () => {
    for (const v of [1, 2, 3]) reservoir.appendKey('users', 'id', v);
    for (const v of [10, 20, 30]) reservoir.appendKey('products', 'id', v);

    expect(reservoir.getKeys('users', 'id')).toEqual([1, 2, 3]);
    expect(reservoir.getKeys('products', 'id')).toEqual([10, 20, 30]);
  });

  it('should return empty array for unknown table', () => {
    expect(reservoir.getKeys('unknown', 'id')).toEqual([]);
  });

  it('should extend existing keys when appending', () => {
    reservoir.appendKey('users', 'id', 'first');
    reservoir.appendKey('users', 'id', 'second');
    expect(reservoir.getKeys('users', 'id')).toEqual(['first', 'second']);
  });
});
