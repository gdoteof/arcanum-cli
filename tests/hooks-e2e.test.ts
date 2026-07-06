import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBuild } from '../src/commands/build.js';
import { makeTree, removeTree, VALID_CARD, VALID_PRECEPTS, VALID_RITE } from './helpers.js';

// Assembled at runtime so this repo's own secret gate never matches test data.
const FAKE_AWS_KEY = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

let root: string;
let reg: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function stage(rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  git('add', rel);
}

function gate(command: string, tool = 'Bash'): { status: number | null; stderr: string } {
  const result = spawnSync('node', ['.claude/arcana/bin/gate.mjs'], {
    cwd: root,
    input: JSON.stringify({ tool_name: tool, tool_input: { command } }),
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

function mark(id: string): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync('node', ['.claude/arcana/bin/mark-review.mjs', id], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

beforeAll(() => {
  reg = makeTree({
    'cards/09-hermit.md': VALID_CARD,
    'cards/11-justice.md': `---
id: justice
domain: correctness
default_vigils:
  moments: [pre-pr]
severity_default: portent
requires_isolation: preferred
---
Review the change set for correctness.
`,
    'rites/pentacles/migration.md': VALID_RITE,
    'precepts.md': VALID_PRECEPTS,
  });
  root = makeTree({
    'deck.yaml': `version: 1
cards:
  - id: hermit
  - id: justice
rites:
  - id: migration
bindings:
  conduct:
    - text: "Never commit credentials, tokens, or secrets."
      critical: true
    - text: "Never force-push or rewrite history on a shared branch."
      critical: true
`,
  });
  runBuild(root, { version: '0.0.0-test', registryDir: reg });
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('add', '-A');
  git('commit', '-m', 'baseline');
});

afterAll(() => {
  removeTree(root);
  removeTree(reg);
});

describe('gate.mjs', () => {
  it('ignores non-git commands, non-Bash tools, and malformed input', () => {
    expect(gate('npm test').status).toBe(0);
    expect(gate('git commit -m x', 'Edit').status).toBe(0);
    const raw = spawnSync('node', ['.claude/arcana/bin/gate.mjs'], {
      cwd: root,
      input: 'not json',
      encoding: 'utf8',
    });
    expect(raw.status).toBe(0);
  });

  it('blocks a commit that stages a secret', () => {
    stage('config.py', `aws_access_key_id = "${FAKE_AWS_KEY}"\n`);
    const result = gate('git commit -m "add config"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('appear to contain a secret');
    expect(result.stderr).toContain('config.py');
    git('reset', 'config.py');
  });

  it('allows obvious placeholders through the generic secret pattern', () => {
    stage('settings.example.py', 'password = "YOUR_PASSWORD_GOES_HERE"\n');
    expect(gate('git commit -m "example config"').status).toBe(0);
    git('reset', 'settings.example.py');
  });

  it('blocks malformed suppression comments', () => {
    stage('notes.ts', '// ward(hermit) missing colon and reason\nconst x = 1;\n');
    const missingReason = gate('git commit -m x');
    expect(missingReason.status).toBe(2);
    expect(missingReason.stderr).toContain('no reason');
    git('reset', 'notes.ts');

    stage('notes.ts', '// ward(nonesuch): because\nconst x = 1;\n');
    const unknownId = gate('git commit -m x');
    expect(unknownId.status).toBe(2);
    expect(unknownId.stderr).toContain('unknown review "nonesuch"');
    expect(unknownId.stderr).toContain('hermit, justice');
    git('reset', 'notes.ts');
  });

  it('accepts a well-formed suppression comment', () => {
    stage('notes.ts', '// ward(hermit): dev-only endpoint, stripped at build\nconst x = 1;\n');
    expect(gate('git commit -m x').status).toBe(0);
    git('reset', 'notes.ts');
  });

  it('blocks commits touching guarded globs until the review is recorded', () => {
    stage('src/auth/login.ts', 'export const login = () => {};\n');
    const blocked = gate('git commit -m "auth change"');
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('security review');
    expect(blocked.stderr).toContain('mark-review.mjs hermit');

    const marked = mark('hermit');
    expect(marked.status).toBe(0);
    expect(marked.stdout).toContain('Recorded security review');
    expect(gate('git commit -m "auth change"').status).toBe(0);
  });

  it('re-blocks when the guarded diff changes after the review', () => {
    stage('src/auth/login.ts', 'export const login = () => { return true; };\n');
    const result = gate('git commit -m "auth change 2"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('If the diff changed since the last review');
    git('reset', 'src/auth/login.ts');
    rmSync(join(root, 'src/auth/login.ts'));
  });

  it('blocks force pushes as a conduct mirror', () => {
    for (const cmd of [
      'git push --force origin main',
      'git push -f',
      'git push --force-with-lease',
    ]) {
      const result = gate(cmd);
      expect(result.status, cmd).toBe(2);
      expect(result.stderr).toContain('never force-push');
    }
    expect(gate('git push origin main').status).toBe(0);
  });

  it('gates pull-request creation on the branch-diff review', () => {
    git('checkout', '-b', 'feature');
    stage('feature.ts', 'export const feature = 1;\n');
    git('commit', '-m', 'feature work');

    const blocked = gate('gh pr create --title x');
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('correctness review');
    expect(blocked.stderr).toContain('mark-review.mjs justice');

    expect(mark('justice').status).toBe(0);
    expect(gate('gh pr create --title x').status).toBe(0);
    git('checkout', 'main');
  });

  it('passes pr creation when the branch has no diff against the base', () => {
    expect(gate('gh pr create --title x').status).toBe(0);
  });
});

describe('mark-review.mjs', () => {
  it('rejects unknown or missing review ids', () => {
    const unknown = mark('nonesuch');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown review id');
    const missing = spawnSync('node', ['.claude/arcana/bin/mark-review.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('usage');
  });

  it('keeps its markers out of version control', () => {
    mark('hermit');
    const status = git('status', '--porcelain');
    expect(status).not.toContain('.arcana/');
  });
});
