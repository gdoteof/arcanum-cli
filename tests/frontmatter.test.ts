import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('splits frontmatter and body', () => {
    const { data, body } = parseFrontmatter('---\nid: x\n---\nBody here.\n', 'f.md');
    expect(data).toEqual({ id: 'x' });
    expect(body).toBe('Body here.\n');
  });

  it('normalizes CRLF line endings', () => {
    const { data, body } = parseFrontmatter('---\r\nid: x\r\n---\r\nBody.\r\n', 'f.md');
    expect(data).toEqual({ id: 'x' });
    expect(body).toBe('Body.\n');
  });

  it('accepts a closing fence at end of file', () => {
    const { data, body } = parseFrontmatter('---\nid: x\n---', 'f.md');
    expect(data).toEqual({ id: 'x' });
    expect(body).toBe('');
  });

  it('skips --- sequences that are not fences', () => {
    const text = '---\nid: x\n---resembles: fence\n---\nBody.\n';
    const { data, body } = parseFrontmatter(text, 'f.md');
    expect(data).toMatchObject({ id: 'x', '---resembles': 'fence' });
    expect(body).toBe('Body.\n');
  });

  it('rejects a file without an opening fence', () => {
    expect(() => parseFrontmatter('id: x\n', 'f.md')).toThrow(/expected YAML frontmatter/);
  });

  it('rejects a file without a closing fence', () => {
    expect(() => parseFrontmatter('---\nid: x\n', 'f.md')).toThrow(/missing its closing/);
  });

  it('rejects invalid YAML in the frontmatter', () => {
    expect(() => parseFrontmatter('---\n[unclosed\n---\nBody\n', 'f.md')).toThrow(
      /not valid YAML/,
    );
  });

  it('includes the file path in errors', () => {
    expect(() => parseFrontmatter('nope', 'cards/hermit.md')).toThrow(/cards\/hermit\.md/);
  });
});
