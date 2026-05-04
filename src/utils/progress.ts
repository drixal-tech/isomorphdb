import cliProgress from 'cli-progress';
import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Create a progress bar for operations with known total count.
 */
export function createProgressBar(label: string): cliProgress.SingleBar {
  return new cliProgress.SingleBar({
    format: `  ${chalk.cyan('{bar}')} {value}/{total}  ${chalk.white(label)} {status}`,
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: false,
    barsize: 20,
  });
}

/**
 * Create a spinner for indeterminate operations.
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots',
  });
}

/**
 * Run a task with a spinner, returning the result.
 */
export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
