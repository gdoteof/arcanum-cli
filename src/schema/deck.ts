import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ArcanaError, formatZodError } from '../errors.js';
import { CHANGE_TYPES } from '../types.js';
import { VigilsSchema } from './card.js';

const idPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const DeckCardSchema = z
  .object({
    id: z.string().regex(idPattern, 'must be kebab-case'),
    /** Per-key override of the card's default_vigils. */
    vigils: z
      .object({
        globs: z.array(z.string().min(1)).optional(),
        moments: VigilsSchema.shape.moments.removeDefault().optional(),
        changes: VigilsSchema.shape.changes.removeDefault().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const DeckRiteSchema = z
  .object({
    id: z.string().regex(idPattern, 'must be kebab-case'),
    /** Per-key override of the rite's default_bind. */
    bind_to: z
      .object({
        change_types: z
          .array(z.enum(CHANGE_TYPES, { message: `must be one of: ${CHANGE_TYPES.join(', ')}` }))
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DeckSchema = z
  .object({
    version: z.literal(1, {
      errorMap: () => ({ message: 'this version of arcana only supports "version: 1" decks' }),
    }),
    enforcement: z
      .object({
        claude_hooks: z.boolean().default(true),
        git_hooks: z.boolean().default(false),
      })
      .strict()
      .default({ claude_hooks: true, git_hooks: false }),
    cards: z.array(DeckCardSchema).default([]),
    rites: z.array(DeckRiteSchema).default([]),
    bindings: z
      .object({
        conduct: z
          .array(
            z
              .object({
                text: z.string().min(1),
                critical: z.boolean().default(false),
              })
              .strict(),
          )
          .default([]),
      })
      .strict()
      .default({ conduct: [] }),
  })
  .strict();

export type Deck = z.infer<typeof DeckSchema>;

export function parseDeck(text: string, filePath: string): Deck {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (err) {
    throw new ArcanaError(
      `${filePath}: not valid YAML (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const result = DeckSchema.safeParse(data);
  if (!result.success) {
    throw new ArcanaError(formatZodError(result.error, filePath));
  }
  const deck = result.data;
  for (const list of [deck.cards, deck.rites] as const) {
    const seen = new Set<string>();
    for (const entry of list) {
      if (seen.has(entry.id)) {
        throw new ArcanaError(`${filePath}: duplicate id "${entry.id}"`);
      }
      seen.add(entry.id);
    }
  }
  return deck;
}
