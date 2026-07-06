export const MOMENTS = [
  'task-start',
  'pre-commit',
  'pre-push',
  'pre-pr',
  'post-implementation',
  'stalled',
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

/**
 * How hard a persona is applied at a moment — the axis the community tunes.
 * A persona (card) is the same in both; only the intensity differs.
 * - review: read-only pass; the working agent self-reviews against the
 *   checklist in context. Cheap.
 * - audit: the persona is dispatched as an isolated subagent that tries to
 *   break the change and may run it to prove a break. Expensive.
 */
export const MODES = ['review', 'audit'] as const;
export type Mode = (typeof MODES)[number];

/**
 * The default intensity for each moment — the community-tunable rules. The one
 * we are convinced of now: opening a pull request is an adversarial-audit
 * moment. A deck can override any binding's mode.
 */
export const MOMENT_DEFAULT_MODE: Record<Moment, Mode> = {
  'task-start': 'review',
  'pre-commit': 'review',
  'pre-push': 'review',
  'pre-pr': 'audit',
  'post-implementation': 'review',
  // A self-monitored condition, not a git event — reflective, always review.
  stalled: 'review',
};

/** A moment vigil resolved to an intensity. */
export interface MomentBinding {
  at: Moment;
  mode: Mode;
}

/** A moment vigil as authored: a bare moment (uses the default mode) or an override. */
export type MomentSpec = Moment | { at: Moment; mode: Mode };

export function normalizeMoment(spec: MomentSpec): MomentBinding {
  return typeof spec === 'string' ? { at: spec, mode: MOMENT_DEFAULT_MODE[spec] } : spec;
}

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
  stalled: 'When a task stops converging',
};

/**
 * Resolved vigils. Globs and changes are review-only (they fire often; an
 * expensive audit there would be punishing). Moments carry an intensity.
 */
export interface Vigils {
  globs: string[];
  moments: MomentBinding[];
  changes: ChangeType[];
}
