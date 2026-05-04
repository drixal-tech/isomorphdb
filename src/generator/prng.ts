/**
 * Scoped PRNG utilities.
 *
 * Provides a seedable random number generator that is passed through the
 * generator call chain instead of overwriting the global Math.random.
 */

/** A function that returns a random number in [0, 1). */
export type RandomFn = () => number;

/**
 * Create a deterministic PRNG from an integer seed (LCG algorithm).
 * Returns values in [0, 1).
 */
export function createSeededRng(seed: number): RandomFn {
  let s = seed;
  return (): number => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

/**
 * Return a non-destructive wrapper around Math.random.
 * This is the default used when no seed is provided.
 */
export function defaultRng(): RandomFn {
  return () => Math.random();
}
