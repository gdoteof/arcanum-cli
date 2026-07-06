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
 * One routing line per active vigil, in plain language. Review vigils point at
 * the persona's checklist for self-review; audit vigils dispatch the persona
 * as an isolated agent that tries to break the change.
 */
export function cardRoutingLines(card: ResolvedCard): string[] {
  const meta = card.card.meta;
  const domain = meta.domain;
  const reviewAgainst = (what: string) => `review ${what} against ${cardReferencePath(card)}`;
  const auditWith = (what: string) => `have the \`${meta.id}\` agent try to break ${what}`;
  const { globs, moments, changes } = card.vigils;
  const lines: string[] = [];
  for (const { at, mode } of moments) {
    const when = MOMENT_PHRASES[at];
    // "stalled" is a self-monitored reflective moment, not a code diff — it steps
    // back and works through the persona rather than reviewing "the changes".
    if (at === 'stalled') {
      lines.push(
        `- ${when} (you are repeating an implement→check cycle without progress, or ` +
          `stuck failing the same test): step back and work through ${cardReferencePath(card)} ` +
          `(${domain}) before continuing.`,
      );
      continue;
    }
    const act = mode === 'audit' ? auditWith : reviewAgainst;
    const hasGlobs = globs.length > 0 && mode === 'review';
    lines.push(
      hasGlobs
        ? `- ${when}: if the changes touch ${formatGlobs(globs)}, ${act('them')} (${domain}).`
        : `- ${when}: ${act('the changes')} (${domain}).`,
    );
  }
  const hasReviewMoment = moments.some((m) => m.mode === 'review');
  if (!hasReviewMoment && globs.length > 0) {
    lines.push(
      `- When working in files matching ${formatGlobs(globs)}: ${reviewAgainst('your changes')} (${domain}) before finishing.`,
    );
  }
  for (const change of changes) {
    lines.push(`- When ${CHANGE_TYPE_PHRASES[change]}: ${reviewAgainst('the change')} (${domain}).`);
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
