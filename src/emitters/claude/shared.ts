import type { ResolvedCard, ResolvedRite } from '../../loader/index.js';
import { CHANGE_TYPE_PHRASES, MOMENT_PHRASES, SEVERITIES, SEVERITY_CONTRACT, SEVERITY_LABELS } from '../../types.js';

export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

export function cardReferencePath(card: ResolvedCard): string {
  return `arcana/cards/${card.card.meta.id}.md`;
}

export function riteReferencePath(rite: ResolvedRite): string {
  return `arcana/rites/${rite.rite.meta.id}.md`;
}

export function cardReviewTitle(card: ResolvedCard): string {
  return `${capitalize(card.card.meta.domain)} review`;
}

/** "Use when making any schema change." → "When making any schema change" */
export function triggerToCondition(trigger: string): string {
  return capitalize(trigger.replace(/^use\s+/i, '').replace(/\.\s*$/, ''));
}

export function formatGlobs(globs: string[]): string {
  return globs.map((g) => `\`${g}\``).join(' or ');
}

/**
 * One routing line per active vigil, in plain language. Moment vigils are
 * conditioned on the card's globs when both are present; glob vigils without
 * a moment become continuous "when working in" instructions. Cards emitted
 * as subagents route to the agent instead of the inline checklist.
 */
export function cardRoutingLines(card: ResolvedCard, agentIds: ReadonlySet<string>): string[] {
  const meta = card.card.meta;
  const review = agentIds.has(meta.id)
    ? (what: string) => `have the \`${meta.id}\` agent review ${what}`
    : (what: string) => `review ${what} against ${cardReferencePath(card)}`;
  const domain = meta.domain;
  const { globs, moments, changes } = card.vigils;
  const lines: string[] = [];
  for (const moment of moments) {
    const when = MOMENT_PHRASES[moment];
    lines.push(
      globs.length > 0
        ? `- ${when}: if the changes touch ${formatGlobs(globs)}, ${review('them')} (${domain}).`
        : `- ${when}: ${review('the changes')} (${domain}).`,
    );
  }
  if (moments.length === 0 && globs.length > 0) {
    lines.push(
      `- When working in files matching ${formatGlobs(globs)}: ${review('your changes')} (${domain}) before finishing.`,
    );
  }
  for (const change of changes) {
    lines.push(`- When ${CHANGE_TYPE_PHRASES[change]}: ${review('the change')} (${domain}).`);
  }
  return lines;
}

export function riteRoutingLine(rite: ResolvedRite): string {
  return `- ${triggerToCondition(rite.rite.meta.trigger)}: read and follow ${riteReferencePath(rite)} before starting.`;
}

/** The severity behavior contract, in plain labels. */
export function severityContractLines(): string[] {
  return SEVERITIES.map(
    (s) => `- ${SEVERITY_LABELS[s]} — ${SEVERITY_CONTRACT[s]}.`,
  );
}
