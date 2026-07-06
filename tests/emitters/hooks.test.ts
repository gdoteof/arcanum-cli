import { afterEach, describe, expect, it } from 'vitest';
import {
  emitHooks,
  gateEntries,
  gatedBindingTexts,
  hookGroups,
} from '../../src/emitters/claude/hooks.js';
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

describe('gateEntries', () => {
  it('gates glob-scoped pre-commit reviews and pre-pr audits, carrying the mode', () => {
    const entries = gateEntries(fixture());
    expect(entries).toEqual([
      {
        id: 'hermit',
        domain: 'security',
        reference: 'arcana/cards/hermit.md',
        globs: ['**/auth/**'],
        moments: [{ at: 'pre-commit', mode: 'review' }],
      },
      {
        id: 'justice',
        domain: 'correctness',
        reference: 'arcana/cards/justice.md',
        globs: [],
        moments: [{ at: 'pre-pr', mode: 'audit' }],
      },
    ]);
  });

  it('never gates a globless pre-commit vigil (too punishing) or advisory moments', () => {
    const project = fixture(
      `version: 1
cards:
  - id: hermit
    vigils:
      globs: []
      moments: [pre-commit, task-start, post-implementation]
      changes: []
`,
    );
    expect(gateEntries(project)).toEqual([]);
  });
});

describe('gatedBindingTexts', () => {
  it('mirrors only critical bindings with a reliable programmatic check', () => {
    const project = fixture(
      `version: 1
bindings:
  conduct:
    - text: "Never commit credentials, tokens, or secrets."
      critical: true
    - text: "Never force-push or rewrite history on a shared branch."
      critical: true
    - text: "APIs must be well-designed."
      critical: true
    - text: "Never commit secrets in tests."
`,
    );
    expect([...gatedBindingTexts(project)]).toEqual([
      'Never commit credentials, tokens, or secrets.',
      'Never force-push or rewrite history on a shared branch.',
    ]);
  });

  it('marks branch/PR bindings as gated only when a branch is protected', () => {
    const conduct = `bindings:
  conduct:
    - text: "Do all work on a feature branch; never commit to main."
      critical: true
    - text: "Land changes on main only through a reviewed pull request."
      critical: true
`;
    const off = fixture(`version: 1\n${conduct}`);
    expect(gatedBindingTexts(off).size).toBe(0);

    const on = fixture(`version: 1\nenforcement:\n  protected_branches: [main]\n${conduct}`);
    expect(on).toBeDefined();
    expect([...gatedBindingTexts(on)]).toEqual([
      'Do all work on a feature branch; never commit to main.',
      'Land changes on main only through a reviewed pull request.',
    ]);
  });
});

describe('emitHooks', () => {
  it('emits the vendored config, lib, gate, and marker scripts', () => {
    const files = emitHooks(fixture(), FIXTURE_VERSION);
    expect(files.map((f) => f.path)).toEqual([
      '.claude/arcana/guard-config.mjs',
      '.claude/arcana/lib.mjs',
      '.claude/arcana/bin/gate.mjs',
      '.claude/arcana/bin/mark-review.mjs',
    ]);
  });

  it('compiles the deck into guard-config.mjs', () => {
    const config = emitHooks(fixture(), FIXTURE_VERSION)[0]!;
    expect(config.content).toContain('export const secretScan = true;');
    expect(config.content).toContain('export const forcePushBlocked = false;');
    expect(config.content).toContain('export const protectedBranches = [];');
    expect(config.content).toContain('"id": "hermit"');
    expect(config.content).toContain('export const knownReviewIds = ["hermit","justice"];');
  });

  it('compiles protected branches into guard-config.mjs', () => {
    const project = fixture('version: 1\nenforcement:\n  protected_branches: [main, release]\n');
    const config = emitHooks(project, FIXTURE_VERSION)[0]!;
    expect(config.content).toContain('export const protectedBranches = ["main","release"];');
  });

  it('emits scripts with no runtime dependencies beyond node built-ins', () => {
    for (const file of emitHooks(fixture(), FIXTURE_VERSION)) {
      const imports = [...file.content.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const spec of imports) {
        expect(spec.startsWith('node:') || spec.startsWith('../'), `${file.path}: ${spec}`).toBe(
          true,
        );
      }
    }
  });

  it('contains no lore vocabulary in scripts or their messages', () => {
    for (const file of emitHooks(fixture(), FIXTURE_VERSION)) {
      expect(findLoreWords(file.content), file.path).toEqual([]);
    }
  });
});

describe('hookGroups', () => {
  it('registers a single Bash PreToolUse gate', () => {
    expect(hookGroups()).toEqual([
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'node .claude/arcana/bin/gate.mjs', timeout: 15 }],
      },
    ]);
  });
});
