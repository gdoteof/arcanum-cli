import { generatorNotice } from '../../compiler/hash.js';
import type { Project, ResolvedCard } from '../../loader/index.js';
import type { EmittedFile } from './reference.js';
import { cardReferencePath } from './shared.js';

export const GATE_PATH = '.claude/arcana/bin/gate.mjs';
export const MARK_PATH = '.claude/arcana/bin/mark-review.mjs';
export const LIB_PATH = '.claude/arcana/lib.mjs';
export const GUARD_CONFIG_PATH = '.claude/arcana/guard-config.mjs';

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookGroup {
  matcher: string;
  hooks: HookCommand[];
}

/** The settings.json hook entries this emission requires. */
export function hookGroups(): HookGroup[] {
  return [
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: `node ${GATE_PATH}`, timeout: 15 }],
    },
  ];
}

interface GateEntry {
  id: string;
  domain: string;
  reference: string;
  globs: string[];
  /** Gated moments with their intensity, so the block message names the right step. */
  moments: Array<{ at: string; mode: string }>;
}

/**
 * Cards whose moment vigils are deterministically gated. Pre-commit gates
 * require globs (gating every commit on a whole-diff pass would be punishing);
 * pre-push/pre-pr gates use the branch diff, globs optional. The mode rides
 * along so the message says "audit" or "review" as appropriate.
 */
export function gateEntries(project: Project): GateEntry[] {
  const entries: GateEntry[] = [];
  for (const card of project.cards) {
    const gatedMoments = card.vigils.moments.filter(
      (m) =>
        (m.at === 'pre-commit' && card.vigils.globs.length > 0) ||
        m.at === 'pre-push' ||
        m.at === 'pre-pr',
    );
    if (gatedMoments.length === 0) continue;
    entries.push({
      id: card.card.meta.id,
      domain: card.card.meta.domain,
      reference: cardReferencePath(card),
      globs: card.vigils.globs,
      moments: gatedMoments.map((m) => ({ at: m.at, mode: m.mode })),
    });
  }
  return entries;
}

/** Critical conduct bindings that have a deterministic hook mirror (§8). */
export function gatedBindingTexts(project: Project): Set<string> {
  const gated = new Set<string>();
  const branchProtection = project.deck.enforcement.protected_branches.length > 0;
  for (const binding of project.deck.bindings.conduct) {
    if (!binding.critical) continue;
    if (/secret|credential|token|password/i.test(binding.text)) gated.add(binding.text);
    if (/force-?push|rewrite history/i.test(binding.text)) gated.add(binding.text);
    if (branchProtection && /branch|pull request|\bPR\b|merge/i.test(binding.text)) {
      gated.add(binding.text);
    }
  }
  return gated;
}

function guardConfig(project: Project, version: string): string {
  const entries = gateEntries(project);
  const texts = gatedBindingTexts(project);
  const secretScan = [...texts].some((t) => /secret|credential|token|password/i.test(t));
  const forcePushBlocked = [...texts].some((t) => /force-?push|rewrite history/i.test(t));
  return [
    generatorNotice(version, 'js'),
    '',
    `export const secretScan = ${secretScan};`,
    `export const forcePushBlocked = ${forcePushBlocked};`,
    `export const protectedBranches = ${JSON.stringify(project.deck.enforcement.protected_branches)};`,
    `export const knownReviewIds = ${JSON.stringify(project.cards.map((c) => c.card.meta.id))};`,
    `export const gates = ${JSON.stringify(entries, null, 2)};`,
  ].join('\n');
}

const LIB_SOURCE = `import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function repoRoot() {
  const out = git(['rev-parse', '--show-toplevel']);
  return out ? out.trim() : null;
}

export function currentBranch() {
  const out = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return out ? out.trim() : null;
}

export function pathspecs(globs) {
  return globs.map((g) => ':(glob)' + g);
}

/** Hash of the staged diff, restricted to globs when provided. */
export function stagedHash(globs) {
  const args = ['diff', '--cached'];
  if (globs.length > 0) args.push('--', ...pathspecs(globs));
  const diff = git(args);
  return diff === null ? null : sha256(diff);
}

/** Merge base with the upstream default branch, or null when indeterminable. */
export function branchBase() {
  for (const ref of ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master']) {
    const base = git(['merge-base', 'HEAD', ref]);
    if (base) return base.trim();
  }
  return null;
}

/** Hash of the branch diff against the merge base; null when no base exists. */
export function branchHash(globs) {
  const base = branchBase();
  if (!base) return null;
  const args = ['diff', base, 'HEAD'];
  if (globs.length > 0) args.push('--', ...pathspecs(globs));
  const diff = git(args);
  return diff === null ? null : sha256(diff);
}

export function markerDir() {
  const root = repoRoot();
  return root ? join(root, '.arcana', 'reviews') : null;
}

export function readMarker(id) {
  const dir = markerDir();
  if (!dir) return null;
  const file = join(dir, id + '.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeMarker(id, marker) {
  const dir = markerDir();
  if (!dir) return false;
  mkdirSync(dir, { recursive: true });
  const root = repoRoot();
  const ignoreFile = join(root, '.arcana', '.gitignore');
  if (!existsSync(ignoreFile)) writeFileSync(ignoreFile, '*\\n');
  writeFileSync(join(dir, id + '.json'), JSON.stringify(marker, null, 2) + '\\n');
  return true;
}
`;

const GATE_SOURCE = `import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git, sha256, stagedHash, branchHash, pathspecs, readMarker, currentBranch, repoRoot } from '../lib.mjs';
import { secretScan, forcePushBlocked, protectedBranches, knownReviewIds, gates } from '../guard-config.mjs';

// BEST-EFFORT, NOT A SECURITY BOUNDARY. This hook reads the command TEXT before
// it runs, so it can only ever be a fast nudge for a cooperative agent, never an
// airtight control: quoting, subshells, git aliases/functions, a separate GIT_DIR
// or worktree, and staging in a later command can all defeat command-text parsing.
// The real enforcement for "no direct changes to a protected branch" is the host's
// server-side branch protection (and, locally, a git hook that runs at operation
// time). Two adversarial audits confirmed this layer cannot be made airtight; it is
// kept because catching the common cases early, with a clear message, is still
// useful. Do not rely on it as the only gate.

function block(message) {
  process.stderr.write(message + '\\n');
  process.exit(2);
}

// --- best-effort git command analysis ---------------------------------------
// Split into shell segments, keeping the separator that FOLLOWS each one so we can
// tell a guaranteed \`a && b\` sequence from a conditional \`a ; b\` / \`a || b\`.
function splitSegments(cmd) {
  const raw = cmd.split(/(&&|\\|\\||;|\\n|\\|)/);
  const out = [];
  for (let k = 0; k < raw.length; k += 2) {
    const text = (raw[k] || '').replace(/\\s+#.*$/, '').trim();
    if (text) out.push({ text, sepAfter: (raw[k + 1] || '').trim() });
  }
  return out;
}
const WRAPPERS = new Set([
  'env', 'command', 'time', 'nice', 'nohup', 'sudo', 'doas', 'stdbuf', 'ionice', 'setsid',
]);
function parseGit(seg) {
  const toks = seg.split(/\\s+/).filter(Boolean);
  let i = 0;
  for (;;) {
    if (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) { i += 1; continue; }
    if (i < toks.length && WRAPPERS.has(toks[i])) {
      i += 1;
      while (i < toks.length && toks[i].startsWith('-')) i += 1;
      continue;
    }
    break;
  }
  if (toks[i] !== 'git') return null;
  i += 1;
  const valued = ['-C', '-c', '--namespace', '--git-dir', '--work-tree', '--exec-path'];
  while (i < toks.length && toks[i].startsWith('-')) {
    i += valued.includes(toks[i]) && !toks[i].includes('=') ? 2 : 1;
  }
  if (i >= toks.length) return null;
  return { sub: toks[i], args: toks.slice(i + 1) };
}
function branchTarget(args) {
  // A \`--\` anywhere means this is a file-restore (\`git checkout main -- file\`),
  // not a branch switch — the branch is left unchanged.
  if (args.includes('--')) return null;
  for (const a of args) {
    if (a.startsWith('-')) continue;
    return a;
  }
  return null;
}
// Destination branch a push refspec updates. Returns 'HEAD' for the current-branch
// forms so the caller can resolve it against the simulated branch.
function refDest(refspec) {
  const r = refspec.replace(/^\\+/, '');
  const c = r.indexOf(':');
  const dst = c >= 0 ? r.slice(c + 1) : r;
  return dst.replace(/^refs\\/heads\\//, '');
}
function pushRefspecs(args) {
  return args.filter((a) => !a.startsWith('-')).slice(1);
}
function isForcePush(args) {
  return (
    args.some((a) => /^--force(-with-lease|-if-includes)?$/.test(a) || a === '-f') ||
    pushRefspecs(args).some((r) => r.startsWith('+'))
  );
}
function parseAdded(diff) {
  if (!diff) return [];
  const lines = [];
  let file = '(unknown file)';
  for (const line of diff.split('\\n')) {
    if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++')) lines.push([file, line.slice(1)]);
  }
  return lines;
}
function readFileSafe(p) {
  try {
    const abs = p.startsWith('/') ? p : join(repoRoot() || '.', p);
    const st = statSync(abs);
    if (!st.isFile() || st.size > 1048576) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.tool_name !== 'Bash') process.exit(0);
  command = String((input.tool_input && input.tool_input.command) || '');
} catch {
  process.exit(0);
}

const parsedSegs = splitSegments(command).map((s) => ({ ...s, git: parseGit(s.text) }));
const gitCmds = parsedSegs.map((s) => s.git).filter(Boolean);
const isPrCreate = /\\bgh\\s+pr\\s+create\\b/.test(command);

// Branch discipline + force-push conduct, in one pass so both see the branch a
// command actually acts on. A checkout/switch only moves the simulated branch when
// joined to what follows by \`&&\` (success guaranteed before the next command runs);
// a conditional \`;\`/\`||\` checkout is not assumed to have succeeded.
//
// This is deliberately best-effort and NOT exhaustive: it covers the everyday
// commit/merge/pull/push paths. Less common branch-moving subcommands (revert,
// cherry-pick, rebase, am, branch -f, update-ref) are NOT caught here — a local
// commit they create still cannot reach a protected branch except through a push,
// which IS checked. Server-side branch protection is the real gate.
const guardBranches = protectedBranches.length > 0;
if (forcePushBlocked || guardBranches) {
  let sim = currentBranch();
  const protectedNow = () => sim !== null && protectedBranches.includes(sim);
  const pushDests = (args) => {
    const specs = pushRefspecs(args);
    if (specs.length === 0) return sim === null ? [] : [sim];
    return specs.map((r) => {
      const dst = refDest(r);
      return dst === 'HEAD' ? sim : dst;
    });
  };
  for (const { git: g, sepAfter } of parsedSegs) {
    if (!g) continue;
    if (g.sub === 'checkout' || g.sub === 'switch') {
      const t = branchTarget(g.args);
      if (t !== null && sepAfter === '&&') sim = t;
      continue;
    }
    if (g.sub === 'push') {
      const dests = pushDests(g.args).filter((d) => d !== null);
      const targetsProtected = dests.some((d) => protectedBranches.includes(d));
      // Force-push conduct: with protected branches defined, only block force to
      // one of them (force-pushing your own feature branch after a rebase is fine);
      // with none defined, we cannot tell which branch is shared, so block all.
      if (forcePushBlocked && isForcePush(g.args) && (!guardBranches || targetsProtected)) {
        block(
          'Blocked by a conduct rule: never force-push or rewrite history on a shared ' +
            'branch. If this is genuinely required, ask the user to run it themselves.',
        );
      }
      if (guardBranches && targetsProtected) {
        block(
          'Blocked: do not push directly to a protected branch. Push your feature ' +
            'branch and open a pull request; the merge into ' +
            protectedBranches.join('/') +
            ' happens there.',
        );
      }
      continue;
    }
    if (!guardBranches) continue;
    if (g.sub === 'commit' && protectedNow()) {
      block(
        'Blocked: this would commit on the protected branch "' +
          sim +
          '". Do your work on a feature branch — "git checkout -b <name>" — and land it ' +
          'through a reviewed pull request.',
      );
    }
    if (g.sub === 'merge' && protectedNow()) {
      block(
        'Blocked: do not merge into the protected branch "' +
          sim +
          '" locally. Open a pull request and let it be reviewed and merged there.',
      );
    }
    if (g.sub === 'pull' && protectedNow()) {
      const pos = g.args.filter((a) => !a.startsWith('-'));
      const src = pos[1];
      if (src && !protectedBranches.includes(src)) {
        block(
          'Blocked: "git pull ' +
            (pos[0] || '') +
            ' ' +
            src +
            '" would merge ' +
            src +
            ' into the protected branch "' +
            sim +
            '" locally. Open a pull request instead.',
        );
      }
    }
  }
}

const isCommit = gitCmds.some((g) => g.sub === 'commit');
const isPush = gitCmds.some((g) => g.sub === 'push');
const moment = isCommit ? 'pre-commit' : isPush ? 'pre-push' : isPrCreate ? 'pre-pr' : null;
if (!moment) process.exit(0);

const SECRET_PATTERNS = [
  ['AWS access key id', /\\bAKIA[0-9A-Z]{16}\\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\\b/],
  ['GitHub fine-grained token', /\\bgithub_pat_[A-Za-z0-9_]{36,}\\b/],
  ['Slack token', /\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b/],
  ['sk-prefixed API key', /\\bsk-[A-Za-z0-9_-]{24,}\\b/],
  [
    'assigned secret value',
    /(?:api[_-]?key|secret|token|passwd|password)["']?\\s*[:=]\\s*["'][^"'\\s]{12,}["']/i,
  ],
];
const PLACEHOLDER =
  /(?:example|placeholder|changeme|dummy|redacted|your[_-]|<[^>]*>|\\$\\{|\\$[A-Z_]+|process\\.env|os\\.environ|xxx)/i;

// Added lines this command would put into the commit, best-effort:
//  - already staged (git diff --cached)
//  - for a path named in \`git add <path>\`: the added lines vs HEAD, or the whole
//    file when it is new/untracked (so we scan ADDED content, not the whole file —
//    that avoids re-flagging a pre-existing reviewed fixture)
//  - for \`commit -a/-am\` and \`git add -A/.\`: tracked modifications and any newly
//    added untracked files
function untrackedFiles() {
  const out = git(['ls-files', '--others', '--exclude-standard']);
  return out === null ? [] : out.split('\\n').map((s) => s.trim()).filter(Boolean);
}
function fileAllLines(p) {
  const content = readFileSafe(p);
  return content === null ? [] : content.split('\\n').map((ln) => [p, ln]);
}
function addedForPath(p) {
  const tracked = parseAdded(git(['diff', 'HEAD', '--', p]));
  return tracked.length > 0 ? tracked : fileAllLines(p);
}
// Positional pathspecs of a subcommand, skipping options and their values.
function positionalPaths(args) {
  const valued = new Set([
    '-m', '-C', '-c', '-F', '--author', '--date', '--file', '--reuse-message',
    '--reedit-message', '--fixup', '--squash', '--chmod',
  ]);
  const out = [];
  for (let k = 0; k < args.length; k += 1) {
    if (args[k] === '--') {
      for (k += 1; k < args.length; k += 1) out.push(args[k]);
      break;
    }
    if (valued.has(args[k])) { k += 1; continue; }
    if (args[k].startsWith('-')) continue;
    out.push(args[k]);
  }
  return out;
}

if (moment === 'pre-commit') {
  const staged = parseAdded(git(['diff', '--cached']));

  const commitG = gitCmds.find((g) => g.sub === 'commit');
  const autoStage =
    !!commitG &&
    commitG.args.some(
      (a) => a === '--all' || (a.startsWith('-') && !a.startsWith('--') && a.includes('a')),
    );
  const addSegs = gitCmds.filter((g) => g.sub === 'add');
  const addAll = addSegs.some((g) =>
    g.args.some((a) => a === '.' || a === '-A' || a === '--all' || a === '-u'),
  );
  const addPaths = addSegs.flatMap((g) => g.args.filter((a) => !a.startsWith('-') && a !== '.'));

  let scan = staged.slice();
  if (autoStage || addAll) {
    scan = scan.concat(parseAdded(git(['diff', 'HEAD'])));
    for (const p of untrackedFiles()) scan = scan.concat(fileAllLines(p));
  }
  for (const p of addPaths) scan = scan.concat(addedForPath(p));
  // \`git commit <pathspec>\` commits the working-tree version of those paths,
  // bypassing the index the staged-diff read sees.
  if (commitG) for (const p of positionalPaths(commitG.args)) scan = scan.concat(addedForPath(p));

  if (secretScan) {
    for (const [file, text] of scan) {
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (!pattern.test(text)) continue;
        if (label === 'assigned secret value' && PLACEHOLDER.test(text)) continue;
        block(
          'Blocked: the changes about to be committed appear to contain a secret (' +
            label +
            ' in ' +
            file +
            '). Remove the value and load it from the environment or a secret ' +
            'store instead. Conduct rule: never commit credentials, tokens, or secrets.',
        );
      }
    }
  }

  for (const [file, text] of staged) {
    const wardMatch = /\\bward\\(([^)]*)\\)(:?)\\s*(\\S?.*)/.exec(text);
    if (!wardMatch) continue;
    const [, id, colon, reason] = wardMatch;
    if (!knownReviewIds.includes(id)) {
      block(
        'Blocked: a suppression comment in ' +
          file +
          ' names an unknown review "' +
          id +
          '". Known ids: ' +
          knownReviewIds.join(', ') +
          '. Format: // ward(<id>): <reason>',
      );
    }
    if (!colon || reason.trim().length === 0) {
      block(
        'Blocked: a suppression comment in ' +
          file +
          ' has no reason. A suppression must carry its justification: // ward(' +
          id +
          '): <reason>',
      );
    }
  }
}

for (const gate of gates) {
  const binding = gate.moments.find((m) => m.at === moment);
  if (!binding) continue;
  const verb = binding.mode === 'audit' ? 'adversarial audit' : 'review';

  const scoped = gate.globs.length > 0;
  const basis = moment === 'pre-commit' ? 'staged' : 'branch';

  if (moment === 'pre-commit') {
    const touchedArgs = ['diff', '--cached', '--name-only'];
    if (scoped) touchedArgs.push('--', ...pathspecs(gate.globs));
    const touched = (git(touchedArgs) || '').trim();
    if (!touched) continue;
  }

  const expected = basis === 'staged' ? stagedHash(gate.globs) : branchHash(gate.globs);
  if (expected === null) {
    process.stderr.write(
      'arcana: could not determine the diff for the ' +
        gate.domain +
        ' ' +
        verb +
        ' gate (no merge base?) — allowing, but it is still required.\\n',
    );
    continue;
  }
  if (basis === 'branch') {
    const emptyHash = sha256('');
    if (expected === emptyHash) continue;
  }

  const marker = readMarker(gate.id);
  if (!marker || marker[basis] !== expected) {
    const how =
      binding.mode === 'audit'
        ? 'dispatch the ' + gate.id + ' agent to try to break the ' + (basis === 'staged' ? 'staged diff' : 'branch diff')
        : 'review the ' + (basis === 'staged' ? 'staged diff' : 'branch diff') + ' against ' + gate.reference;
    block(
      'Blocked: these changes require a ' +
        gate.domain +
        ' ' +
        verb +
        ' before this step. ' +
        how.charAt(0).toUpperCase() +
        how.slice(1) +
        ', resolve findings per its rules, then record it:\\n' +
        '  node .claude/arcana/bin/mark-review.mjs ' +
        gate.id +
        '\\nand retry. If the diff changed since the last time, run it again.',
    );
  }
}

process.exit(0);
`;

const MARK_SOURCE = `import { stagedHash, branchHash, writeMarker } from '../lib.mjs';
import { gates } from '../guard-config.mjs';

const id = process.argv[2];
if (!id) {
  process.stderr.write('usage: node .claude/arcana/bin/mark-review.mjs <review-id>\\n');
  process.exit(1);
}
const gate = gates.find((g) => g.id === id);
if (!gate) {
  const known = gates.map((g) => g.id).join(', ') || '(none)';
  process.stderr.write('unknown review id "' + id + '". Gated reviews: ' + known + '\\n');
  process.exit(1);
}

const marker = {
  id,
  staged: stagedHash(gate.globs),
  branch: branchHash(gate.globs),
};
if (!writeMarker(id, marker)) {
  process.stderr.write('not inside a git repository\\n');
  process.exit(1);
}
console.log('Recorded ' + gate.domain + ' review for the current diff.');
`;

/**
 * Vendored, auditable gate scripts (§10): few, short, committed to the repo,
 * never fetched at runtime. Emitted only when enforcement.claude_hooks is on.
 */
export function emitHooks(project: Project, version: string): EmittedFile[] {
  const notice = generatorNotice(version, 'js');
  return [
    { path: GUARD_CONFIG_PATH, content: `${guardConfig(project, version)}\n` },
    { path: LIB_PATH, content: `${notice}\n${LIB_SOURCE}` },
    { path: GATE_PATH, content: `${notice}\n${GATE_SOURCE}` },
    { path: MARK_PATH, content: `${notice}\n${MARK_SOURCE}` },
  ];
}
