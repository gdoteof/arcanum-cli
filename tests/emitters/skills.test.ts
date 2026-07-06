import { afterEach, describe, expect, it } from 'vitest';
import { emitSkills, skillDescription } from '../../src/emitters/claude/skills.js';
import { removeTree } from '../helpers.js';
import { FIXTURE_VERSION, findLoreWords, fixtureProject } from './fixtures.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

function fixture(deckYaml?: string) {
  const { project, roots } = fixtureProject(deckYaml);
  cleanups.push(...roots);
  return project;
}

describe('emitSkills', () => {
  it('emits one skill per rite at the directory Claude Code expects', () => {
    const files = emitSkills(fixture(), FIXTURE_VERSION);
    expect(files.map((f) => f.path)).toEqual(['.claude/skills/migration/SKILL.md']);
  });

  it('encodes the binding in the description frontmatter', () => {
    const skill = emitSkills(fixture(), FIXTURE_VERSION)[0]!;
    expect(skill.content.startsWith('---\nname: migration\ndescription: "Use when')).toBe(true);
    expect(skill.content).toContain('Applies whenever the task involves changing a database schema.');
  });

  it('omits the applies-clause when the rite binds to no change types', () => {
    const project = fixture(
      'version: 1\nrites:\n  - id: migration\n    bind_to:\n      change_types: []\n',
    );
    const description = skillDescription(project.rites[0]!);
    expect(description).not.toContain('Applies whenever');
    expect(description).toMatch(/^Use when/);
  });

  it('reflects deck bind_to overrides in the description', () => {
    const project = fixture(
      'version: 1\nrites:\n  - id: migration\n    bind_to:\n      change_types: [schema, config]\n',
    );
    expect(skillDescription(project.rites[0]!)).toContain(
      'changing a database schema or changing configuration files',
    );
  });

  it('points into the reference tree for depth', () => {
    const skill = emitSkills(fixture(), FIXTURE_VERSION)[0]!;
    expect(skill.content).toContain('Read arcana/rites/migration.md');
    expect(skill.content).toContain('do not improvise');
    expect(skill.content).not.toContain('Write the migration');
  });

  it('contains no lore vocabulary', () => {
    for (const file of emitSkills(fixture(), FIXTURE_VERSION)) {
      expect(findLoreWords(file.content), file.path).toEqual([]);
    }
  });
});
