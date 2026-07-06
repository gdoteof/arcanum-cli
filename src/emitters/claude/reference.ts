import { generatorNotice } from '../../compiler/hash.js';
import type { Project, ResolvedCard, ResolvedRite } from '../../loader/index.js';
import { buildChecklist } from './checklist.js';
import { capitalize, cardReferencePath, cardReviewTitle, riteReferencePath } from './shared.js';

export interface EmittedFile {
  /** Repo-relative path, POSIX separators. */
  path: string;
  /** Final content, not yet stamped. */
  content: string;
}

function emitCardReference(card: ResolvedCard, version: string): EmittedFile {
  const content = [
    generatorNotice(version),
    '',
    `# ${cardReviewTitle(card)}`,
    '',
    buildChecklist(card),
  ].join('\n');
  return { path: cardReferencePath(card), content: `${content}\n` };
}

function emitRiteReference(rite: ResolvedRite, version: string): EmittedFile {
  const name = capitalize(rite.rite.meta.id.replace(/-/g, ' '));
  const content = [
    generatorNotice(version),
    '',
    `# ${name} workflow`,
    '',
    rite.rite.body,
  ].join('\n');
  return { path: riteReferencePath(rite), content: `${content}\n` };
}

function emitPrecepts(project: Project, version: string): EmittedFile {
  const content = [
    generatorNotice(version),
    '',
    project.preceptsBody,
    '',
    'These principles yield to the task when they genuinely conflict with it —',
    'when you depart from one, say which and why in your summary.',
  ].join('\n');
  return { path: 'arcana/precepts.md', content: `${content}\n` };
}

/** The lazy-loaded shared reference: arcana/cards, arcana/rites, precepts. */
export function emitReference(project: Project, version: string): EmittedFile[] {
  return [
    ...project.cards.map((card) => emitCardReference(card, version)),
    ...project.rites.map((rite) => emitRiteReference(rite, version)),
    emitPrecepts(project, version),
  ];
}
