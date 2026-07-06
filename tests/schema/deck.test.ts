import { describe, expect, it } from 'vitest';
import { parseDeck } from '../../src/schema/deck.js';
import { VALID_DECK } from '../helpers.js';

describe('parseDeck', () => {
  it('parses a full deck', () => {
    const deck = parseDeck(VALID_DECK, 'deck.yaml');
    expect(deck.version).toBe(1);
    expect(deck.enforcement).toEqual({ claude_hooks: true, git_hooks: false });
    expect(deck.cards).toEqual([{ id: 'hermit' }]);
    expect(deck.rites).toEqual([{ id: 'migration' }]);
    expect(deck.bindings.conduct).toHaveLength(2);
    expect(deck.bindings.conduct[0]).toEqual({
      text: 'Never commit credentials, tokens, or secrets.',
      critical: true,
    });
    expect(deck.bindings.conduct[1]!.critical).toBe(false);
  });

  it('applies defaults for a minimal deck', () => {
    const deck = parseDeck('version: 1\n', 'deck.yaml');
    expect(deck.enforcement).toEqual({ claude_hooks: true, git_hooks: false });
    expect(deck.cards).toEqual([]);
    expect(deck.rites).toEqual([]);
    expect(deck.bindings.conduct).toEqual([]);
  });

  it('parses per-key vigil overrides', () => {
    const deck = parseDeck(
      `version: 1\ncards:\n  - id: hermit\n    vigils:\n      globs: ["src/auth/**"]\n      moments: [pre-pr]\n`,
      'deck.yaml',
    );
    expect(deck.cards[0]!.vigils).toEqual({ globs: ['src/auth/**'], moments: ['pre-pr'] });
  });

  it('parses rite bind_to overrides', () => {
    const deck = parseDeck(
      `version: 1\nrites:\n  - id: migration\n    bind_to:\n      change_types: [schema, config]\n`,
      'deck.yaml',
    );
    expect(deck.rites[0]!.bind_to).toEqual({ change_types: ['schema', 'config'] });
  });

  it('rejects unsupported versions', () => {
    expect(() => parseDeck('version: 2\n', 'deck.yaml')).toThrow(/version: 1/);
  });

  it('rejects invalid YAML', () => {
    expect(() => parseDeck('version: [unclosed\n', 'deck.yaml')).toThrow(/not valid YAML/);
  });

  it('rejects duplicate card ids', () => {
    expect(() =>
      parseDeck('version: 1\ncards:\n  - id: hermit\n  - id: hermit\n', 'deck.yaml'),
    ).toThrow(/duplicate id "hermit"/);
  });

  it('rejects duplicate rite ids', () => {
    expect(() =>
      parseDeck('version: 1\nrites:\n  - id: migration\n  - id: migration\n', 'deck.yaml'),
    ).toThrow(/duplicate id "migration"/);
  });

  it('rejects unknown top-level keys', () => {
    expect(() => parseDeck('version: 1\nextras: true\n', 'deck.yaml')).toThrow(/[Uu]nrecognized/);
  });

  it('rejects unknown moments in vigils, listing the known ones', () => {
    expect(() =>
      parseDeck('version: 1\ncards:\n  - id: c\n    vigils:\n      moments: [on-save]\n', 'deck.yaml'),
    ).toThrow(/task-start, pre-commit, pre-push, pre-pr/);
  });

  it('rejects unknown change types in bind_to, listing the known ones', () => {
    expect(() =>
      parseDeck(
        'version: 1\nrites:\n  - id: r\n    bind_to:\n      change_types: [hotfix]\n',
        'deck.yaml',
      ),
    ).toThrow(/schema, dependency-add/);
  });

  it('rejects conduct bindings with empty text', () => {
    expect(() =>
      parseDeck('version: 1\nbindings:\n  conduct:\n    - text: ""\n', 'deck.yaml'),
    ).toThrow(/conduct/);
  });
});
