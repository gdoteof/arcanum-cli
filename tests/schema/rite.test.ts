import { describe, expect, it } from 'vitest';
import { parseRite } from '../../src/schema/rite.js';
import { VALID_RITE } from '../helpers.js';

describe('parseRite', () => {
  it('parses a fully specified rite', () => {
    const rite = parseRite(VALID_RITE, 'pentacles/migration.md', 'pentacles');
    expect(rite.meta.id).toBe('migration');
    expect(rite.meta.trigger).toMatch(/^Use when/);
    expect(rite.meta.default_bind.change_types).toEqual(['schema']);
    expect(rite.suit).toBe('pentacles');
    expect(rite.body).toContain('workflow');
  });

  it('applies defaults for optional fields', () => {
    const rite = parseRite(
      `---\nid: r\ntrigger: Use before opening any pull request.\n---\nSteps.\n`,
      'f.md',
      'swords',
    );
    expect(rite.meta.default_bind).toEqual({ change_types: [] });
    expect(rite.meta.title).toBeUndefined();
  });

  it('accepts each allowed trigger opener', () => {
    for (const opener of ['Use when', 'Use for', 'Use before', 'Use after']) {
      const rite = parseRite(
        `---\nid: r\ntrigger: ${opener} something specific happens.\n---\nSteps.\n`,
        'f.md',
        'cups',
      );
      expect(rite.meta.trigger.startsWith(opener)).toBe(true);
    }
  });

  it('rejects a trigger that does not start with a trigger phrase', () => {
    expect(() =>
      parseRite(`---\nid: r\ntrigger: This helps with migrations.\n---\nS.\n`, 'f.md', 'cups'),
    ).toThrow(/trigger must start with/);
  });

  it('rejects a trigger over the length cap', () => {
    const long = `Use when ${'x'.repeat(300)}`;
    expect(() => parseRite(`---\nid: r\ntrigger: ${long}\n---\nS.\n`, 'f.md', 'cups')).toThrow(
      /always-on context/,
    );
  });

  it('rejects an unknown change type in default_bind', () => {
    const text = `---\nid: r\ntrigger: Use when x.\ndefault_bind:\n  change_types: [feature]\n---\nS.\n`;
    expect(() => parseRite(text, 'f.md', 'cups')).toThrow(/schema, dependency-add/);
  });

  it('rejects unknown frontmatter keys', () => {
    expect(() =>
      parseRite(`---\nid: r\ntrigger: Use when x.\nsuit: cups\n---\nS.\n`, 'f.md', 'cups'),
    ).toThrow(/[Uu]nrecognized/);
  });

  it('rejects an empty body', () => {
    expect(() => parseRite(`---\nid: r\ntrigger: Use when x.\n---\n`, 'f.md', 'cups')).toThrow(
      /workflow.*empty/,
    );
  });

  it('rejects a non-kebab-case id', () => {
    expect(() => parseRite(`---\nid: My_Rite\ntrigger: Use when x.\n---\nS.\n`, 'f.md', 'c')).toThrow(
      /kebab-case/,
    );
  });
});
