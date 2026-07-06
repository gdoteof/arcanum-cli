export const MOMENTS = ['task-start', 'pre-commit', 'pre-push', 'pre-pr'] as const;
export type Moment = (typeof MOMENTS)[number];

export const CHANGE_TYPES = [
  'schema',
  'dependency-add',
  'api-public',
  'config',
  'bugfix',
  'refactor',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const SEVERITIES = ['whisper', 'omen', 'portent', 'doom'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SUITS = ['wands', 'cups', 'swords', 'pentacles'] as const;
export type Suit = (typeof SUITS)[number];

export const MODEL_HINTS = ['strong', 'cheap'] as const;
export type ModelHint = (typeof MODEL_HINTS)[number];

export const TOOL_PROFILES = ['read-only', 'default'] as const;
export type ToolProfile = (typeof TOOL_PROFILES)[number];

/** Agent-facing behavior contract for each severity, compiled into checklists and the core. */
export const SEVERITY_CONTRACT: Record<Severity, string> = {
  whisper: 'note it in your summary; do not act on it',
  omen: 'fix it if the fix is cheap and local, otherwise flag it',
  portent: 'fix it before declaring the work done',
  doom: 'stop and ask the user before proceeding',
};

export interface Vigils {
  globs: string[];
  moments: Moment[];
  changes: ChangeType[];
}

export const EMPTY_VIGILS: Vigils = { globs: [], moments: [], changes: [] };
