import { afterEach, describe, expect, it } from 'vitest';
import { emitRules } from '../../src/emitters/claude/rules.js';
import { removeTree } from '../helpers.js';
import { FIXTURE_VERSION, findLoreWords, fixtureProject } from './fixtures.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function fixture(deckYaml?: string) {
  const { project, roots } = fixtureProject(deckYaml);
  cleanups.push(...roots);
  return project;
}

describe('emitRules', () => {
  it('emits one path-scoped rule per glob vigil, none for globless cards', () => {
    const files = emitRules(fixture(), FIXTURE_VERSION);
    expect(files.map((f) => f.path)).toEqual(['.claude/rules/hermit.md']); // justice has no globs
  });

  it('puts the globs in paths frontmatter on line 1', () => {
    const rule = emitRules(fixture(), FIXTURE_VERSION)[0]!;
    expect(rule.content.startsWith('---\npaths:\n  - "**/auth/**"\n---\n')).toBe(true);
  });

  it('uses deck-overridden globs, not card defaults', () => {
    const project = fixture(
      'version: 1\ncards:\n  - id: hermit\n    vigils:\n      globs: ["src/payments/**"]\n',
    );
    const rule = emitRules(project, FIXTURE_VERSION)[0]!;
    expect(rule.content).toContain('  - "src/payments/**"');
    expect(rule.content).not.toContain('**/auth/**');
  });

  it('points at the checklist instead of inlining it', () => {
    const rule = emitRules(fixture(), FIXTURE_VERSION)[0]!;
    expect(rule.content).toContain('mandatory security review');
    expect(rule.content).toContain('arcana/cards/hermit.md');
    expect(rule.content).not.toContain('security auditor');
  });

  it('contains no lore vocabulary', () => {
    for (const file of emitRules(fixture(), FIXTURE_VERSION)) {
      expect(findLoreWords(file.content), file.path).toEqual([]);
    }
  });
});
