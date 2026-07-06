import { generatorNotice } from '../../compiler/hash.js';
import type { Project } from '../../loader/index.js';
import type { EmittedFile } from './reference.js';
import { cardReferencePath } from './shared.js';

/**
 * One path-scoped rule per glob vigil (§4): when the agent works in a card's
 * territory, a pointer to that card's checklist enters context automatically.
 * The rule body stays small — the checklist itself loads only when followed.
 */
export function emitRules(project: Project, version: string): EmittedFile[] {
  return project.cards
    .filter((card) => card.vigils.globs.length > 0)
    .map((card) => {
      const meta = card.card.meta;
      const content = [
        '---',
        'paths:',
        ...card.vigils.globs.map((g) => `  - "${g}"`),
        '---',
        generatorNotice(version),
        '',
        `The files in play here are under mandatory ${meta.domain} review. Before`,
        'presenting or committing work that touches them, review your changes',
        `against ${cardReferencePath(card)} and act on its findings as it instructs.`,
      ].join('\n');
      return { path: `.claude/rules/${meta.id}.md`, content: `${content}\n` };
    });
}
