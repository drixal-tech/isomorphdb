import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Client } from 'pg';
import { readConfig, writeConfig } from '../../utils/config';
import logger from '../../utils/logger';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactively configure your Postgres database connection string')
    .action(async () => {
      try {
        console.log(chalk.bold('Welcome to IsomorphDB!'));
        console.log('Let\'s set up your database connection.\n');

        const { platform } = await inquirer.prompt([
          {
            type: 'list',
            name: 'platform',
            message: 'Where is your Postgres database hosted?',
            choices: ['Supabase', 'Railway', 'Neon', 'Local Postgres', 'Other'],
          },
        ]);

        console.log();
        switch (platform) {
          case 'Supabase':
            console.log(chalk.cyan('To find your Supabase connection string:'));
            console.log('1. Go to your project dashboard.');
            console.log('2. Navigate to Settings → Database.');
            console.log('3. Scroll to "Connection string" and select "URI" mode.');
            console.log('4. Copy the URI and replace [YOUR-PASSWORD] with your actual password.');
            break;
          case 'Railway':
            console.log(chalk.cyan('To find your Railway connection string:'));
            console.log('1. Go to your Railway project.');
            console.log('2. Click on your Postgres database service.');
            console.log('3. Go to the "Variables" tab.');
            console.log('4. Copy the value of DATABASE_URL.');
            break;
          case 'Neon':
            console.log(chalk.cyan('To find your Neon connection string:'));
            console.log('1. Go to your Neon project console.');
            console.log('2. On the Dashboard, find the "Connection Details" widget.');
            console.log('3. Select the branch and database, and copy the Postgres connection string.');
            break;
          case 'Local Postgres':
            console.log(chalk.cyan('For a local Postgres instance, the standard connection string format is:'));
            console.log('postgres://postgres:password@localhost:5432/your_db_name');
            break;
          default:
            console.log(chalk.cyan('Please ensure you have your Postgres connection string (URI format) ready.'));
            console.log('Example: postgres://user:password@host:port/dbname');
        }
        console.log();

        let connected = false;
        let finalConnectionString = '';
        let dbInfo = { dbName: '', version: '', tableCount: 0, host: '' };

        while (!connected) {
          const { connectionString } = await inquirer.prompt([
            {
              type: 'password',
              name: 'connectionString',
              message: 'Paste your Postgres connection string:',
              mask: '*',
              validate: (input) => input.length > 0 ? true : 'Connection string cannot be empty.',
            },
          ]);

          const spinner = (await import('ora')).default('Testing connection...').start();

          const client = new Client({
            connectionString,
            connectionTimeoutMillis: 10000,
          });

          try {
            await client.connect();

            const dbRes = await client.query('SELECT current_database() as db');
            const verRes = await client.query('SELECT version() as ver');
            const tablesRes = await client.query(
              "SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
            );

            dbInfo = {
              dbName: dbRes.rows[0]?.db,
              version: verRes.rows[0]?.ver?.split(' ')[1] || 'Unknown',
              tableCount: parseInt(tablesRes.rows[0]?.count || '0', 10),
              host: client.host,
            };

            await client.end();
            spinner.succeed('Connection successful!');
            connected = true;
            finalConnectionString = connectionString;
          } catch (err) {
            spinner.fail('Connection failed.');
            const error = err as any;
            let reason = error.message;

            if (error.code === '28P01' || reason.includes('password authentication failed')) {
              reason = 'Wrong password. Please double-check your credentials.';
            } else if (error.code === 'ENOTFOUND' || reason.includes('getaddrinfo ENOTFOUND')) {
              reason = 'Unreachable host. Please check the hostname in your connection string.';
            } else if (reason.includes('SSL off')) {
              reason = 'SSL is required by this server. Try adding ?sslmode=require to your connection string.';
            } else if (error.message.includes('timeout')) {
              reason = 'Connection timed out. The database may be down or unreachable from this network.';
            }

            console.log(chalk.red(`\nError: ${reason}`));
            console.log('Please try again (or press Ctrl+C to exit).\n');
          }
        }

        console.log('\n' + chalk.bold('Database Details:'));
        console.log(`  Name:    ${chalk.cyan(dbInfo.dbName)}`);
        console.log(`  Host:    ${chalk.cyan(dbInfo.host)}`);
        console.log(`  Version: ${chalk.cyan(dbInfo.version)}`);
        console.log(`  Tables:  ${chalk.cyan(dbInfo.tableCount.toString())} (in public schema)\n`);

        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Is this the correct database to profile/mirror?',
            default: true,
          },
        ]);

        if (confirm) {
          const config = readConfig();
          writeConfig({ ...config, db: finalConnectionString });
          console.log('\n' + chalk.green('✔ IsomorphDB is configured.'));
          console.log(chalk.yellow('⚠ Security Warning: Your connection string is stored locally in ~/.isomorphdb/config.json — treat this file like a .env file and do not commit it to version control.'));
          console.log(chalk.cyan('💡 Tip: For your mirror database, create a dedicated read-only Postgres user for defense-in-depth. See the README for instructions.'));
          console.log(chalk.bold('Run ') + chalk.cyan('isomorphdb profile') + chalk.bold(' to start.'));
          process.exit(0);
        } else {
          console.log('\nConfiguration aborted. Run ' + chalk.cyan('isomorphdb init') + ' again to retry.');
          process.exit(0);
        }

      } catch (err: any) {
        if (err.isTtyError) {
          logger.error('Prompts could not be rendered in the current environment.');
        } else if (err.message && err.message.includes('User force closed')) {
          console.log('\nSetup cancelled.');
        } else {
          logger.error('An unexpected error occurred:', err);
        }
        process.exit(1);
      }
    });
}
