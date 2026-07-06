import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { BudgetReport } from '../compiler/budget.js';
import { isStamped } from '../compiler/hash.js';
import { compile } from '../compiler/pipeline.js';
import { loadProject, type LoadOptions } from '../loader/index.js';

/** Paths (relative to the project root) whose stamped contents arcana owns. */
export const OWNED_ROOTS = ['CLAUDE.md', 'arcana'];

export interface BuildSummary {
  written: string[];
  unchanged: string[];
  deleted: string[];
  budget: BudgetReport;
}

export interface BuildOptions extends LoadOptions {
  version: string;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) =>
      entry.isDirectory() ? walkFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    );
}

/** Every file under the owned roots that carries an arcana stamp. */
export function ownedFiles(root: string, ownedRoots: string[] = OWNED_ROOTS): string[] {
  const files: string[] = [];
  for (const owned of ownedRoots) {
    const abs = join(root, owned);
    if (!existsSync(abs)) continue;
    const candidates = statSync(abs).isDirectory() ? walkFiles(abs) : [abs];
    for (const file of candidates) {
      if (isStamped(readFileSync(file, 'utf8'))) {
        files.push(relative(root, file).split(sep).join('/'));
      }
    }
  }
  return files.sort();
}

export function runBuild(root: string, options: BuildOptions): BuildSummary {
  const project = loadProject(root, options);
  const output = compile(project, { version: options.version });

  const summary: BuildSummary = { written: [], unchanged: [], deleted: [], budget: output.budget };
  const emittedPaths = new Set(output.files.map((f) => f.path));

  for (const file of output.files) {
    const abs = join(root, file.path);
    if (existsSync(abs) && readFileSync(abs, 'utf8') === file.content) {
      summary.unchanged.push(file.path);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content);
    summary.written.push(file.path);
  }

  // Prune generated files whose source left the deck. Only stamped files are
  // ever deleted: a hand-written file in arcana/ is not ours to touch.
  for (const rel of ownedFiles(root)) {
    if (!emittedPaths.has(rel)) {
      rmSync(join(root, rel));
      summary.deleted.push(rel);
    }
  }
  return summary;
}
