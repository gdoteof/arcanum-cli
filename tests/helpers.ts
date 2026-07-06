import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Create a temp directory populated with the given relative-path → content tree. */
export function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'arcana-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export const VALID_CARD = `---
id: hermit
arcanum: 9
title: The Hermit
domain: security
default_vigils:
  globs: ["**/auth/**"]
  moments: [pre-commit]
  changes: [dependency-add]
severity_default: portent
requires_isolation: preferred
model_hint: strong
tools: read-only
---
You are reviewing a code diff as a security auditor.

- Check for hardcoded credentials.
`;

export const VALID_RITE = `---
id: migration
title: The Migration
trigger: Use when making any database schema change, migration, or altering table structure.
default_bind:
  change_types: [schema]
---
Follow this workflow for schema changes.

1. Write the migration.
`;

export const VALID_DECK = `version: 1
enforcement:
  claude_hooks: true
  git_hooks: false
cards:
  - id: hermit
rites:
  - id: migration
bindings:
  conduct:
    - text: "Never commit credentials, tokens, or secrets."
      critical: true
    - text: "All public API changes are versioned and documented."
`;

export const VALID_PRECEPTS = `# Working principles

- Prefer the simplest change that solves the problem.
`;
