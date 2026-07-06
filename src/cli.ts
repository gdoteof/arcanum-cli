import { Command } from 'commander';
import { ArcanaError } from './errors.js';
import { runBuild } from './commands/build.js';
import { formatCheckSummary, runCheck } from './commands/check.js';
import { runEject } from './commands/eject.js';
import { runInit } from './commands/init.js';
import { runList } from './commands/list.js';
import { cliVersion } from './version.js';

const program = new Command();

program
  .name('arcana')
  .description('Compile a canonical deck into the files Claude Code natively consumes.')
  .version(cliVersion());

program
  .command('init')
  .description('Set up a deck in this repository and run the first build.')
  .option('--from <deck.yaml>', 'start from an existing deck file instead of the default deck')
  .action((opts: { from?: string }) => {
    const summary = runInit(process.cwd(), {
      version: cliVersion(),
      ...(opts.from !== undefined ? { from: opts.from } : {}),
    });
    for (const path of summary.written) console.log(`  wrote ${path}`);
    console.log(
      `✓ deck installed — always-on core at ${summary.budget.lines}/${summary.budget.limit} lines`,
    );
    console.log('Edit deck.yaml to tune it, then run "arcana build".');
  });

program
  .command('list')
  .description('Show the deck: cards, rites, vigils, conduct, and the context budget.')
  .action(() => {
    console.log(runList(process.cwd(), { version: cliVersion() }));
  });

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

program
  .command('eject')
  .description('Strip generation markers so the emitted files are plainly yours, forever.')
  .action(() => {
    const summary = runEject(process.cwd());
    for (const path of summary.ejected) console.log(`  ejected ${path}`);
    console.log(
      summary.ejected.length > 0
        ? '✓ files are yours now — they keep working without arcana; deck.yaml no longer manages them'
        : 'nothing to eject — no generated files found',
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof ArcanaError) {
    console.error(`arcana: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
