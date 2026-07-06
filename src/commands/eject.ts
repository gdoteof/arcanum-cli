import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripStamp } from '../compiler/hash.js';
import { ownedFiles } from './build.js';

export interface EjectSummary {
  ejected: string[];
}

/**
 * The trust story (§7, §10): strip hashes and generator notices from every
 * generated file so the emission is plain markdown/scripts the team owns.
 * Everything keeps working — settings.json hook entries and the vendored
 * scripts they call stay in place; only arcana's ownership markers go.
 */
export function runEject(root: string): EjectSummary {
  const ejected: string[] = [];
  for (const rel of ownedFiles(root)) {
    const abs = join(root, rel);
    writeFileSync(abs, stripStamp(readFileSync(abs, 'utf8')));
    ejected.push(rel);
  }
  return { ejected };
}
