import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface IsomorphDBConfig {
  db?: string;
  isomorph_db?: string;
  defaultSchema?: string;
  defaultRows?: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.isomorphdb');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Read the IsomorphDB config from ~/.isomorphdb/config.json.
 * Returns empty config if file doesn't exist.
 */
export function readConfig(): IsomorphDBConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw) as IsomorphDBConfig;
    }
  } catch {
    // Config is optional — silently ignore errors
  }
  return {};
}

/**
 * Write config to ~/.isomorphdb/config.json.
 */
export function writeConfig(config: IsomorphDBConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
