import { checkBudget } from '../compiler/budget.js';
import { stamp } from '../compiler/hash.js';
import { auditCards } from '../emitters/claude/agents.js';
import { emitCore } from '../emitters/claude/core.js';
import { gatedBindingTexts } from '../emitters/claude/hooks.js';
import { loadProject, type LoadOptions, type ResolvedCard, type ResolvedRite } from '../loader/index.js';

export interface ListOptions extends LoadOptions {
  version: string;
}

function describeVigils(card: ResolvedCard): string {
  const { globs, moments, changes } = card.vigils;
  const parts: string[] = [];
  if (globs.length > 0) parts.push(`globs: ${globs.join(', ')} (review)`);
  if (moments.length > 0) {
    parts.push(`moments: ${moments.map((m) => `${m.at} (${m.mode})`).join(', ')}`);
  }
  if (changes.length > 0) parts.push(`changes: ${changes.join(', ')} (review)`);
  return parts.length > 0 ? parts.join('; ') : 'no vigils';
}

function cardLine(card: ResolvedCard): string {
  const meta = card.card.meta;
  const lore = meta.title ? `${meta.title}, ` : '';
  return `  ${meta.id} (${lore}${meta.domain}) — ${describeVigils(card)}`;
}

function riteLines(rite: ResolvedRite): string[] {
  const binds = rite.changeTypes.length > 0 ? ` — binds to: ${rite.changeTypes.join(', ')}` : '';
  return [`  ${rite.rite.meta.id} (${rite.rite.suit})${binds}`, `    ${rite.rite.meta.trigger}`];
}

/** Human-facing deck report: contents, vigils, and the always-on budget. */
export function runList(root: string, options: ListOptions): string {
  const project = loadProject(root, options);
  const { deck } = project;
  const lines: string[] = [];

  const protectedBranches = deck.enforcement.protected_branches;
  lines.push(
    `Deck: ${project.cards.length} card(s), ${project.rites.length} rite(s), ${deck.bindings.conduct.length} conduct binding(s)`,
    `Enforcement: claude hooks ${deck.enforcement.claude_hooks ? 'on' : 'off'}, git hooks ${deck.enforcement.git_hooks ? 'on' : 'off'}, protected branches: ${protectedBranches.length > 0 ? protectedBranches.join(', ') : 'none'}`,
  );
  if (project.preamble !== undefined) {
    lines.push(`Preamble: ${deck.preamble} (${project.preamble.split('\n').length} lines, always-on)`);
  }
  if (project.cards.length > 0) {
    lines.push('', 'Cards', ...project.cards.map(cardLine));
  }
  if (project.rites.length > 0) {
    lines.push('', 'Rites', ...project.rites.flatMap(riteLines));
  }
  if (deck.bindings.conduct.length > 0) {
    lines.push(
      '',
      'Conduct (! = critical)',
      ...deck.bindings.conduct.map((b) => `  ${b.critical ? '!' : '-'} ${b.text}`),
    );
  }

  // Assembled directly (not via compile) so an over-budget deck still lists.
  const hooksEnabled = deck.enforcement.claude_hooks;
  const core = stamp(
    emitCore(project, {
      version: options.version,
      gatedTexts: hooksEnabled ? gatedBindingTexts(project) : new Set<string>(),
      hasAudits: auditCards(project).length > 0,
    }),
  );
  const budget = checkBudget(core);
  lines.push(
    '',
    `Budget: always-on core ${budget.lines}/${budget.limit} lines${budget.ok ? '' : ' — OVER BUDGET, build will fail'}`,
  );
  return lines.join('\n');
}
