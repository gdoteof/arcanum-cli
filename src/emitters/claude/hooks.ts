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
  for (const binding of project.deck.bindings.conduct) {
    if (!binding.critical) continue;
    if (/secret|credential|token|password/i.test(binding.text)) gated.add(binding.text);
    if (/force-?push|rewrite history/i.test(binding.text)) gated.add(binding.text);
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

const GATE_SOURCE = `import { readFileSync } from 'node:fs';
import { git, sha256, stagedHash, branchHash, pathspecs, readMarker } from '../lib.mjs';
import { secretScan, forcePushBlocked, knownReviewIds, gates } from '../guard-config.mjs';

function block(message) {
  process.stderr.write(message + '\\n');
  process.exit(2);
}

let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.tool_name !== 'Bash') process.exit(0);
  command = String((input.tool_input && input.tool_input.command) || '');
} catch {
  process.exit(0);
}

const gitPrefix = '\\\\bgit(\\\\s+-[^\\\\s]+|\\\\s+-C\\\\s+\\\\S+)*\\\\s+';
const isCommit = new RegExp(gitPrefix + 'commit\\\\b').test(command);
const isPush = new RegExp(gitPrefix + 'push\\\\b').test(command);
const isPrCreate = /\\bgh\\s+pr\\s+create\\b/.test(command);
const isForce = /(\\s--force(-with-lease|-if-includes)?\\b|\\s-f\\b)/.test(command);

if (isPush && isForce && forcePushBlocked) {
  block(
    'Blocked by a conduct rule: never force-push or rewrite history on a shared ' +
      'branch. If this is genuinely required, ask the user to run it themselves.',
  );
}

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

function addedLines() {
  const diff = git(['diff', '--cached']);
  if (diff === null) return [];
  const lines = [];
  let file = '(unknown file)';
  for (const line of diff.split('\\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push([file, line.slice(1)]);
    }
  }
  return lines;
}

if (moment === 'pre-commit') {
  const added = addedLines();

  if (secretScan) {
    for (const [file, text] of added) {
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (!pattern.test(text)) continue;
        if (label === 'assigned secret value' && PLACEHOLDER.test(text)) continue;
        block(
          'Blocked: the staged changes appear to contain a secret (' +
            label +
            ' in ' +
            file +
            '). Remove the value and load it from the environment or a secret ' +
            'store instead. Conduct rule: never commit credentials, tokens, or secrets.',
        );
      }
    }
  }

  for (const [file, text] of added) {
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
