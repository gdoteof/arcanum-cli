import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyStamp } from '../compiler/hash.js';
import { compile } from '../compiler/pipeline.js';
import { loadProject, type LoadOptions } from '../loader/index.js';
import { ownedFiles } from './build.js';

export type ProblemKind = 'missing' | 'tampered' | 'stale' | 'orphaned';

export interface CheckProblem {
  path: string;
  kind: ProblemKind;
  detail: string;
}

export interface CheckSummary {
  ok: boolean;
  checked: number;
  problems: CheckProblem[];
}

export interface CheckOptions extends LoadOptions {
  version: string;
}

/**
 * Drift detection (§7): compare the on-disk emission against an in-memory
 * rebuild. Hand-edits (hash broken) are distinguished from staleness (file
 * intact but deck/sources/version changed since the last build).
 */
export function runCheck(root: string, options: CheckOptions): CheckSummary {
  const project = loadProject(root, options);
  const output = compile(project, { version: options.version });
  const problems: CheckProblem[] = [];
  const emittedPaths = new Set(output.files.map((f) => f.path));

  for (const file of output.files) {
    const abs = join(root, file.path);
    if (!existsSync(abs)) {
      problems.push({ path: file.path, kind: 'missing', detail: 'not built yet — run "arcana build"' });
      continue;
    }
    const actual = readFileSync(abs, 'utf8');
    if (actual === file.content) continue;
    if (verifyStamp(actual) === 'ok') {
      problems.push({
        path: file.path,
        kind: 'stale',
        detail: 'sources changed since the last build — run "arcana build"',
      });
    } else {
      problems.push({
        path: file.path,
        kind: 'tampered',
        detail:
          'hand-edited after generation — revert it, or move the change into deck.yaml/src/ and rebuild',
      });
    }
  }

  for (const rel of ownedFiles(root)) {
    if (!emittedPaths.has(rel)) {
      problems.push({
        path: rel,
        kind: 'orphaned',
        detail: 'generated file no longer in the deck — run "arcana build" to remove it',
      });
    }
  }

  problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: problems.length === 0, checked: output.files.length, problems };
}

export function formatCheckSummary(summary: CheckSummary): string {
  if (summary.ok) {
    return `✓ ${summary.checked} generated files verified — no drift`;
  }
  const lines = summary.problems.map((p) => `  ${p.kind.padEnd(9)} ${p.path} — ${p.detail}`);
  return [`Drift detected in ${summary.problems.length} file(s):`, ...lines].join('\n');
}
