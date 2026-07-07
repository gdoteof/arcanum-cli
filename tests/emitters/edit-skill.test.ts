import { describe, expect, it } from 'vitest';
import { emitEditSkill, EDIT_SKILL_PATH } from '../../src/emitters/claude/edit-skill.js';
import type { Catalog } from '../../src/loader/index.js';
import { FIXTURE_VERSION } from './fixtures.js';

const catalog: Catalog = {
  cards: [
    { id: 'hermit', domain: 'security' },
    { id: 'judgement', domain: 'synthesis' },
  ],
  rites: [{ id: 'migration', trigger: 'Use when making a schema change.' }],
};

describe('emitEditSkill', () => {
  it('emits a slash-invocable, auto-triggered skill at the expected path', () => {
    const file = emitEditSkill(catalog, FIXTURE_VERSION);
    expect(file.path).toBe(EDIT_SKILL_PATH);
    expect(file.content).toContain('name: arcana-edit');
    // description drives model auto-invocation and mentions the natural-language cue
    expect(file.content).toMatch(/description: ".*make arcana do X.*"/);
  });

  it('bakes in the actual available cards and rites', () => {
    const content = emitEditSkill(catalog, FIXTURE_VERSION).content;
    expect(content).toContain('- `hermit` — security');
    expect(content).toContain('- `judgement` — synthesis');
    expect(content).toContain('- `migration` — Use when making a schema change.');
  });

  it('lists every moment with its default mode, and both modes', () => {
    const content = emitEditSkill(catalog, FIXTURE_VERSION).content;
    expect(content).toContain('- `pre-pr` — before opening a pull request (default mode: `audit`)');
    expect(content).toContain('- `synthesis` —');
    expect(content).toContain('`review`');
    expect(content).toContain('`audit`');
  });

  it('encodes the safe workflow: propose diff, confirm, build, check', () => {
    const content = emitEditSkill(catalog, FIXTURE_VERSION).content;
    expect(content).toContain('Read the current `deck.yaml`');
    expect(content).toContain('confirm it with the user before applying');
    expect(content).toContain('arcanum-cli build');
    expect(content).toContain('arcanum-cli check');
    expect(content).toContain('Never');
    expect(content).toContain('source of truth');
  });

  it('handles an empty catalog gracefully', () => {
    const content = emitEditSkill({ cards: [], rites: [] }, FIXTURE_VERSION).content;
    expect(content).toContain('- (none found)');
  });
});
