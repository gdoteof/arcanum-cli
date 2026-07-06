import { generatorNotice } from '../../compiler/hash.js';
import type { Project, ResolvedRite } from '../../loader/index.js';
import { CHANGE_TYPE_PHRASES } from '../../types.js';
import type { EmittedFile } from './reference.js';
import { riteReferencePath } from './shared.js';

/**
 * Skill descriptions are always-on context; keep the compiled description
 * well under Claude Code's 1536-character listing cap.
 */
export const DESCRIPTION_MAX_LENGTH = 600;

/** The rite's trigger sentence, extended with the deck's change-type binding. */
export function skillDescription(rite: ResolvedRite): string {
  const trigger = rite.rite.meta.trigger.trim();
  const phrases = rite.changeTypes.map((c) => CHANGE_TYPE_PHRASES[c]);
  const covers = phrases.length > 0 ? ` Applies whenever the task involves ${phrases.join(' or ')}.` : '';
  return `${trigger}${covers}`;
}

/**
 * One skill per rite (§4): the description encodes the binding so routing is
 * native. The body points into arcana/ for depth so the two never drift.
 */
export function emitSkills(project: Project, version: string): EmittedFile[] {
  return project.rites.map((rite) => {
    const id = rite.rite.meta.id;
    const description = skillDescription(rite);
    /* v8 ignore next 5: trigger length is schema-capped well below this guard */
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      throw new Error(
        `skill "${id}": compiled description is ${description.length} chars (max ${DESCRIPTION_MAX_LENGTH})`,
      );
    }
    const content = [
      '---',
      `name: ${id}`,
      `description: "${description.replace(/"/g, '\\"')}"`,
      '---',
      generatorNotice(version),
      '',
      `This kind of work follows a set workflow. Read ${riteReferencePath(rite)}`,
      'now and follow its steps in order — do not improvise an alternative.',
    ].join('\n');
    return { path: `.claude/skills/${id}/SKILL.md`, content: `${content}\n` };
  });
}
