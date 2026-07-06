export const MOMENTS = [
  'task-start',
  'pre-commit',
  'pre-push',
  'pre-pr',
  'post-implementation',
] as const;
export type Moment = (typeof MOMENTS)[number];

export const CHANGE_TYPES = [
  'schema',
  'dependency-add',
  'dependency-update',
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

export const TOOL_PROFILES = ['read-only', 'execute', 'default'] as const;
export type ToolProfile = (typeof TOOL_PROFILES)[number];

/**
 * review — works through a checklist against the change.
 * adversarial — tries to break the change; findings need reproductions.
 */
export const POSTURES = ['review', 'adversarial'] as const;
export type Posture = (typeof POSTURES)[number];

/**
 * Lore severity names are human-facing only; agent-facing text uses these
 * plain labels ("lore for humans, plain language for the agent").
 */
export const SEVERITY_LABELS: Record<Severity, string> = {
  whisper: 'note',
  omen: 'minor issue',
  portent: 'must-fix',
  doom: 'blocker',
};

/** Agent-facing behavior contract for each severity, compiled into checklists and the core. */
export const SEVERITY_CONTRACT: Record<Severity, string> = {
  whisper: 'mention it in your summary; do not act on it',
  omen: 'fix it if the fix is cheap and local, otherwise flag it',
  portent: 'fix it before declaring the work done',
  doom: 'stop and ask the user before proceeding',
};

/** Plain-language phrases for change types, used in routing lines and triggers. */
export const CHANGE_TYPE_PHRASES: Record<ChangeType, string> = {
  schema: 'changing a database schema',
  'dependency-add': 'adding a new dependency',
  'dependency-update': 'updating a dependency',
  'api-public': 'changing a public API',
  config: 'changing configuration files',
  bugfix: 'fixing a bug',
  refactor: 'refactoring existing code',
};

/** Plain-language phrases for moments, used in routing lines. */
export const MOMENT_PHRASES: Record<Moment, string> = {
  'task-start': 'At the start of a new task',
  'pre-commit': 'Before each commit',
  'pre-push': 'Before pushing',
  'pre-pr': 'Before opening a pull request',
  'post-implementation': 'After finishing an implementation, before presenting it',
};

export interface Vigils {
  globs: string[];
  moments: Moment[];
  changes: ChangeType[];
}

export const EMPTY_VIGILS: Vigils = { globs: [], moments: [], changes: [] };
