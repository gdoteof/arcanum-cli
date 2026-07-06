import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject, defaultRegistryDir } from '../src/loader/index.js';
import { makeTree, removeTree, VALID_CARD, VALID_PRECEPTS, VALID_RITE } from './helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function tree(files: Record<string, string>): string {
  const root = makeTree(files);
  cleanups.push(root);
  return root;
}

/** A minimal standalone registry used by most tests. */
function registry(): string {
  return tree({
    'cards/09-hermit.md': VALID_CARD,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  });
}

describe('loadProject', () => {
  it('resolves registry cards and rites with default vigils and binds', () => {
    const root = tree({
      'deck.yaml': 'version: 1\ncards:\n  - id: hermit\nrites:\n  - id: migration\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.cards).toHaveLength(1);
    expect(project.cards[0]!.vigils).toEqual({
      globs: ['**/auth/**'],
      moments: [{ at: 'pre-commit', mode: 'review' }],
      changes: ['dependency-add'],
    });
    expect(project.rites[0]!.changeTypes).toEqual(['schema']);
    expect(project.rites[0]!.rite.suit).toBe('pentacles');
    expect(project.preceptsBody).toContain('simplest change');
  });

  it('applies per-key vigil overrides from deck.yaml, keeping unspecified keys', () => {
    const root = tree({
      'deck.yaml':
        'version: 1\ncards:\n  - id: hermit\n    vigils:\n      globs: ["src/payments/**"]\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.cards[0]!.vigils).toEqual({
      globs: ['src/payments/**'],
      moments: [{ at: 'pre-commit', mode: 'review' }],
      changes: ['dependency-add'],
    });
  });

  it('normalizes moments to their default mode (pre-pr is an audit)', () => {
    const card = VALID_CARD.replace('moments: [pre-commit]', 'moments: [pre-commit, pre-pr]');
    const reg = tree({
      'cards/09-hermit.md': card,
      'rites/pentacles/migration.md': VALID_RITE,
      'precepts.md': VALID_PRECEPTS,
    });
    const root = tree({ 'deck.yaml': 'version: 1\ncards:\n  - id: hermit\n' });
    const project = loadProject(root, { registryDir: reg });
    expect(project.cards[0]!.vigils.moments).toEqual([
      { at: 'pre-commit', mode: 'review' },
      { at: 'pre-pr', mode: 'audit' },
    ]);
  });

  it('honors an explicit per-binding mode override in the deck', () => {
    const root = tree({
      'deck.yaml':
        'version: 1\ncards:\n  - id: hermit\n    vigils:\n      moments:\n        - { at: pre-pr, mode: review }\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.cards[0]!.vigils.moments).toEqual([{ at: 'pre-pr', mode: 'review' }]);
  });

  it('applies bind_to overrides from deck.yaml', () => {
    const root = tree({
      'deck.yaml':
        'version: 1\nrites:\n  - id: migration\n    bind_to:\n      change_types: [schema, config]\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.rites[0]!.changeTypes).toEqual(['schema', 'config']);
  });

  it('prefers local src/cards over the registry for the same id', () => {
    const local = VALID_CARD.replace('domain: security', 'domain: local-security');
    const root = tree({
      'deck.yaml': 'version: 1\ncards:\n  - id: hermit\n',
      'src/cards/hermit.md': local,
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.cards[0]!.card.meta.domain).toBe('local-security');
  });

  it('resolves apocrypha cards when listed in the deck', () => {
    const apocryphal = VALID_CARD.replace('id: hermit', 'id: void').replace(/^arcanum: 9$/m, '');
    const root = tree({
      'deck.yaml': 'version: 1\ncards:\n  - id: void\n',
      'src/apocrypha/cards/void.md': apocryphal,
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.cards[0]!.card.meta.id).toBe('void');
  });

  it('resolves local rites under any suit directory', () => {
    const localRite = VALID_RITE.replace('id: migration', 'id: hotpatch');
    const root = tree({
      'deck.yaml': 'version: 1\nrites:\n  - id: hotpatch\n',
      'src/rites/swords/hotpatch.md': localRite,
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.rites[0]!.rite.suit).toBe('swords');
  });

  it('prefers local src/precepts.md over the registry', () => {
    const root = tree({
      'deck.yaml': 'version: 1\n',
      'src/precepts.md': '# Local precepts\n\n- Ship it.\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.preceptsBody).toContain('Ship it');
  });

  it('errors when deck.yaml is missing', () => {
    const root = tree({});
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(/arcana init/);
  });

  it('errors on an unknown card id, listing known cards', () => {
    const root = tree({ 'deck.yaml': 'version: 1\ncards:\n  - id: nonesuch\n' });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(
      /card "nonesuch" not found.*Known cards: hermit/s,
    );
  });

  it('errors on an unknown rite id, listing known rites', () => {
    const root = tree({ 'deck.yaml': 'version: 1\nrites:\n  - id: nonesuch\n' });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(
      /rite "nonesuch" not found.*Known rites: migration/s,
    );
  });

  it('errors when a card file id does not match the requested id', () => {
    const root = tree({
      'deck.yaml': 'version: 1\ncards:\n  - id: imposter\n',
      'src/cards/imposter.md': VALID_CARD,
    });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(
      /frontmatter id "hermit" does not match requested card "imposter"/,
    );
  });

  it('errors when a rite file id does not match the requested id', () => {
    const root = tree({
      'deck.yaml': 'version: 1\nrites:\n  - id: imposter\n',
      'src/rites/cups/imposter.md': VALID_RITE,
    });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(
      /does not match requested rite "imposter"/,
    );
  });

  it('errors when a card id matches multiple files in one directory', () => {
    const root = tree({
      'deck.yaml': 'version: 1\ncards:\n  - id: hermit\n',
      'src/cards/hermit.md': VALID_CARD,
      'src/cards/09-hermit.md': VALID_CARD,
    });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(/multiple files/);
  });

  it('errors when a rite id matches multiple files in one search root', () => {
    const root = tree({
      'deck.yaml': 'version: 1\nrites:\n  - id: migration\n',
      'src/rites/cups/migration.md': VALID_RITE,
      'src/rites/swords/migration.md': VALID_RITE,
    });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(/multiple files/);
  });

  it('errors when no precepts exist anywhere', () => {
    const bare = tree({ 'cards/09-hermit.md': VALID_CARD });
    const root = tree({ 'deck.yaml': 'version: 1\n' });
    expect(() => loadProject(root, { registryDir: bare })).toThrow(/no precepts found/);
  });

  it('reads a preamble file when the deck sets one', () => {
    const root = tree({
      'deck.yaml': 'version: 1\npreamble: src/preamble.md\n',
      'src/preamble.md': '## House rules\n\nBe careful.\n',
    });
    const project = loadProject(root, { registryDir: registry() });
    expect(project.preamble).toBe('## House rules\n\nBe careful.');
  });

  it('leaves preamble undefined when the deck sets none', () => {
    const root = tree({ 'deck.yaml': 'version: 1\n' });
    expect(loadProject(root, { registryDir: registry() }).preamble).toBeUndefined();
  });

  it('errors when the preamble file is missing', () => {
    const root = tree({ 'deck.yaml': 'version: 1\npreamble: src/preamble.md\n' });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(
      /preamble file not found: src\/preamble\.md/,
    );
  });

  it('errors when the preamble file is empty', () => {
    const root = tree({
      'deck.yaml': 'version: 1\npreamble: src/preamble.md\n',
      'src/preamble.md': '   \n',
    });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(/preamble file is empty/);
  });

  it('errors when the precepts file is empty', () => {
    const root = tree({ 'deck.yaml': 'version: 1\n', 'src/precepts.md': '\n' });
    expect(() => loadProject(root, { registryDir: registry() })).toThrow(/precepts file is empty/);
  });

  it('errors with a helpful message when no cards exist at all', () => {
    const bare = tree({ 'precepts.md': VALID_PRECEPTS });
    const root = tree({ 'deck.yaml': 'version: 1\ncards:\n  - id: ghost\n' });
    expect(() => loadProject(root, { registryDir: bare })).toThrow(/card "ghost" not found/);
  });

  it('locates the built-in registry directory at the package root', () => {
    expect(defaultRegistryDir()).toBe(join(process.cwd(), 'registry'));
  });
});
