import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBuild } from '../../src/commands/build.js';
import { formatCheckSummary, runCheck } from '../../src/commands/check.js';
import { stamp } from '../../src/compiler/hash.js';
import { makeTree, removeTree, VALID_CARD, VALID_PRECEPTS, VALID_RITE } from '../helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

const OPTS = { version: '0.0.0-test' };

function builtProject() {
  const reg = makeTree({
    'cards/09-hermit.md': VALID_CARD,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  });
  const root = makeTree({
    'deck.yaml': 'version: 1\ncards:\n  - id: hermit\nrites:\n  - id: migration\n',
  });
  cleanups.push(reg, root);
  runBuild(root, { ...OPTS, registryDir: reg });
  return { root, reg };
}

function check(root: string, reg: string) {
  return runCheck(root, { ...OPTS, registryDir: reg });
}

describe('runCheck', () => {
  it('passes on a clean build', () => {
    const { root, reg } = builtProject();
    const summary = check(root, reg);
    expect(summary.ok).toBe(true);
    expect(summary.checked).toBe(11);
    expect(formatCheckSummary(summary)).toContain('no drift');
  });

  it('reports hand-edited files as tampered', () => {
    const { root, reg } = builtProject();
    const target = join(root, 'arcana/cards/hermit.md');
    const original = readFileSync(target, 'utf8');
    const edited = original.replace('hardcoded credentials', 'plaintext passwords');
    expect(edited).not.toBe(original);
    writeFileSync(target, edited);
    const summary = check(root, reg);
    expect(summary.ok).toBe(false);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]).toMatchObject({ path: 'arcana/cards/hermit.md', kind: 'tampered' });
    expect(formatCheckSummary(summary)).toContain('hand-edited');
  });

  it('reports missing files', () => {
    const { root, reg } = builtProject();
    rmSync(join(root, 'CLAUDE.md'));
    const summary = check(root, reg);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]).toMatchObject({ path: 'CLAUDE.md', kind: 'missing' });
  });

  it('reports intact-but-outdated files as stale after sources change', () => {
    const { root, reg } = builtProject();
    writeFileSync(
      join(root, 'deck.yaml'),
      'version: 1\ncards:\n  - id: hermit\n    vigils:\n      globs: ["src/payments/**"]\nrites:\n  - id: migration\n',
    );
    const summary = check(root, reg);
    const kinds = new Map(summary.problems.map((p) => [p.path, p.kind]));
    expect(kinds.get('CLAUDE.md')).toBe('stale');
  });

  it('reports orphaned stamped files left by deck removals', () => {
    const { root, reg } = builtProject();
    writeFileSync(join(root, 'arcana/cards/ghost.md'), stamp('# Old review\n\nGone from deck.\n'));
    const summary = check(root, reg);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]).toMatchObject({ path: 'arcana/cards/ghost.md', kind: 'orphaned' });
  });

  it('reports settings drift when arcana hook entries are removed', () => {
    const { root, reg } = builtProject();
    writeFileSync(join(root, '.claude/settings.json'), '{}\n');
    const summary = check(root, reg);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]).toMatchObject({ path: '.claude/settings.json', kind: 'stale' });
    expect(summary.problems[0]!.detail).toContain('hook entries');
  });

  it('reports stale when the arcana version changes', () => {
    const { root, reg } = builtProject();
    const summary = runCheck(root, { version: '9.9.9', registryDir: reg });
    expect(summary.ok).toBe(false);
    expect(summary.problems.every((p) => p.kind === 'stale')).toBe(true);
  });
});
