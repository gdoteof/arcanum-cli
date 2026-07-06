import { describe, expect, it } from 'vitest';
import { parseCard } from '../../src/schema/card.js';
import { VALID_CARD } from '../helpers.js';

describe('parseCard', () => {
  it('parses a persona card with all its fields', () => {
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
    });
    expect(card.body).toContain('security auditor');
    expect(card.sourcePath).toBe('hermit.md');
  });

  it('carries no privilege or posture fields — a card is only a persona', () => {
    const card = parseCard(VALID_CARD, 'hermit.md');
    expect(card.meta).not.toHaveProperty('tools');
    expect(card.meta).not.toHaveProperty('posture');
    expect(card.meta).not.toHaveProperty('requires_isolation');
    expect(card.meta).not.toHaveProperty('model_hint');
  });

  it('rejects privilege fields that used to live on the card', () => {
    for (const field of ['tools: execute', 'posture: adversarial', 'model_hint: strong']) {
      const text = `---\nid: c\ndomain: x\nseverity_default: omen\n${field}\n---\nB.\n`;
      expect(() => parseCard(text, 'f.md'), field).toThrow(/[Uu]nrecognized/);
    }
  });

  it('parses a moment mode override', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments:\n    - { at: pre-pr, mode: review }\n---\nB.\n`;
    const card = parseCard(text, 'f.md');
    expect(card.meta.default_vigils.moments).toEqual([{ at: 'pre-pr', mode: 'review' }]);
  });

  it('rejects an unknown mode in a moment override', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments:\n    - { at: pre-pr, mode: destroy }\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/review, audit/);
  });

  it('rejects an unknown moment in an override object', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments:\n    - { at: pre-merge, mode: review }\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/task-start, pre-commit, pre-push, pre-pr/);
  });

  it('rejects an override object missing its mode', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments:\n    - { at: pre-pr }\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/review, audit/);
  });

  it('rejects an unrecognized key in a moment override', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments:\n    - { at: pre-pr, mode: audit, when: always }\n---\nB.\n`;
    expect(() => parseCard(text, 'f.md')).toThrow(/unrecognized key "when"/);
  });

  it('applies defaults for optional fields', () => {
    const card = parseCard(
      `---\nid: plain\ndomain: style\nseverity_default: whisper\n---\nChecklist.\n`,
      'plain.md',
    );
    expect(card.meta.default_vigils).toEqual({ globs: [], moments: [], changes: [] });
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

  it('accepts the self-monitored "stalled" moment', () => {
    const text = `---\nid: c\ndomain: x\nseverity_default: portent\ndefault_vigils:\n  moments: [stalled]\n---\nB.\n`;
    const card = parseCard(text, 'f.md');
    expect(card.meta.default_vigils.moments).toEqual(['stalled']);
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

  it('rejects an empty checklist body regardless of vigils', () => {
    expect(() =>
      parseCard(
        `---\nid: c\ndomain: x\nseverity_default: omen\ndefault_vigils:\n  moments: [pre-pr]\n---\n\n`,
        'f.md',
      ),
    ).toThrow(/checklist.*empty/);
  });
});
