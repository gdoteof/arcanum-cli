import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArcanaError } from '../errors.js';
import { parseFrontmatter } from '../frontmatter.js';
import { parseCard, type Card } from '../schema/card.js';
import { parseDeck, type Deck } from '../schema/deck.js';
import { parseRite, type Rite } from '../schema/rite.js';
import { normalizeMoment, type ChangeType, type Vigils } from '../types.js';

export const DECK_FILENAME = 'deck.yaml';

export interface ResolvedCard {
  card: Card;
  /** deck.yaml vigils merged over the card's default_vigils (per-key override). */
  vigils: Vigils;
}

export interface ResolvedRite {
  rite: Rite;
  /** deck.yaml bind_to merged over the rite's default_bind (per-key override). */
  changeTypes: ChangeType[];
}

export interface Project {
  root: string;
  deck: Deck;
  cards: ResolvedCard[];
  rites: ResolvedRite[];
  preceptsBody: string;
  /** Verbatim always-on team-owned content, or undefined when no preamble is set. */
  preamble: string | undefined;
  /** Where the built-in registry was resolved from (for cataloging available cards/rites). */
  registryDir: string;
}

/** Lightweight metadata for a card/rite available to add to the deck. */
export interface CardInfo {
  id: string;
  domain: string;
}
export interface RiteInfo {
  id: string;
  trigger: string;
}
export interface Catalog {
  cards: CardInfo[];
  rites: RiteInfo[];
}

export interface LoadOptions {
  /** Override the built-in registry directory (tests, custom registries). */
  registryDir?: string;
}

export function defaultRegistryDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    /* v8 ignore next: filesystem root is unreachable in a valid install */
    if (parent === dir) throw new ArcanaError('could not locate the arcana package root');
    dir = parent;
  }
  return join(dir, 'registry');
}

/** Directories searched for a card id, in priority order (local overrides registry). */
function cardSearchDirs(root: string, registryDir: string): string[] {
  return [
    join(root, 'src', 'cards'),
    join(root, 'src', 'apocrypha', 'cards'),
    join(registryDir, 'cards'),
  ];
}

function riteSearchDirs(root: string, registryDir: string): string[] {
  return [
    join(root, 'src', 'rites'),
    join(root, 'src', 'apocrypha', 'rites'),
    join(registryDir, 'rites'),
  ];
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

/** A card file is named `<id>.md` or `<nn>-<id>.md`. */
function matchesId(fileName: string, id: string): boolean {
  return fileName === `${id}.md` || new RegExp(`^\\d+-${id}\\.md$`).test(fileName);
}

function findCardFile(id: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    const matches = listMarkdown(dir).filter((name) => matchesId(name, id));
    if (matches.length > 1) {
      throw new ArcanaError(`card "${id}" matches multiple files in ${dir}: ${matches.join(', ')}`);
    }
    if (matches.length === 1) return join(dir, matches[0]!);
  }
  return undefined;
}

/** Rite files live one level deeper: `rites/<suit>/<id>.md`. Returns [path, suit]. */
function findRiteFile(id: string, dirs: string[]): [string, string] | undefined {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const found: Array<[string, string]> = [];
    for (const suit of readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()) {
      for (const name of listMarkdown(join(dir, suit)).filter((n) => matchesId(n, id))) {
        found.push([join(dir, suit, name), suit]);
      }
    }
    if (found.length > 1) {
      throw new ArcanaError(
        `rite "${id}" matches multiple files under ${dir}: ${found.map(([p]) => p).join(', ')}`,
      );
    }
    if (found.length === 1) return found[0]!;
  }
  return undefined;
}

function availableIds(dirs: string[], nested: boolean): string[] {
  const ids = new Set<string>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = nested
      ? readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e) => listMarkdown(join(dir, e.name)))
      : listMarkdown(dir);
    for (const name of files) {
      ids.add(name.replace(/\.md$/, '').replace(/^\d+-/, ''));
    }
  }
  return [...ids].sort();
}

export function loadProject(root: string, options: LoadOptions = {}): Project {
  const registryDir = options.registryDir ?? defaultRegistryDir();
  const deckPath = join(root, DECK_FILENAME);
  if (!existsSync(deckPath)) {
    throw new ArcanaError(`no ${DECK_FILENAME} found in ${root} — run "arcanum-cli init" first`);
  }
  const deck = parseDeck(readFileSync(deckPath, 'utf8'), deckPath);

  const cardDirs = cardSearchDirs(root, registryDir);
  const cards: ResolvedCard[] = deck.cards.map((entry) => {
    const filePath = findCardFile(entry.id, cardDirs);
    if (!filePath) {
      const known = availableIds(cardDirs, false);
      throw new ArcanaError(
        `card "${entry.id}" not found in src/cards/ or the registry.` +
          (known.length > 0 ? ` Known cards: ${known.join(', ')}` : ''),
      );
    }
    const card = parseCard(readFileSync(filePath, 'utf8'), filePath);
    if (card.meta.id !== entry.id) {
      throw new ArcanaError(
        `${filePath}: frontmatter id "${card.meta.id}" does not match requested card "${entry.id}"`,
      );
    }
    const defaults = card.meta.default_vigils;
    const vigils: Vigils = {
      globs: entry.vigils?.globs ?? defaults.globs,
      moments: (entry.vigils?.moments ?? defaults.moments).map(normalizeMoment),
      changes: entry.vigils?.changes ?? defaults.changes,
    };
    return { card, vigils };
  });

  const riteDirs = riteSearchDirs(root, registryDir);
  const rites: ResolvedRite[] = deck.rites.map((entry) => {
    const found = findRiteFile(entry.id, riteDirs);
    if (!found) {
      const known = availableIds(riteDirs, true);
      throw new ArcanaError(
        `rite "${entry.id}" not found in src/rites/ or the registry.` +
          (known.length > 0 ? ` Known rites: ${known.join(', ')}` : ''),
      );
    }
    const [filePath, suit] = found;
    const rite = parseRite(readFileSync(filePath, 'utf8'), filePath, suit);
    if (rite.meta.id !== entry.id) {
      throw new ArcanaError(
        `${filePath}: frontmatter id "${rite.meta.id}" does not match requested rite "${entry.id}"`,
      );
    }
    const changeTypes = entry.bind_to?.change_types ?? rite.meta.default_bind.change_types;
    return { rite, changeTypes };
  });

  const preceptsPath = [join(root, 'src', 'precepts.md'), join(registryDir, 'precepts.md')].find(
    (p) => existsSync(p),
  );
  if (!preceptsPath) {
    throw new ArcanaError(
      'no precepts found: expected src/precepts.md in the project or precepts.md in the registry',
    );
  }
  const preceptsBody = readFileSync(preceptsPath, 'utf8').trim();
  if (preceptsBody.length === 0) {
    throw new ArcanaError(`${preceptsPath}: precepts file is empty`);
  }

  let preamble: string | undefined;
  if (deck.preamble !== undefined) {
    const preamblePath = join(root, deck.preamble);
    if (!existsSync(preamblePath)) {
      throw new ArcanaError(`preamble file not found: ${deck.preamble} (set by deck.yaml)`);
    }
    preamble = readFileSync(preamblePath, 'utf8').trim();
    if (preamble.length === 0) {
      throw new ArcanaError(`${preamblePath}: preamble file is empty`);
    }
  }

  return { root, deck, cards, rites, preceptsBody, preamble, registryDir };
}

/** Read `id`/`domain` from a card file's frontmatter, or null if unreadable. */
function cardInfo(filePath: string): CardInfo | null {
  try {
    const { data } = parseFrontmatter(readFileSync(filePath, 'utf8'), filePath);
    const d = data as { id?: unknown; domain?: unknown };
    if (typeof d.id === 'string' && typeof d.domain === 'string') {
      return { id: d.id, domain: d.domain };
    }
  } catch {
    /* skip malformed files in the catalog */
  }
  return null;
}

function riteInfo(filePath: string): RiteInfo | null {
  try {
    const { data } = parseFrontmatter(readFileSync(filePath, 'utf8'), filePath);
    const d = data as { id?: unknown; trigger?: unknown };
    if (typeof d.id === 'string' && typeof d.trigger === 'string') {
      return { id: d.id, trigger: d.trigger };
    }
  } catch {
    /* skip */
  }
  return null;
}

/**
 * Everything available to add to a deck — registry cards/rites plus any local
 * ones — deduped by id (local overrides registry), sorted. Feeds the arcana-edit
 * skill so the agent edits against real options, not hallucinated ones.
 */
export function buildCatalog(root: string, options: LoadOptions = {}): Catalog {
  const registryDir = options.registryDir ?? defaultRegistryDir();

  const cards = new Map<string, CardInfo>();
  for (const dir of cardSearchDirs(root, registryDir)) {
    for (const name of listMarkdown(dir)) {
      const info = cardInfo(join(dir, name));
      if (info && !cards.has(info.id)) cards.set(info.id, info);
    }
  }

  const rites = new Map<string, RiteInfo>();
  for (const dir of riteSearchDirs(root, registryDir)) {
    if (!existsSync(dir)) continue;
    for (const suit of readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)) {
      for (const name of listMarkdown(join(dir, suit))) {
        const info = riteInfo(join(dir, suit, name));
        if (info && !rites.has(info.id)) rites.set(info.id, info);
      }
    }
  }

  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
  return {
    cards: [...cards.values()].sort(byId),
    rites: [...rites.values()].sort(byId),
  };
}
