import { ArcanaError } from '../errors.js';
import { buildCatalog, type Project } from '../loader/index.js';
import { auditCards, emitAgents } from '../emitters/claude/agents.js';
import { emitCore } from '../emitters/claude/core.js';
import { emitEditSkill } from '../emitters/claude/edit-skill.js';
import {
  emitHooks,
  gatedBindingTexts,
  gateEntries,
  hookGroups,
  type HookGroup,
} from '../emitters/claude/hooks.js';
import { emitReference, type EmittedFile } from '../emitters/claude/reference.js';
import { emitRules } from '../emitters/claude/rules.js';
import { emitSkills } from '../emitters/claude/skills.js';
import { checkBudget, formatOverageReport, type BudgetReport } from './budget.js';
import { stamp, type StampStyle } from './hash.js';

export interface BuildOutput {
  /** Stamped files, sorted by path. Byte-identical for identical inputs. */
  files: EmittedFile[];
  budget: BudgetReport;
  /** Hook groups to merge into .claude/settings.json (empty when hooks are off). */
  settingsGroups: HookGroup[];
}

export interface CompileOptions {
  version: string;
}

function stampStyle(path: string): StampStyle {
  return path.endsWith('.mjs') ? 'js' : 'html';
}

export function compile(project: Project, options: CompileOptions): BuildOutput {
  const { version } = options;
  // Hooks are emitted only when enabled AND there is something to enforce.
  const hooksEnabled =
    project.deck.enforcement.claude_hooks &&
    (gateEntries(project).length > 0 ||
      gatedBindingTexts(project).size > 0 ||
      project.deck.enforcement.protected_branches.length > 0);
  const hasAudits = auditCards(project).length > 0;
  const hasSynthesis = project.cards.some((c) =>
    c.vigils.moments.some((m) => m.at === 'synthesis'),
  );
  const gatedTexts = hooksEnabled ? gatedBindingTexts(project) : new Set<string>();

  const core = stamp(emitCore(project, { version, gatedTexts, hasAudits, hasSynthesis }));
  const budget = checkBudget(core);
  if (!budget.ok) {
    throw new ArcanaError(formatOverageReport(budget));
  }

  const catalog = buildCatalog(project.root, { registryDir: project.registryDir });

  const files: EmittedFile[] = [
    { path: 'CLAUDE.md', content: core },
    ...[
      ...emitReference(project, version),
      ...emitRules(project, version),
      ...emitSkills(project, version),
      ...emitAgents(project, version),
      emitEditSkill(catalog, version),
      ...(hooksEnabled ? emitHooks(project, version) : []),
    ].map((f) => ({ ...f, content: stamp(f.content, stampStyle(f.path)) })),
  ];
  files.sort((a, b) => (a.path < b.path ? -1 : 1)); // paths are unique by construction
  return { files, budget, settingsGroups: hooksEnabled ? hookGroups() : [] };
}
