import { describe, expect, it } from 'vitest';
import { hookGroups } from '../../src/emitters/claude/hooks.js';
import { mergeSettings, settingsUpToDate } from '../../src/emitters/claude/settings.js';

const GROUPS = hookGroups();

describe('mergeSettings', () => {
  it('creates settings from nothing', () => {
    const merged = mergeSettings(undefined, GROUPS);
    expect(JSON.parse(merged)).toEqual({ hooks: { PreToolUse: GROUPS } });
    expect(merged.endsWith('\n')).toBe(true);
  });

  it('preserves unrelated keys and user hook groups', () => {
    const existing = JSON.stringify({
      model: 'opus',
      permissions: { allow: ['Bash(npm test)'] },
      hooks: {
        PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier' }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-hook.sh' }] }],
      },
    });
    const merged = JSON.parse(mergeSettings(existing, GROUPS));
    expect(merged.model).toBe('opus');
    expect(merged.permissions).toEqual({ allow: ['Bash(npm test)'] });
    expect(merged.hooks.PostToolUse).toHaveLength(1);
    expect(merged.hooks.PreToolUse).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-hook.sh' }] },
      ...GROUPS,
    ]);
  });

  it('is idempotent', () => {
    const once = mergeSettings(undefined, GROUPS);
    expect(mergeSettings(once, GROUPS)).toBe(once);
  });

  it('replaces outdated arcana-owned groups instead of duplicating them', () => {
    const outdated = JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'node .claude/arcana/bin/old-gate.mjs' }],
          },
        ],
      },
    });
    const merged = JSON.parse(mergeSettings(outdated, GROUPS));
    expect(merged.hooks.PreToolUse).toEqual(GROUPS);
  });

  it('removes owned groups and empty containers when hooks are disabled', () => {
    const withOurs = mergeSettings(undefined, GROUPS);
    const merged = mergeSettings(withOurs, []);
    expect(JSON.parse(merged)).toEqual({});
  });

  it('keeps user groups when removing ours', () => {
    const existing = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] },
          ...GROUPS,
        ],
      },
    });
    const merged = JSON.parse(mergeSettings(existing, []));
    expect(merged.hooks.PreToolUse).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] },
    ]);
  });

  it('rejects invalid JSON with an actionable error', () => {
    expect(() => mergeSettings('{oops', GROUPS)).toThrow(/not valid JSON/);
  });

  it('rejects non-object settings', () => {
    expect(() => mergeSettings('[1,2]', GROUPS)).toThrow(/JSON object/);
    expect(() => mergeSettings('null', GROUPS)).toThrow(/JSON object/);
    expect(() => mergeSettings('"text"', GROUPS)).toThrow(/JSON object/);
  });

  it('treats blank settings text like a missing file', () => {
    expect(mergeSettings('  \n', GROUPS)).toBe(mergeSettings(undefined, GROUPS));
  });

  it('preserves malformed or empty hook groups it cannot claim', () => {
    const existing = JSON.stringify({
      hooks: {
        PreToolUse: [
          'just a string',
          { matcher: 'Bash' },
          { matcher: 'Bash', hooks: [] },
          { matcher: 'Bash', hooks: [{ type: 'command' }] },
          { matcher: 'Bash', hooks: [42] },
        ],
      },
    });
    const merged = JSON.parse(mergeSettings(existing, []));
    expect(merged.hooks.PreToolUse).toHaveLength(5);
  });

  it('never treats a user hook that mentions arcana in prose as owned', () => {
    const existing = JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo arcana' }] }],
      },
    });
    const merged = JSON.parse(mergeSettings(existing, []));
    expect(merged.hooks.PreToolUse).toHaveLength(1);
  });
});

describe('settingsUpToDate', () => {
  it('is true only when owned groups exactly match the emission', () => {
    expect(settingsUpToDate(undefined, [])).toBe(true);
    expect(settingsUpToDate(undefined, GROUPS)).toBe(false);
    expect(settingsUpToDate(mergeSettings(undefined, GROUPS), GROUPS)).toBe(true);
    expect(settingsUpToDate(mergeSettings(undefined, GROUPS), [])).toBe(false);
  });

  it('is false for unparseable settings', () => {
    expect(settingsUpToDate('{oops', GROUPS)).toBe(false);
  });
});
