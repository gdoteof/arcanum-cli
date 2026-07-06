import { z } from 'zod';
import { ArcanaError, formatZodError } from '../errors.js';
import { parseFrontmatter } from '../frontmatter.js';
import { CHANGE_TYPES } from '../types.js';

const idPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Skill descriptions are always-on context (§6.3): cap length and require
 * trigger-oriented phrasing so the skill actually fires.
 */
export const TRIGGER_MAX_LENGTH = 200;
const TRIGGER_OPENERS = ['use when', 'use for', 'use before', 'use after'];

export const RiteFrontmatterSchema = z
  .object({
    id: z.string().regex(idPattern, 'must be kebab-case (e.g. "migration")'),
    title: z.string().min(1).optional(),
    trigger: z
      .string()
      .min(1)
      .max(
        TRIGGER_MAX_LENGTH,
        `trigger must be ≤${TRIGGER_MAX_LENGTH} characters — it is always-on context`,
      )
      .refine((t) => TRIGGER_OPENERS.some((o) => t.toLowerCase().startsWith(o)), {
        message: `trigger must start with one of: ${TRIGGER_OPENERS.map((o) => `"${o[0]!.toUpperCase()}${o.slice(1)} ..."`).join(', ')} — vague descriptions are the primary cause of skills failing to fire`,
      }),
    default_bind: z
      .object({
        change_types: z
          .array(z.enum(CHANGE_TYPES, { message: `must be one of: ${CHANGE_TYPES.join(', ')}` }))
          .default([]),
      })
      .strict()
      .default({ change_types: [] }),
  })
  .strict();

export type RiteFrontmatter = z.infer<typeof RiteFrontmatterSchema>;

export interface Rite {
  meta: RiteFrontmatter;
  /** Agent-facing workflow body; lore-free plain language. */
  body: string;
  /** Directory taxonomy in source only; never emitted. */
  suit: string;
  sourcePath: string;
}

export function parseRite(text: string, filePath: string, suit: string): Rite {
  const { data, body } = parseFrontmatter(text, filePath);
  const result = RiteFrontmatterSchema.safeParse(data);
  if (!result.success) {
    throw new ArcanaError(formatZodError(result.error, `rite frontmatter in ${filePath}`));
  }
  if (body.trim().length === 0) {
    throw new ArcanaError(`${filePath}: rite body (the workflow) is empty`);
  }
  return { meta: result.data, body: body.trim(), suit, sourcePath: filePath };
}
