import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ownedFiles, runBuild } from '../../src/commands/build.js';
import { verifyStamp } from '../../src/compiler/hash.js';
import { makeTree, removeTree, VALID_CARD, VALID_PRECEPTS, VALID_RITE } from '../helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function registry(): string {
  const dir = makeTree({
    'cards/09-hermit.md': VALID_CARD,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  });
  cleanups.push(dir);
  return dir;
}

function projectRoot(deck = 'version: 1\ncards:\n  - id: hermit\nrites:\n  - id: migration\n') {
  const root = makeTree({ 'deck.yaml': deck });
  cleanups.push(root);
  return root;
}

const OPTS = (reg: string) => ({ version: '0.0.0-test', registryDir: reg });

describe('runBuild', () => {
  it('writes the full emission on first build', () => {
    const root = projectRoot();
    const summary = runBuild(root, OPTS(registry()));
    expect(summary.written).toEqual([
      'CLAUDE.md',
      'arcana/cards/hermit.md',
      'arcana/precepts.md',
      'arcana/rites/migration.md',
    ]);
    expect(summary.deleted).toEqual([]);
    for (const path of summary.written) {
      expect(verifyStamp(readFileSync(join(root, path), 'utf8'))).toBe('ok');
    }
  });

  it('is idempotent: a second build writes nothing', () => {
    const root = projectRoot();
    const reg = registry();
    runBuild(root, OPTS(reg));
    const second = runBuild(root, OPTS(reg));
    expect(second.written).toEqual([]);
    expect(second.unchanged).toHaveLength(4);
  });

  it('produces byte-identical output across rebuilds', () => {
    const root = projectRoot();
    const reg = registry();
    runBuild(root, OPTS(reg));
    const first = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    writeFileSync(join(root, 'CLAUDE.md'), 'clobbered\n');
    runBuild(root, OPTS(reg));
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe(first);
  });

  it('prunes stamped files whose card left the deck', () => {
    const root = projectRoot();
    const reg = registry();
    runBuild(root, OPTS(reg));
    writeFileSync(join(root, 'deck.yaml'), 'version: 1\nrites:\n  - id: migration\n');
    const summary = runBuild(root, OPTS(reg));
    expect(summary.deleted).toEqual(['arcana/cards/hermit.md']);
    expect(existsSync(join(root, 'arcana/cards/hermit.md'))).toBe(false);
  });

  it('never deletes unstamped files in owned directories', () => {
    const root = projectRoot();
    const reg = registry();
    runBuild(root, OPTS(reg));
    const handWritten = join(root, 'arcana/cards/notes.md');
    writeFileSync(handWritten, 'my own notes\n');
    const summary = runBuild(root, OPTS(reg));
    expect(summary.deleted).toEqual([]);
    expect(existsSync(handWritten)).toBe(true);
  });
});

describe('ownedFiles', () => {
  it('lists only stamped files under owned roots', () => {
    const root = projectRoot();
    runBuild(root, OPTS(registry()));
    writeFileSync(join(root, 'arcana/cards/notes.md'), 'not stamped\n');
    expect(ownedFiles(root)).toEqual([
      'CLAUDE.md',
      'arcana/cards/hermit.md',
      'arcana/precepts.md',
      'arcana/rites/migration.md',
    ]);
  });

  it('returns nothing before the first build', () => {
    expect(ownedFiles(projectRoot())).toEqual([]);
  });
});
