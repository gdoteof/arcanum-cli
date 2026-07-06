import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { runCheck } from '../src/commands/check.js';
import { runList } from '../src/commands/list.js';
import { defaultRegistryDir } from '../src/loader/index.js';
import { parseCard } from '../src/schema/card.js';
import { parseRite } from '../src/schema/rite.js';
import { findLoreWords } from './emitters/fixtures.js';
import { makeTree, removeTree } from './helpers.js';

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) removeTree(cleanups.pop()!);
});

const OPTS = { version: '0.0.0-test' };
const registry = defaultRegistryDir();

describe('the shipped registry', () => {
  it('contains only valid cards', () => {
    const dir = join(registry, 'cards');
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const card = parseCard(readFileSync(join(dir, file), 'utf8'), file);
      expect(card.meta.id.length).toBeGreaterThan(0);
    }
  });

  it('contains only valid rites, organized by suit', () => {
    const dir = join(registry, 'rites');
    let count = 0;
    for (const suit of readdirSync(dir)) {
      for (const file of readdirSync(join(dir, suit))) {
        parseRite(readFileSync(join(dir, suit, file), 'utf8'), file, suit);
        count += 1;
      }
    }
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('installs the default deck under budget with a clean check', () => {
    const root = makeTree({});
    cleanups.push(root);
    const summary = runInit(root, OPTS);
    expect(summary.budget.ok).toBe(true);
    expect(summary.written).toContain('CLAUDE.md');
    // core + 6 card refs + 4 rite refs + precepts + 3 rules (hermit/strength/devil
    // globs) + 4 skills + 4 audit agents (hermit/justice/strength/devil at pre-pr)
    // + 4 hook files + settings.json
    expect(summary.written.length).toBe(28);
    expect(runCheck(root, OPTS).ok).toBe(true);
  });

  it('emits no lore vocabulary anywhere in the default emission', () => {
    const root = makeTree({});
    cleanups.push(root);
    const summary = runInit(root, OPTS);
    for (const path of summary.written) {
      const content = readFileSync(join(root, path), 'utf8');
      expect(findLoreWords(content), path).toEqual([]);
    }
  });

  it('keeps the default core comfortably under budget with headroom to grow', () => {
    const root = makeTree({});
    cleanups.push(root);
    const summary = runInit(root, OPTS);
    expect(summary.budget.lines).toBeLessThanOrEqual(80);
  });

  it('lists the default deck', () => {
    const root = makeTree({});
    cleanups.push(root);
    runInit(root, OPTS);
    const out = runList(root, OPTS);
    expect(out).toContain('Deck: 6 card(s), 4 rite(s), 7 conduct binding(s)');
    expect(out).toContain('hermit (The Hermit, security)');
    expect(out).toContain('justice (Justice, correctness)');
    expect(out).toContain('hierophant (The Hierophant, convention)');
    expect(out).toContain('temperance (Temperance, proportion)');
    expect(out).toContain('strength (Strength, resilience)');
    expect(out).toContain('devil (The Devil, abuse resistance) — globs:');
    expect(out).toContain('moments: pre-pr (audit)');
    expect(out).toContain('migration (pentacles)');
    expect(out).toContain('bugfix (swords)');
    expect(out).toContain('refactor (swords)');
    expect(out).toContain('dependency (wands)');
  });
});
