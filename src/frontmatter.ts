import { parse as parseYaml } from 'yaml';
import { ArcanaError } from './errors.js';

export interface FrontmatterFile {
  data: unknown;
  body: string;
}

/**
 * Split a markdown file into YAML frontmatter and body. The file must begin
 * with a `---` fence on the first line and contain a closing `---` fence.
 */
export function parseFrontmatter(text: string, filePath: string): FrontmatterFile {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new ArcanaError(`${filePath}: expected YAML frontmatter starting with "---" on line 1`);
  }
  const closeIndex = normalized.indexOf('\n---', 4);
  const isFence = (i: number) => normalized[i + 4] === '\n' || i + 4 === normalized.length;
  let at = closeIndex;
  while (at !== -1 && !isFence(at)) {
    at = normalized.indexOf('\n---', at + 1);
  }
  if (at === -1) {
    throw new ArcanaError(`${filePath}: frontmatter is missing its closing "---" fence`);
  }
  const raw = normalized.slice(4, at + 1);
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (err) {
    throw new ArcanaError(
      `${filePath}: frontmatter is not valid YAML (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const body = normalized.slice(at + 5).replace(/^\n+/, '');
  return { data, body };
}
