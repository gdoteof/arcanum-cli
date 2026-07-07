import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init.js';
import { makeTree, removeTree, VALID_CARD, VALID_DECK, VALID_PRECEPTS, VALID_RITE } from '../helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function registry(withDefaultDeck = true): string {
  const files: Record<string, string> = {
    'cards/09-hermit.md': VALID_CARD,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  };
  if (withDefaultDeck) files['deck.default.yaml'] = VALID_DECK;
  const dir = makeTree(files);
  cleanups.push(dir);
  return dir;
}

function emptyRoot(): string {
  const root = makeTree({});
  cleanups.push(root);
  return root;
}

const OPTS = (reg: string) => ({ version: '0.0.0-test', registryDir: reg });

describe('runInit', () => {
  it('installs the registry default deck and builds', () => {
    const root = emptyRoot();
    const summary = runInit(root, OPTS(registry()));
    expect(readFileSync(join(root, 'deck.yaml'), 'utf8')).toBe(VALID_DECK);
    expect(summary.written).toContain('CLAUDE.md');
    expect(existsSync(join(root, 'arcana/cards/hermit.md'))).toBe(true);
  });

  it('installs from an explicit deck file with --from', () => {
    const root = emptyRoot();
    const custom = join(root, 'my-deck.yaml');
    writeFileSync(custom, 'version: 1\nrites:\n  - id: migration\n');
    const summary = runInit(root, { ...OPTS(registry(false)), from: custom });
    expect(readFileSync(join(root, 'deck.yaml'), 'utf8')).toContain('migration');
    expect(summary.written).toEqual([
      '.claude/skills/arcana-edit/SKILL.md',
      '.claude/skills/migration/SKILL.md',
      'CLAUDE.md',
      'arcana/precepts.md',
      'arcana/rites/migration.md',
    ]);
  });

  it('refuses to overwrite an existing deck.yaml', () => {
    const root = emptyRoot();
    writeFileSync(join(root, 'deck.yaml'), 'version: 1\n');
    expect(() => runInit(root, OPTS(registry()))).toThrow(/already exists/);
  });

  it('errors when --from points at a missing file', () => {
    const root = emptyRoot();
    expect(() => runInit(root, { ...OPTS(registry()), from: join(root, 'nope.yaml') })).toThrow(
      /deck file not found/,
    );
  });

  it('errors when the registry has no default deck', () => {
    const root = emptyRoot();
    expect(() => runInit(root, OPTS(registry(false)))).toThrow(/no default deck/);
  });

  it('validates the deck before installing it', () => {
    const root = emptyRoot();
    const bad = join(root, 'bad.yaml');
    writeFileSync(bad, 'version: 7\n');
    expect(() => runInit(root, { ...OPTS(registry()), from: bad })).toThrow(/version: 1/);
    expect(existsSync(join(root, 'deck.yaml'))).toBe(false);
  });
});
