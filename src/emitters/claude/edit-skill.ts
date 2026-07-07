import { generatorNotice } from '../../compiler/hash.js';
import type { Catalog } from '../../loader/index.js';
import {
  CHANGE_TYPES,
  CHANGE_TYPE_PHRASES,
  MODES,
  MOMENTS,
  MOMENT_DEFAULT_MODE,
  MOMENT_PHRASES,
} from '../../types.js';
import { BUDGET_LINES } from '../../compiler/budget.js';
import type { EmittedFile } from './reference.js';

export const EDIT_SKILL_PATH = '.claude/skills/arcana-edit/SKILL.md';

const DESCRIPTION =
  'Use when the user wants to change how Arcana behaves in this repository — e.g. ' +
  '"make arcana do X", add, remove, or tune a reviewer or workflow, change when a ' +
  'review or audit runs, or adjust branch-protection or pull-request policy. Edits ' +
  'deck.yaml, rebuilds, and shows the diff.';

/**
 * The self-editing surface: a Claude Code skill (slash-invocable as /arcana-edit,
 * and auto-triggered by its description) that teaches the agent to translate a
 * natural-language request into a deck.yaml change and rebuild. Generated with the
 * actual available cards/rites and vocabulary so the agent edits against real
 * options rather than hallucinated ones. deck.yaml stays the reviewed source of
 * truth — the change lands as a diff the user confirms.
 */
export function emitEditSkill(catalog: Catalog, version: string): EmittedFile {
  const cardList =
    catalog.cards.length > 0
      ? catalog.cards.map((c) => `- \`${c.id}\` — ${c.domain}`)
      : ['- (none found)'];
  const riteList =
    catalog.rites.length > 0
      ? catalog.rites.map((r) => `- \`${r.id}\` — ${r.trigger}`)
      : ['- (none found)'];
  const momentList = MOMENTS.map(
    (m) => `- \`${m}\` — ${MOMENT_PHRASES[m].toLowerCase()} (default mode: \`${MOMENT_DEFAULT_MODE[m]}\`)`,
  );
  const changeList = CHANGE_TYPES.map((c) => `- \`${c}\` — ${CHANGE_TYPE_PHRASES[c]}`);

  const body = [
    '---',
    'name: arcana-edit',
    `description: "${DESCRIPTION.replace(/"/g, '\\"')}"`,
    '---',
    generatorNotice(version),
    '',
    "# Change how Arcana behaves in this repository",
    '',
    "This repository's review behavior is compiled from `deck.yaml`. To change what",
    'runs, when it runs, or the project policy, edit `deck.yaml` and rebuild. Never',
    'hand-edit the generated files (`CLAUDE.md`, `arcana/`, `.claude/`) — they are',
    'overwritten on every build.',
    '',
    '## Workflow',
    '',
    '1. Read the current `deck.yaml`.',
    "2. Translate the user's request into the smallest change to `deck.yaml`.",
    '3. Show the proposed diff and confirm it with the user before applying it.',
    '4. Run `npx arcanum-cli build`, then `npx arcanum-cli check`.',
    '5. Report what changed in the emission. If the build fails the always-on budget',
    `   (the core must stay ≤${BUDGET_LINES} lines), say so and propose what to trim.`,
    '',
    'If the request needs a reviewer or workflow that does not exist yet, offer to',
    'author a new one (see "Adding a new reviewer or workflow" below) rather than',
    'forcing an ill-fitting existing one.',
    '',
    '## deck.yaml shape',
    '',
    '```yaml',
    'version: 1',
    'preamble: src/preamble.md        # optional: a file of always-on project notes',
    'enforcement:',
    '  claude_hooks: true',
    '  protected_branches: []         # e.g. [main] — steer changes onto branches + PRs',
    'pull_requests:',
    '  require_audit: false           # state "run the audits before a PR" in the core',
    '  agent_may_merge: false         # may the agent merge a PR it has audited and trusts?',
    'cards:                           # reviewers to enable (by id)',
    '  - id: hermit',
    '  - id: hermit                   # override a binding per-key:',
    '    vigils:',
    '      moments:',
    '        - { at: pre-pr, mode: review }',
    'rites:                           # workflows to enable (by id)',
    '  - id: migration',
    'bindings:',
    '  conduct:                       # hard one-line rules inlined in the core',
    '    - text: "Never commit credentials, tokens, or secrets."',
    '      critical: true',
    '```',
    '',
    '## Available reviewers — add by `id` under `cards:`',
    '',
    ...cardList,
    '',
    '## Available workflows — add by `id` under `rites:`',
    '',
    ...riteList,
    '',
    '## When things fire (moments)',
    '',
    ...momentList,
    '',
    `A binding runs in one of two modes — ${MODES.map((m) => `\`${m}\``).join(' or ')}. \`review\` is a`,
    'cheap read-only, in-context pass; `audit` dispatches an isolated agent that tries',
    'to break the change. A moment uses its default mode unless a binding overrides it',
    'with `{ at: <moment>, mode: <mode> }`. Path (`globs`) and change-type bindings are',
    'always `review`.',
    '',
    '## Change types — for `changes:` bindings and workflow triggers',
    '',
    ...changeList,
    '',
    '## Adding a new reviewer or workflow',
    '',
    'Create `src/cards/<id>.md` (a reviewer) or `src/rites/<suit>/<id>.md` (a workflow)',
    'with the right frontmatter and a plain-language checklist body — no persona',
    'role-play, just the concrete questions and steps. Add its `id` to `deck.yaml` and',
    'rebuild. Local `src/` sources override the registry, so you can also shadow a',
    'built-in one by giving it the same id.',
    '',
    '## Keep it light',
    '',
    'Everything always-on costs context. Prefer `review` mode and path/moment scoping',
    'over always-on weight, keep conduct rules to sharp one-liners, and only reach for',
    '`audit` where breaking the change is genuinely worth the extra time. `deck.yaml`',
    'is the source of truth: every change must be a diff the user can see and undo.',
  ].join('\n');

  return { path: EDIT_SKILL_PATH, content: `${body}\n` };
}
