import { afterEach, describe, expect, it } from 'vitest';
import { BUDGET_LINES } from '../../src/compiler/budget.js';
import { verifyStamp } from '../../src/compiler/hash.js';
import { compile } from '../../src/compiler/pipeline.js';
import { removeTree } from '../helpers.js';
import { FIXTURE_VERSION, fixtureProject } from '../emitters/fixtures.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function fixture(deckYaml?: string) {
  const { project, roots } = fixtureProject(deckYaml);
  cleanups.push(...roots);
  return project;
}

describe('compile', () => {
  it('emits the full surface, sorted by path', () => {
    const output = compile(fixture(), { version: FIXTURE_VERSION });
    expect(output.files.map((f) => f.path)).toEqual([
      '.claude/agents/justice.md', // justice audits at pre-pr; hermit is review-only
      '.claude/arcana/bin/gate.mjs',
      '.claude/arcana/bin/mark-review.mjs',
      '.claude/arcana/guard-config.mjs',
      '.claude/arcana/lib.mjs',
      '.claude/rules/hermit.md',
      '.claude/skills/migration/SKILL.md',
      'CLAUDE.md',
      'arcana/cards/hermit.md',
      'arcana/cards/justice.md',
      'arcana/precepts.md',
      'arcana/rites/migration.md',
    ]);
    expect(output.settingsGroups).toEqual([
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'node .claude/arcana/bin/gate.mjs', timeout: 15 }],
      },
    ]);
  });

  it('omits hooks and settings groups when enforcement is off', () => {
    const project = fixture(
      'version: 1\nenforcement:\n  claude_hooks: false\ncards:\n  - id: hermit\n',
    );
    const output = compile(project, { version: FIXTURE_VERSION });
    expect(output.files.some((f) => f.path.startsWith('.claude/arcana/'))).toBe(false);
    expect(output.settingsGroups).toEqual([]);
  });

  it('omits hooks when nothing is gated even with enforcement on', () => {
    const project = fixture('version: 1\nrites:\n  - id: migration\n');
    const output = compile(project, { version: FIXTURE_VERSION });
    expect(output.files.some((f) => f.path.startsWith('.claude/arcana/'))).toBe(false);
    expect(output.settingsGroups).toEqual([]);
  });

  it('stamps every emitted file verifiably', () => {
    for (const file of compile(fixture(), { version: FIXTURE_VERSION }).files) {
      expect(verifyStamp(file.content), file.path).toBe('ok');
    }
  });

  it('is deterministic: same inputs, byte-identical outputs', () => {
    const a = compile(fixture(), { version: FIXTURE_VERSION });
    const b = compile(fixture(), { version: FIXTURE_VERSION });
    expect(a.files).toEqual(b.files);
  });

  it('reports the core budget', () => {
    const output = compile(fixture(), { version: FIXTURE_VERSION });
    expect(output.budget.ok).toBe(true);
    expect(output.budget.lines).toBeLessThanOrEqual(BUDGET_LINES);
    expect(output.budget.lines).toBeGreaterThan(20);
  });

  it('fails the build with an overage report when the core exceeds the budget', () => {
    const manyBindings = Array.from(
      { length: BUDGET_LINES },
      (_, i) => `    - text: "Rule number ${i} about how to conduct changes in this repository."`,
    ).join('\n');
    const project = fixture(`version: 1\nbindings:\n  conduct:\n${manyBindings}\n`);
    expect(() => compile(project, { version: FIXTURE_VERSION })).toThrow(
      /over the 150-line always-on budget/,
    );
  });
});
