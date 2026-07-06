import { execFileSync, spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBuild } from '../src/commands/build.js';
import { makeTree, removeTree, VALID_PRECEPTS } from './helpers.js';

// A deck with only branch protection — no cards — so the gate exercises the
// branch logic in isolation.
let root: string;
let reg: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function gate(command: string): { status: number | null; stderr: string } {
  const result = spawnSync('node', ['.claude/arcana/bin/gate.mjs'], {
    cwd: root,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

beforeAll(() => {
  reg = makeTree({ 'precepts.md': VALID_PRECEPTS });
  root = makeTree({
    'deck.yaml': 'version: 1\nenforcement:\n  protected_branches: [main]\n',
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

describe('branch protection gate', () => {
  it('blocks a commit on the protected branch', () => {
    const result = gate('git commit -m "work"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('protected branch "main"');
    expect(result.stderr).toContain('git checkout -b');
  });

  it('blocks a merge into the protected branch', () => {
    const result = gate('git merge feature');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('do not merge into the protected branch');
  });

  it('blocks pushing the protected branch (by name or while on it)', () => {
    expect(gate('git push origin main').status).toBe(2);
    expect(gate('git push').status).toBe(2);
    expect(gate('git push origin HEAD:main').status).toBe(2);
  });

  it('allows work once on a feature branch', () => {
    git('checkout', '-b', 'feature');
    expect(gate('git commit -m "work"').status).toBe(0);
    expect(gate('git push origin feature').status).toBe(0);
    expect(gate('git merge other-feature').status).toBe(0);
  });

  it('still blocks pushing main from a feature branch', () => {
    // still on the feature branch from the previous test
    const result = gate('git push origin feature:main');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('do not push directly to a protected branch');
  });

  it('ignores unrelated commands', () => {
    expect(gate('npm test').status).toBe(0);
    expect(gate('git status').status).toBe(0);
  });

  // Regression suite for the bypasses the pre-merge adversarial audit confirmed.
  describe('audit-confirmed bypasses are closed', () => {
    it('blocks &&-chained checkout-then-commit/merge (guaranteed switch)', () => {
      git('checkout', 'feature');
      for (const cmd of [
        'git checkout main && git commit -m x',
        'git switch main && git merge feature',
        'git checkout main && git commit -m x && echo done',
      ]) {
        expect(gate(cmd).status, cmd).toBe(2);
      }
    });

    it('does NOT block ;/||-conditional checkouts — a documented best-effort limit', () => {
      // The hook cannot know whether a `;`/`||` checkout succeeded, so it does not
      // assume the branch moved (avoids false positives). The resulting main commit
      // is local-only and cannot reach the remote — server-side branch protection
      // is the real gate for that. This test pins the intended behavior.
      git('checkout', 'feature');
      expect(gate('git checkout main; git commit -m x').status).toBe(0);
      expect(gate('git checkout main || git commit -m x').status).toBe(0);
    });

    it('blocks refspec push forms the token matcher missed', () => {
      git('checkout', 'feature');
      for (const cmd of [
        'git push origin +main',
        'git push origin refs/heads/main',
        'git push origin HEAD:refs/heads/main',
        'git push origin +HEAD:refs/heads/main',
      ]) {
        expect(gate(cmd).status, cmd).toBe(2);
      }
    });

    it('blocks commit on main behind a -c or env prefix', () => {
      git('checkout', 'main');
      expect(gate('git -c user.name=x commit -m hi').status).toBe(2);
      expect(gate('GIT_AUTHOR_NAME=x git commit -m hi').status).toBe(2);
      git('checkout', 'feature');
    });

    it('no longer false-blocks a feature push that merely mentions main', () => {
      git('checkout', 'feature');
      expect(gate('git push origin feature # deploying to main').status).toBe(0);
      expect(gate('git push origin feature && echo done with main').status).toBe(0);
    });

    it('sees through command wrappers to the real git binary', () => {
      git('checkout', 'main');
      for (const cmd of [
        'env git commit -m x',
        'command git commit -m x',
        'time git commit -m x',
        'nice git commit -m x',
        'env git push origin main',
        'command git push --force origin main',
      ]) {
        expect(gate(cmd).status, cmd).toBe(2);
      }
      git('checkout', 'feature');
    });

    it('resolves HEAD push targets to the current branch', () => {
      git('checkout', 'main');
      expect(gate('git push origin HEAD').status).toBe(2);
      expect(gate('git push -u origin HEAD').status).toBe(2);
      git('checkout', 'feature');
      expect(gate('git push origin HEAD').status).toBe(0); // HEAD = feature, allowed
    });

    it('blocks git pull that merges another branch into a protected branch', () => {
      git('checkout', 'main');
      expect(gate('git pull origin feature').status).toBe(2);
      expect(gate('git pull origin main').status).toBe(0); // syncing main is fine
      expect(gate('git pull').status).toBe(0);
      git('checkout', 'feature');
    });

    it('treats "checkout <branch> -- <path>" as a file restore, not a switch', () => {
      git('checkout', 'feature');
      // Grabbing a file from main while staying on feature, then committing, is fine.
      expect(gate('git checkout main -- file.txt && git commit -m x').status).toBe(0);
      expect(gate('git checkout main -- . && git add -A && git commit -m x').status).toBe(0);
    });

    it('scopes force-push blocking to protected branches', () => {
      git('checkout', 'feature');
      // Force-pushing your own feature branch (e.g. after a rebase) is allowed…
      expect(gate('git push --force-with-lease origin feature').status).toBe(0);
      expect(gate('git push --force origin feature').status).toBe(0);
      // …but force-pushing a protected branch is blocked.
      expect(gate('git push --force origin main').status).toBe(2);
      expect(gate('git push --force-with-lease origin +main').status).toBe(2);
    });
  });
});
