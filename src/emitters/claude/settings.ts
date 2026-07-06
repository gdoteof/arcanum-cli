import { ArcanaError } from '../../errors.js';
import type { HookGroup } from './hooks.js';

export const SETTINGS_PATH = '.claude/settings.json';

/** A hook group is arcana-owned iff every command in it runs a vendored arcana script. */
const OWNERSHIP_MARKER = '.claude/arcana/';

type HookEvent = Record<string, unknown[]>;
interface Settings {
  hooks?: HookEvent;
  [key: string]: unknown;
}

function isOwned(group: unknown): boolean {
  if (typeof group !== 'object' || group === null) return false;
  const hooks = (group as { hooks?: unknown }).hooks;
  if (!Array.isArray(hooks) || hooks.length === 0) return false;
  return hooks.every(
    (h) =>
      typeof h === 'object' &&
      h !== null &&
      typeof (h as { command?: unknown }).command === 'string' &&
      ((h as { command: string }).command.includes(OWNERSHIP_MARKER)),
  );
}

function parseSettings(existing: string | undefined): Settings {
  if (existing === undefined || existing.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch (err) {
    // JSON.parse only ever throws SyntaxError
    throw new ArcanaError(
      `${SETTINGS_PATH} is not valid JSON (${(err as Error).message}) — fix it before building`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ArcanaError(`${SETTINGS_PATH} must contain a JSON object`);
  }
  return parsed as Settings;
}

/**
 * Merge arcana's PreToolUse hook groups into settings.json without touching
 * anything else: replace previously-owned groups, preserve user groups and
 * every other key. Idempotent.
 */
export function mergeSettings(existing: string | undefined, groups: HookGroup[]): string {
  const settings = parseSettings(existing);
  const hooks: HookEvent = (settings.hooks as HookEvent | undefined) ?? {};
  const current = Array.isArray(hooks['PreToolUse']) ? hooks['PreToolUse'] : [];
  const preserved = current.filter((group) => !isOwned(group));

  if (preserved.length > 0 || groups.length > 0) {
    hooks['PreToolUse'] = [...preserved, ...groups];
  } else {
    delete hooks['PreToolUse'];
  }
  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  } else {
    delete settings.hooks;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** True when the arcana-owned groups in settings.json exactly match the emission. */
export function settingsUpToDate(existing: string | undefined, groups: HookGroup[]): boolean {
  let settings: Settings;
  try {
    settings = parseSettings(existing);
  } catch {
    return false;
  }
  const current = Array.isArray(settings.hooks?.['PreToolUse'])
    ? settings.hooks['PreToolUse']
    : [];
  const owned = current.filter((group) => isOwned(group));
  return JSON.stringify(owned) === JSON.stringify(groups);
}
