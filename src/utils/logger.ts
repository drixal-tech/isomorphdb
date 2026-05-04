import chalk from 'chalk';

let verboseMode = false;

export function setVerbose(verbose: boolean): void {
  verboseMode = verbose;
}

export function isVerbose(): boolean {
  return verboseMode;
}

/**
 * Redact password from a Postgres connection string.
 * Never log credentials — only host and database name.
 */
export function redactConnectionString(url: string): string {
  return url.replace(/:([^@]+)@/, ':***@');
}

/**
 * Parse host and database name from connection string for safe logging.
 */
export function parseConnectionInfo(connectionString: string): { host: string; database: string } {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      database: url.pathname.replace(/^\//, '') || 'postgres',
    };
  } catch {
    return { host: 'unknown', database: 'unknown' };
  }
}

const logger = {
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  },

  success(message: string): void {
    console.log(chalk.green('✓'), message);
  },

  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  },

  error(message: string, error?: Error): void {
    console.error(chalk.red('✗'), message);
    if (error && verboseMode) {
      console.error(chalk.gray(error.stack || error.message));
    }
  },

  debug(message: string): void {
    if (verboseMode) {
      console.log(chalk.gray('  →'), chalk.gray(message));
    }
  },

  header(message: string): void {
    console.log();
    console.log(chalk.bold.cyan(message));
  },

  divider(): void {
    console.log(chalk.gray('─'.repeat(55)));
  },

  blank(): void {
    console.log();
  },

  table(rows: Array<Record<string, string | number>>): void {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const widths = keys.map(k =>
      Math.max(k.length, ...rows.map(r => String(r[k]).length))
    );

    const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
    console.log(chalk.bold(header));
    console.log(chalk.gray('─'.repeat(header.length)));
    for (const row of rows) {
      console.log(keys.map((k, i) => String(row[k]).padEnd(widths[i])).join('  '));
    }
  },

  /**
   * Format a number with commas (e.g., 48293 → "48,293")
   */
  formatNumber(n: number): string {
    return n.toLocaleString('en-US');
  },
};

export default logger;
