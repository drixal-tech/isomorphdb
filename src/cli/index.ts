#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerProfileCommand } from './commands/profile';
import { registerMorphCommand } from './commands/morph';
import { registerInitCommand } from './commands/init';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

const program = new Command();

program
  .name('isomorphdb')
  .description('Zero-trust synthetic database generation for Postgres. Locally generated, no data egress.')
  .version(pkg.version, '-V, --version')
  .hook('preAction', () => {
    console.log();
    console.log(chalk.bold.cyan(`  IsomorphDB v${pkg.version}`));
    console.log(chalk.gray('  ─'.repeat(28)));
  });

registerProfileCommand(program);
registerMorphCommand(program);
registerInitCommand(program);

program.parse(process.argv);
