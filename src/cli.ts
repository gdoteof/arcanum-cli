import { Command } from 'commander';
import { ArcanaError } from './errors.js';
import { runBuild } from './commands/build.js';
import { formatCheckSummary, runCheck } from './commands/check.js';
import { cliVersion } from './version.js';

const program = new Command();

program
  .name('arcana')
  .description('Compile a canonical deck into the files Claude Code natively consumes.')
  .version(cliVersion());

program
  .command('build')
  .description('Compile deck.yaml + sources into CLAUDE.md and the arcana/ reference tree.')
  .action(() => {
    const summary = runBuild(process.cwd(), { version: cliVersion() });
    for (const path of summary.written) console.log(`  wrote     ${path}`);
    for (const path of summary.deleted) console.log(`  removed   ${path}`);
    for (const path of summary.unchanged) console.log(`  unchanged ${path}`);
    console.log(
      `✓ build complete — always-on core at ${summary.budget.lines}/${summary.budget.limit} lines`,
    );
  });

program
  .command('check')
  .description('Verify the emission matches deck.yaml + sources (drift detection; CI exit codes).')
  .action(() => {
    const summary = runCheck(process.cwd(), { version: cliVersion() });
    console.log(formatCheckSummary(summary));
    if (!summary.ok) process.exitCode = 1;
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof ArcanaError) {
    console.error(`arcana: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
