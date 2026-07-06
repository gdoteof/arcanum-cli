import { generatorNotice } from '../../compiler/hash.js';
import type { Project } from '../../loader/index.js';
import { cardRoutingLines, riteRoutingLine, severityContractLines } from './shared.js';

export interface CoreOptions {
  version: string;
  /** Conduct binding texts that have an emitted hook mirror; marked as enforced. */
  gatedTexts: ReadonlySet<string>;
  /** True when any vigil is bound in audit mode; adds the clean-room contract. */
  hasAudits: boolean;
}

/**
 * The always-on core (§6): conduct bindings, routing summaries, severity
 * contract. No checklists, ever — bodies live under arcana/ and load lazily.
 */
export function emitCore(project: Project, options: CoreOptions): string {
  const parts: string[] = [generatorNotice(options.version), '', '# Working agreement', ''];
  parts.push(
    'This is the always-on core of how to work in this repository. The detailed',
    'checklists and workflows it references live under arcana/ — read them when',
    'a rule below says to, not preemptively.',
  );

  const conduct = project.deck.bindings.conduct;
  if (conduct.length > 0) {
    parts.push('', '## Conduct', '');
    for (const binding of conduct) {
      const gate = options.gatedTexts.has(binding.text) ? ' (a commit gate enforces this)' : '';
      parts.push(`- ${binding.text}${gate}`);
    }
    parts.push(
      '',
      'These rules are hard. If one conflicts with what you are asked to do, stop',
      'and surface the conflict — do not break the rule.',
    );
  }

  parts.push(
    '',
    '## Working principles',
    '',
    'Before starting a non-trivial task, read arcana/precepts.md and follow it.',
  );

  if (project.rites.length > 0) {
    parts.push('', '## Required workflows', '');
    for (const rite of project.rites) {
      parts.push(riteRoutingLine(rite));
    }
  }

  if (project.cards.length > 0) {
    parts.push('', '## Required reviews and audits', '');
    for (const card of project.cards) {
      parts.push(...cardRoutingLines(card));
    }
    const synthesis = options.hasAudits
      ? [
          'When several reviews or audits apply to the same change, run their agents',
          'in parallel where available, then reconcile the findings into one verdict',
          'with clear priorities — not a pile of contradictions.',
        ]
      : [
          'When several reviews apply to the same change, reconcile their findings and',
          'present one verdict with clear priorities — not a pile of contradictions.',
        ];
    parts.push(
      '',
      'Reviews and audits report findings at four severities; act on them as follows:',
      '',
      ...severityContractLines(),
      '',
      ...synthesis,
    );
    if (options.hasAudits) {
      parts.push(
        '',
        'An audit is a review run at higher intensity: the same reviewer, dispatched',
        'to an isolated agent that tries to break the change and may run it to prove',
        'a break. When you dispatch one, hand it only the diff and the task statement',
        '— never your own reasoning, plan, or why you think the code is correct. Its',
        'value is the clean-room view; do not contaminate it. Treat every',
        'reproduction it returns as real until you have disproven it.',
      );
    }
  }

  return `${parts.join('\n')}\n`;
}
