import { z } from 'zod';
import { ArcanaError, formatZodError } from '../errors.js';
import { parseFrontmatter } from '../frontmatter.js';
import { CHANGE_TYPES, MODEL_HINTS, MOMENTS, SEVERITIES, TOOL_PROFILES } from '../types.js';

const idPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const VigilsSchema = z
  .object({
    globs: z.array(z.string().min(1)).default([]),
    moments: z
      .array(z.enum(MOMENTS, { message: `must be one of: ${MOMENTS.join(', ')}` }))
      .default([]),
    changes: z
      .array(z.enum(CHANGE_TYPES, { message: `must be one of: ${CHANGE_TYPES.join(', ')}` }))
      .default([]),
  })
  .strict();

export const CardFrontmatterSchema = z
  .object({
    id: z.string().regex(idPattern, 'must be kebab-case (e.g. "hermit", "high-priestess")'),
    arcanum: z.number().int().min(0).max(21).optional(),
    title: z.string().min(1).optional(),
    domain: z.string().min(1),
    default_vigils: VigilsSchema.default({ globs: [], moments: [], changes: [] }),
    severity_default: z.enum(SEVERITIES, {
      message: `must be one of: ${SEVERITIES.join(', ')}`,
    }),
    requires_isolation: z.enum(['preferred', 'none']).default('none'),
    model_hint: z.enum(MODEL_HINTS).default('cheap'),
    tools: z.enum(TOOL_PROFILES).default('read-only'),
  })
  .strict();

export type CardFrontmatter = z.infer<typeof CardFrontmatterSchema>;

export interface Card {
  meta: CardFrontmatter;
  /** Agent-facing checklist body; lore-free plain language. */
  body: string;
  sourcePath: string;
}

export function parseCard(text: string, filePath: string): Card {
  const { data, body } = parseFrontmatter(text, filePath);
  const result = CardFrontmatterSchema.safeParse(data);
  if (!result.success) {
    throw new ArcanaError(formatZodError(result.error, `card frontmatter in ${filePath}`));
  }
  if (body.trim().length === 0) {
    throw new ArcanaError(`${filePath}: card body (the checklist) is empty`);
  }
  return { meta: result.data, body: body.trim(), sourcePath: filePath };
}
