import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a fresh v4 UUID. Never reuses within a run.
 */
export function generateUUID(): string {
  return uuidv4();
}
