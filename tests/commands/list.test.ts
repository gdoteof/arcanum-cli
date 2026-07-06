import { afterEach, describe, expect, it } from 'vitest';
import { runList } from '../../src/commands/list.js';
import { makeTree, removeTree, VALID_CARD, VALID_DECK, VALID_PRECEPTS, VALID_RITE } from '../helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function setup(deck = VALID_DECK) {
  const reg = makeTree({
    'cards/09-hermit.md': VALID_CARD,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  });
  const root = makeTree({ 'deck.yaml': deck });
  cleanups.push(reg, root);
  return runList(root, { version: '0.0.0-test', registryDir: reg });
}

describe('runList', () => {
  it('reports deck contents, vigils, conduct, and budget', () => {
    const out = setup();
    expect(out).toContain('Deck: 1 card(s), 1 rite(s), 2 conduct binding(s)');
    expect(out).toContain('Enforcement: claude hooks on, git hooks off');
    expect(out).toContain(
      'hermit (The Hermit, security) — globs: **/auth/** (review); moments: pre-commit (review); changes: dependency-add (review)',
    );
    expect(out).toContain('migration (pentacles) — binds to: schema');
    expect(out).toContain('Use when making any database schema change');
    expect(out).toContain('! Never commit credentials, tokens, or secrets.');
    expect(out).toContain('- All public API changes are versioned and documented.');
    expect(out).toMatch(/Budget: always-on core \d+\/150 lines/);
    expect(out).not.toContain('OVER BUDGET');
  });

  it('reports protected branches and a preamble when set', () => {
    const reg = makeTree({ 'precepts.md': VALID_PRECEPTS });
    const root = makeTree({
      'deck.yaml': 'version: 1\npreamble: src/preamble.md\nenforcement:\n  protected_branches: [main]\n',
      'src/preamble.md': '## Rules\n\nOne.\nTwo.\n',
    });
    cleanups.push(reg, root);
    const out = runList(root, { version: '0.0.0-test', registryDir: reg });
    expect(out).toContain('protected branches: main');
    expect(out).toContain('Preamble: src/preamble.md (4 lines, always-on)');
  });

  it('handles an empty deck and shows vigil-less cards', () => {
    const out = setup('version: 1\n');
    expect(out).toContain('Deck: 0 card(s), 0 rite(s), 0 conduct binding(s)');
    expect(out).not.toContain('Cards');
    expect(out).not.toContain('Rites');
  });

  it('warns when the deck is over budget', () => {
    const bindings = Array.from(
      { length: 160 },
      (_, i) => `    - text: "Conduct rule number ${i} for this repository."`,
    ).join('\n');
    const out = setup(`version: 1\nbindings:\n  conduct:\n${bindings}\n`);
    expect(out).toContain('OVER BUDGET, build will fail');
  });

  it('shows the mode of each moment, including an audit at pre-pr', () => {
    const reg = makeTree({
      'cards/devil.md':
        '---\nid: devil\ntitle: The Devil\ndomain: abuse\nseverity_default: portent\ndefault_vigils:\n  moments: [pre-pr]\n---\nBreak it.\n',
      'precepts.md': VALID_PRECEPTS,
    });
    const root = makeTree({ 'deck.yaml': 'version: 1\ncards:\n  - id: devil\n' });
    cleanups.push(reg, root);
    const out = runList(root, { version: '0.0.0-test', registryDir: reg });
    expect(out).toContain('devil (The Devil, abuse) — moments: pre-pr (audit)');
  });

  it('lists cards without lore titles by id and domain alone', () => {
    const reg = makeTree({
      'cards/plain.md': '---\nid: plain\ndomain: style\nseverity_default: whisper\n---\nChecklist.\n',
      'precepts.md': VALID_PRECEPTS,
    });
    const root = makeTree({ 'deck.yaml': 'version: 1\ncards:\n  - id: plain\n' });
    cleanups.push(reg, root);
    const out = runList(root, { version: '0.0.0-test', registryDir: reg });
    expect(out).toContain('plain (style) — no vigils');
  });
});
