import { generatorNotice } from '../../compiler/hash.js';
import type { Project, ResolvedCard } from '../../loader/index.js';
import { CHANGE_TYPE_PHRASES, MOMENT_PHRASES } from '../../types.js';
import { buildChecklist } from './checklist.js';
import type { EmittedFile } from './reference.js';
import { cardReviewTitle } from './shared.js';

/** Cards emitted as isolated subagents. */
export function agentCards(project: Project): ResolvedCard[] {
  return project.cards.filter((card) => card.card.meta.requires_isolation === 'preferred');
}

/** model_hint → Claude Code model alias: cheap passes on haiku, strong on the session model. */
const MODEL_BY_HINT = { cheap: 'haiku', strong: 'inherit' } as const;

/** Dispatch-oriented description compiled from the card's domain and vigils. */
export function agentDescription(card: ResolvedCard): string {
  const meta = card.card.meta;
  const { globs, moments, changes } = card.vigils;
  const cues: string[] = [];
  for (const moment of moments) cues.push(MOMENT_PHRASES[moment].toLowerCase());
  if (globs.length > 0) cues.push(`when changes touch files matching ${globs.join(', ')}`);
  for (const change of changes) cues.push(`when ${CHANGE_TYPE_PHRASES[change]}`);
  const when = cues.length > 0 ? ` Use ${cues.join('; ')}.` : '';
  return `Reviews a change set for ${meta.domain} findings without editing anything.${when}`;
}

/**
 * One subagent per isolation-preferred card (§4): isolated context, read-only
 * tools for reviewers, cheap models for cheap passes. The body is the same
 * compiled checklist the arcana/ reference carries.
 */
export function emitAgents(project: Project, version: string): EmittedFile[] {
  return agentCards(project).map((card) => {
    const meta = card.card.meta;
    const frontmatter = [
      '---',
      `name: ${meta.id}`,
      `description: "${agentDescription(card).replace(/"/g, '\\"')}"`,
      ...(meta.tools === 'read-only' ? ['tools: Read, Grep, Glob'] : []),
      `model: ${MODEL_BY_HINT[meta.model_hint]}`,
      '---',
    ];
    const content = [
      ...frontmatter,
      generatorNotice(version),
      '',
      `# ${cardReviewTitle(card)}`,
      '',
      'You review the change set you are given. You do not edit files, run the',
      'code, or fix anything — you report findings for the caller to act on.',
      '',
      buildChecklist(card),
      '',
      'Structure your reply as a list of findings (severity, location, what and',
      `why, suggested fix), or state clearly that the ${meta.domain} review found`,
      'nothing. Findings must be concrete enough to act on without re-review.',
    ].join('\n');
    return { path: `.claude/agents/${meta.id}.md`, content: `${content}\n` };
  });
}
