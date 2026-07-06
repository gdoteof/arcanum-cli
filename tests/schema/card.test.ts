import { describe, expect, it } from 'vitest';
import { parseCard } from '../../src/schema/card.js';
import { VALID_CARD } from '../helpers.js';

describe('parseCard', () => {
  it('parses a fully specified card', () => {
    const card = parseCard(VALID_CARD, 'hermit.md');
    expect(card.meta).toEqual({
      id: 'hermit',
      arcanum: 9,
      title: 'The Hermit',
      domain: 'security',
      default_vigils: {
        globs: ['**/auth/**'],
        moments: ['pre-commit'],
        changes: ['dependency-add'],
      },
      severity_default: 'portent',
      requires_isolation: 'preferred',
      model_hint: 'strong',
      tools: 'read-only',
      posture: 'review',
    });
    expect(card.body).toContain('security auditor');
    expect(card.sourcePath).toBe('hermit.md');
  });

  it('applies defaults for optional fields', () => {
    const card = parseCard(
      `---\nid: plain\ndomain: style\nseverity_default: whisper\n---\nChecklist.\n`,
      'plain.md',
    );
    expect(card.meta.default_vigils).toEqual({ globs: [], moments: [], changes: [] });
    expect(card.meta.requires_isolation).toBe('none');
    expect(card.meta.model_hint).toBe('cheap');
    expect(card.meta.tools).toBe('read-only');
    expect(card.meta.arcanum).toBeUndefined();
  });

  it('rejects a non-kebab-case id', () => {
    expect(() =>
      parseCard(`---\nid: TheHermit\ndomain: x\nseverity_default: omen\n---\nB.\n`, 'f.md'),
    ).toThrow(/kebab-case/);
  });

  it('rejects an unknown moment, listing the known ones', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments: [pre-merge]\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/task-start, pre-commit, pre-push, pre-pr/);
  });

  it('rejects an unknown change type, listing the known ones', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  changes: [rewrite]\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/schema, dependency-add/);
  });

  it('rejects an unknown severity, listing the known ones', () => {
    expect(() =>
      parseCard(`---\nid: c\ndomain: x\nseverity_default: fatal\n---\nB.\n`, 'f.md'),
    ).toThrow(/whisper, omen, portent, doom/);
  });

  it('rejects unknown frontmatter keys', () => {
    expect(() =>
      parseCard(`---\nid: c\ndomain: x\nseverity_default: omen\ncolour: red\n---\nB.\n`, 'f.md'),
    ).toThrow(/[Uu]nrecognized/);
  });

  it('rejects an arcanum outside 0–21', () => {
    expect(() =>
      parseCard(`---\nid: c\narcanum: 23\ndomain: x\nseverity_default: omen\n---\nB.\n`, 'f.md'),
    ).toThrow(/arcanum/);
  });

  it('rejects an empty body', () => {
    expect(() =>
      parseCard(`---\nid: c\ndomain: x\nseverity_default: omen\n---\n\n`, 'f.md'),
    ).toThrow(/checklist.*empty/);
  });

  it('defaults posture to review', () => {
    const card = parseCard(VALID_CARD, 'hermit.md');
    expect(card.meta.posture).toBe('review');
  });

  it('accepts an adversarial card that is also isolated', () => {
    const text = `---\nid: devil\ndomain: abuse\nseverity_default: portent\nrequires_isolation: preferred\ntools: execute\nposture: adversarial\n---\nBreak it.\n`;
    const card = parseCard(text, 'devil.md');
    expect(card.meta.posture).toBe('adversarial');
    expect(card.meta.tools).toBe('execute');
  });

  it('rejects an adversarial card that is not isolated', () => {
    const text = `---\nid: devil\ndomain: abuse\nseverity_default: portent\nposture: adversarial\n---\nBreak it.\n`;
    expect(() => parseCard(text, 'devil.md')).toThrow(/adversarial cards must set requires_isolation/);
  });

  it('rejects an unknown posture', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\nposture: hostile\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/posture/);
  });

  it('rejects an invalid isolation value', () => {
    expect(() =>
      parseCard(
        `---\nid: c\ndomain: x\nseverity_default: omen\nrequires_isolation: always\n---\nB.\n`,
        'f.md',
      ),
    ).toThrow(/requires_isolation/);
  });
});
